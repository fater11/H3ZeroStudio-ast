"""Segment-by-segment MiniMax H3 generation for H3ZeroStudio.

Continuity ("extend") follows the proven sequential mode of ComfyUI-H3-WindowedRefine (same author):
segment k>=2 starts with the last 5o+2 latent frames of segment k-1 (an aligned 17o+5 frame clip),
which is
  * given to H3 as a native clip keyframe at frame 0 (conditioning "minimax_keyframes", like MiniMaxH3AddGuide),
  * locked in the predicted x0 on every step (the sampler converges exactly onto the finished frames),
and the previous segment's decoded last frame is added as one more <Picture N> reference.
"""
import hashlib
import json
import math
import os
import threading
import zipfile
import time
import weakref
from collections import OrderedDict
from contextlib import contextmanager

import numpy as np
import torch

import comfy.model_management
import comfy.nested_tensor
import comfy.sample
import comfy.utils
import node_helpers

from .h3s_cache_validation import InvalidLatentCache, load_av_cache
from . import h3s_core as core
from . import h3s_media as media
from . import h3s_atomic as atomic
from . import h3s_monitor as monitor
from . import h3s_preview as preview
from . import h3s_upscale as upscale
from . import h3s_control as control
from . import h3s_voice as voice

CTL_RUN = {"warn": None, "info": {}}   # v6k ControlNet: per-run warning sink + what each sampled segment got
PIFLOW_RUN = {"frames": {}}             # DWD pixels from the latest pi-H3 sample; never persisted as a latent

LOG = "[H3ZS]"


def log(msg):
    line = f"{LOG} {msg}"
    try:
        monitor.record_log(line)
    except Exception:
        pass
    try:
        print(line, flush=True)
    except UnicodeEncodeError:   # legacy console code page: keep the line, lose the glyphs
        print(line.replace("█", "#").replace("░", "-").replace("σ", "sigma").replace("Δ", "delta")
              .encode("ascii", "replace").decode("ascii"), flush=True)


VERBOSE = [True]   # settings.verbose_log of the running project


def vlog(msg):
    if VERBOSE[0]:
        log(msg)


def vram():
    try:
        if torch.cuda.is_available():
            free, tot = torch.cuda.mem_get_info()   # the whole device (ComfyUI's models included)
            return f"VRAM {(tot - free) / 2 ** 30:.1f}/{tot / 2 ** 30:.1f} GB"
    except Exception:
        pass
    return ""


def ram():
    """Resident RAM of the ComfyUI process, for the per-segment log (a growing number = frames piling up)."""
    try:
        import psutil
        return f"RAM {psutil.Process().memory_info().rss / 2 ** 30:.1f} GB"
    except Exception:
        return ""


def cat_release(parts):
    """torch.cat along dim 0 that drops every part as soon as it is copied: peak memory is about one copy of the
    result instead of parts + result (2x). `parts` is emptied in place (entries -> None); returns (tensor, lengths)."""
    n = sum(int(p.shape[0]) for p in parts)
    head = parts[0]
    out = torch.empty((n,) + tuple(head.shape[1:]), dtype=head.dtype, device=head.device)
    lens, at = [], 0
    for k in range(len(parts)):
        p = parts[k]
        m = int(p.shape[0])
        out[at:at + m] = p
        at += m
        lens.append(m)
        parts[k] = None
        del p
    return out, lens


def cat_to_disk(parts, path):
    """Stitch decoded frames into an on-disk mapped tensor; never allocate full video in RAM.

    File is intentionally kept until the final MP4 is encoded. A partial file is
    removed by the caller on failure where possible.
    """
    n = sum(int(p.shape[0]) for p in parts)
    head = parts[0]
    shape = (n,) + tuple(head.shape[1:])
    if head.device.type != "cpu":
        raise ValueError("Потоковая сборка требует CPU-кадры")
    count = int(math.prod(shape))
    with open(path, "wb") as f:
        f.truncate(count * head.element_size())
    out = torch.from_file(path, shared=True, size=count, dtype=head.dtype).reshape(shape)
    lens, at = [], 0
    for k, part in enumerate(parts):
        m = int(part.shape[0])
        out[at:at + m].copy_(part)
        at += m
        lens.append(m)
        parts[k] = None
        del part
    return out, lens


def cat_disk_latents(parts, dim):
    """Concatenate cached AV parts with one output allocation, not a second list of tensors."""
    if not len(parts):
        raise ValueError("Cannot concatenate an empty latent chain")
    dim = dim % len(parts.shape(0))
    shape = list(parts.shape(0))
    shape[dim] = sum(parts.shape(i)[dim] for i in range(len(parts)))
    first = parts[0]
    result = torch.empty(tuple(shape), dtype=first.dtype, device="cpu")
    del first
    at = 0
    for i in range(len(parts)):
        part = parts[i]
        count = part.shape[dim]
        result.narrow(dim, at, count).copy_(part)
        at += count
        parts[i] = None
        del part
    return result


def text_bar(i, n, w=20):
    k = int(round(w * i / max(1, n)))
    return "█" * k + "░" * (w - k)


def fmt_s(x):
    x = max(0, int(round(x)))
    return f"{x // 60}:{x % 60:02d}" if x >= 60 else f"{x}s"


# ---------------------------------------------------------------- packing helpers (H3 flat AV pack)
def pack(video, audio):
    v = video.reshape(video.shape[0], 1, -1)
    a = audio.reshape(audio.shape[0], 1, -1)
    return torch.cat([v, a], dim=-1)


def unpack(x, shapes):
    vs, as_ = shapes
    n = math.prod(vs[1:])
    return x[:, :, :n].reshape([x.shape[0]] + list(vs[1:])), x[:, :, n:].reshape([x.shape[0]] + list(as_[1:]))


class LockWrapper:
    """model_function_wrapper: replaces predicted x0 in locked regions (overlap with the previous segment,
    and/or a locked soundtrack) with the given clean latents."""

    def __init__(self, lock_v=None, w_v=None, lock_a=None, w_a=None, probe=None):
        self.lock_v, self.w_v, self.lock_a, self.w_a = lock_v, w_v, lock_a, w_a
        self.probe = probe   # expected kept-audio frames: logs once what the DiT really receives
        self.calls = 0

    def __call__(self, apply_model, args):
        x, t, c = args["input"], args["timestep"], args["c"]
        out = apply_model(x, t, **c)
        shapes = c.get("latent_shapes")
        self.calls += 1
        if self.probe is not None and self.calls == 1:
            try:
                adm = c.get("audio_denoise_mask")
                pay = c.get("minimax_payload") or {}
                if adm is None:
                    log(f"  [audio-probe] WARNING: the model got NO audio_denoise_mask — the kept audio is not conditioned")
                else:
                    m = adm.reshape(-1, adm.shape[-1])[0].float()
                    log(f"  [audio-probe] model got audio_denoise_mask {tuple(adm.shape)}: {int((m < 0.5).sum())} kept / {m.numel()} frames "
                        f"(expected {self.probe}); cond audio rows: {len(pay.get('cond_audio_latents') or [])}; audio_scale {float(pay.get('audio_scale', 1.0)):.3f}")
            except Exception as e:
                log(f"  [audio-probe] failed: {e}")
        if shapes is None or len(shapes) != 2 or (self.lock_v is None and self.lock_a is None):
            return out
        ov, oa = unpack(out, shapes)
        ov, oa = ov.float(), oa.float()
        if self.lock_v is not None:
            w = self.w_v.to(ov.device).view(1, 1, -1, 1, 1)
            ov = ov * (1 - w) + self.lock_v.to(ov.device, ov.dtype) * w
        if self.lock_a is not None:
            w = self.w_a.to(oa.device)
            oa = oa * (1 - w) + self.lock_a.to(oa.device, oa.dtype) * w
        return pack(ov.to(out.dtype), oa.to(out.dtype))


def sampler_audio_scale(model):
    try:
        fn = getattr(model.model, "audio_scale", None)
        return float(fn()) if callable(fn) else 1.0
    except Exception:
        return 1.0


def apply_shift(model, shift_video, shift_audio):
    """Same as comfy_extras MiniMaxH3SigmaShift (ModelSamplingMiniMaxH3)."""
    import comfy.model_sampling
    m = model.clone()

    class ModelSamplingAdvanced(comfy.model_sampling.ModelSamplingAV, comfy.model_sampling.CONST):
        pass

    original = m.get_model_object("model_sampling")
    ms = ModelSamplingAdvanced(model.model.model_config)
    ms.set_parameters(shift=shift_video, audio_shift=shift_audio)
    if hasattr(original, "noise_scale"):
        ms.set_noise_scale(original.noise_scale)
    m.add_object_patch("model_sampling", ms)
    to = m.model_options["transformer_options"] = m.model_options.get("transformer_options", {}).copy()
    to["minimax_h3_sigma_shift_video"] = shift_video
    to["minimax_h3_sigma_shift_audio"] = shift_audio
    return m


# ---------------------------------------------------------------- conditioning
# Reference VAE latents are deterministic for a fixed source, canvas and VAE.
# Keep a bounded CPU-only cache for this one serialized run: no persistent CUDA
# tensors, no stale keys across projects/restarts, and no change to sampling.
_REF_VAE_LOCAL = threading.local()
_REF_VAE_MAX_BYTES = 128 * 1024 * 1024
_TEXT_COND_MAX_BYTES = 64 * 1024 * 1024
_AUDIO_REF_MAX_BYTES = 96 * 1024 * 1024


def _ref_source_stamp(path):
    st = os.stat(path)
    return (os.path.normcase(os.path.abspath(path)), st.st_size, st.st_mtime_ns)


@contextmanager
def _reference_vae_scope():
    old = getattr(_REF_VAE_LOCAL, "state", None)
    state = {
        "data": OrderedDict(), "bytes": 0, "hits": 0, "misses": 0,
        "text": OrderedDict(), "text_bytes": 0, "text_hits": 0,
        "audio": OrderedDict(), "audio_bytes": 0, "audio_hits": 0,
    }
    _REF_VAE_LOCAL.state = state
    try:
        yield
    finally:
        _REF_VAE_LOCAL.state = old
        if state["hits"]:
            log(f"  reference VAE cache: {state['hits']} reuse(s), {state['misses']} encode(s), "
                f"CPU cache {state['bytes'] / (1024 ** 2):.1f} MiB")
        if state["text_hits"] or state["audio_hits"]:
            log(f"  conditioning cache: text {state['text_hits']} reuse(s), "
                f"audio {state['audio_hits']} reuse(s); CPU "
                f"{(state['text_bytes'] + state['audio_bytes']) / (1024 ** 2):.1f} MiB")
        for name in ("data", "text", "audio"):
            state[name].clear()


def _encode_reference_vae(vae, frames, key=None):
    """Reuse only *unchanged* file-backed references. Unkeyed tensors use the original VAE path."""
    state = getattr(_REF_VAE_LOCAL, "state", None)
    if key is None or state is None:
        return vae.encode(frames)
    ck = (id(vae), key, tuple(frames.shape), str(frames.dtype))
    saved = state["data"].get(ck)
    if saved is not None:
        state["data"].move_to_end(ck)
        state["hits"] += 1
        cached, original_device = saved
        return cached.to(device=original_device).clone()
    encoded = vae.encode(frames)
    state["misses"] += 1
    if isinstance(encoded, torch.Tensor):
        nbytes = encoded.numel() * encoded.element_size()
        if nbytes <= _REF_VAE_MAX_BYTES:
            cpu = encoded.detach().to(device="cpu").clone().contiguous()
            while state["data"] and state["bytes"] + nbytes > _REF_VAE_MAX_BYTES:
                _, (evicted, _) = state["data"].popitem(last=False)
                state["bytes"] -= evicted.numel() * evicted.element_size()
            state["data"][ck] = (cpu, encoded.device)
            state["bytes"] += nbytes
    return encoded


def _resize(image, width, height):
    s = image[..., :3].movedim(-1, 1)
    return comfy.utils.common_upscale(s, width, height, "lanczos", "disabled").movedim(1, -1)


def ref_canvas(img, width, height, ref_size="match"):
    h, w = img.shape[1], img.shape[2]
    if ref_size == "max":
        scale = min(1.0, 2048 / min(w, h))
    else:
        scale = min(1.0, math.sqrt((width * height) / (w * h)))
    m = core.CANVAS_MULTIPLE
    return max(m, round(w * scale / m) * m), max(m, round(h * scale / m) * m)


def holder_cards(project, holder, vae, kind="full"):
    """«Персонажи» of a clip / region -> h3s_chars.card_parts lists, or None. kind "refine" (and the upscale pass)
    leaves video-kind looks out, as plain video references are (the prompt strips <Video N> there too)."""
    if not holder.get("cards"):
        return None
    from . import h3s_chars
    parts = h3s_chars.card_parts(project, holder["cards"], vae, kind)
    return parts if any(parts.values()) else None


def _pack_plain_conditioning(cond):
    """CPU-only copy of simple CLIP conditioning; reject opaque objects or multimodal metadata."""
    if not isinstance(cond, (list, tuple)):
        return None
    packed, nbytes = [], 0
    for row in cond:
        if not isinstance(row, (list, tuple)) or len(row) != 2 or not isinstance(row[0], torch.Tensor) or not isinstance(row[1], dict):
            return None
        fields = {}
        for key, value in row[1].items():
            if isinstance(value, torch.Tensor):
                fields[key] = (value.detach().cpu().clone(), value.device)
                nbytes += value.numel() * value.element_size()
            elif isinstance(value, (str, int, float, bool, type(None))):
                fields[key] = value
            else:
                return None
        t = row[0]
        nbytes += t.numel() * t.element_size()
        if nbytes > _TEXT_COND_MAX_BYTES:
            return None
        packed.append(((t.detach().cpu().clone(), t.device), fields))
    return packed, nbytes


def _restore_plain_conditioning(packed):
    out = []
    for (t, device), fields in packed:
        meta = {key: value[0].to(value[1]).clone() if isinstance(value, tuple) else value
                for key, value in fields.items()}
        out.append([t.to(device).clone(), meta])
    return out


def encode_cond(clip, vae, prompt, images, width, height, ref_size="match", ref_audios=None, ref_videos=None, cards=None, frame_images=None):
    """Same presentation as comfy_extras MiniMaxH3ReferenceToVideo: images, then videos, then standalone audio.
    ref_videos: frames [n,H,W,3] already on the reference canvas with n on the 17k+5 grid.
    cards: pre-encoded «Персонажи» (h3s_chars.card_parts) — each kind after the plain ones of that kind, so the
    plain refs keep their numbers and the cards continue them (h3s_core.card_labels)."""
    items, blocks = [], []
    cards = cards or {}
    for img in images:
        tw, th = ref_canvas(img, width, height, ref_size)
        resized = _resize(img[:1], tw, th)
        items.append({"type": "image", "data": resized})
        source = getattr(img, "_h3zs_source_stamp", None)
        cache_key = ("image", source, tw, th, "lanczos-stretch") if source else None
        blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16,
                       "latent": _encode_reference_vae(vae, resized, cache_key)})
    for item, block, _cid in cards.get("image", []):
        items.append(item)
        blocks.append(block)
    for fr in ref_videos or []:
        sample_idx = list(range(0, fr.shape[0], core.FPS // 2))   # the text encoder sees the video at 2 fps
        items.append({"type": "video", "data": fr[sample_idx], "timestamps": [k / 2.0 for k in range(len(sample_idx))]})
        source = getattr(fr, "_h3zs_source_stamp", None)
        z = _encode_reference_vae(vae, fr, ("video", source) if source else None)
        blocks.append({"kind": "video", "latent_t": z.shape[2], "latent_h": fr.shape[1] // 16, "latent_w": fr.shape[2] // 16,
                       "ref_audio_t": 0, "latent": z, "audio_latent": None})
    for item, block, _cid in cards.get("video", []):
        items.append(item)
        blocks.append(block)
    for ra in ref_audios or []:
        items.append({"type": "audio"})
        blocks.append({"kind": "audio", "ref_audio_t": ra.shape[-1], "audio_latent": ra})
    for item, block, _cid in cards.get("audio", []):
        items.append(item)
        blocks.append(block)
    # Only plain text has stable conditioning independent of images, cards and audio.
    # Do not cache multimodal encodings: their tensors change between segments.
    state = getattr(_REF_VAE_LOCAL, "state", None)
    plain_key = (id(clip), prompt) if state is not None and not items and not frame_images else None
    if plain_key is not None:
        saved = state["text"].get(plain_key)
        if saved is not None and saved[0]() is clip:
            state["text"].move_to_end(plain_key)
            state["text_hits"] += 1
            return _restore_plain_conditioning(saved[1])
    token_kwargs = {"minimax_ref_items": items} if items else {}
    if frame_images:
        token_kwargs["images"] = frame_images
    tokens = clip.tokenize(prompt, **token_kwargs)
    cond = clip.encode_from_tokens_scheduled(tokens)
    if plain_key is not None:
        packaged = _pack_plain_conditioning(cond)
        if packaged is not None:
            try:
                ref = weakref.ref(clip)
            except TypeError:
                ref = None
            if ref is not None:
                packed, nbytes = packaged
                if plain_key in state["text"]:
                    state["text_bytes"] -= state["text"].pop(plain_key)[2]
                while state["text"] and state["text_bytes"] + nbytes > _TEXT_COND_MAX_BYTES:
                    _, old = state["text"].popitem(last=False)
                    state["text_bytes"] -= old[2]
                state["text"][plain_key] = (ref, packed, nbytes)
                state["text_bytes"] += nbytes
    if blocks:
        cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": blocks})
    return cond


def kf_resize(img, width, height, crop):
    """«Кадры» keyframe onto the canvas. crop: "disabled" (stretch) / "center" (cover crop) — as MiniMaxH3ImageToVideo —
    or v6m "pad_blur" / "pad_black" (letterbox: the whole frame inside the canvas, the bars blurred or black)."""
    s = img[:1, ..., :3].movedim(-1, 1)
    if not str(crop).startswith("pad"):
        return comfy.utils.common_upscale(s, width, height, "lanczos", crop).movedim(1, -1)
    ih, iw = s.shape[-2:]
    k = min(width / iw, height / ih)
    fw, fh = max(1, min(width, round(iw * k))), max(1, min(height, round(ih * k)))
    inner = comfy.utils.common_upscale(s, fw, fh, "lanczos", "disabled")
    if crop == "pad_black":
        canvas = torch.zeros((1, s.shape[1], height, width), dtype=inner.dtype, device=inner.device)
    else:   # blurred cover of the same picture: tiny cover crop scaled back up, a little darker
        small = comfy.utils.common_upscale(s, max(1, width // 24), max(1, height // 24), "area", "center")
        canvas = comfy.utils.common_upscale(small, width, height, "bilinear", "disabled") * 0.6
    y0, x0 = (height - fh) // 2, (width - fw) // 2
    canvas[..., y0:y0 + fh, x0:x0 + fw] = inner
    return canvas.clamp(0, 1).movedim(1, -1)


KF_FIT_CROP = {"crop": ("center", "center"), "stretch": ("disabled", "disabled"), "legacy": ("disabled", "center")}


def kf_crops(fit, pad=""):
    """(first, last) crop modes of «Вписать кадр»; "legacy" = before v6m (first stretched, last cropped)."""
    if fit == "pad":
        return ("pad_black",) * 2 if pad == "black" else ("pad_blur",) * 2
    return KF_FIT_CROP.get(fit, KF_FIT_CROP["crop"])


def encode_cond_kf(clip, vae, prompt, first, last, width, height, frame_count, fit=("disabled", "center"),
                   ref_images=None, ref_size="match", ref_audios=None, ref_videos=None, cards=None):
    """fl2va branch (same as comfy_extras MiniMaxH3ImageToVideo): the prompt is tokenized together with the
    keyframe pictures (plain images, not reference items) and the frames become "minimax_keyframes" at pixel frame 0
    (first) and frame_count - 1 (last). first / last: IMAGE [1,H,W,3] or None (both None = t2va on this model).
    fit: (first, last) crop modes from kf_crops (v6m «Вписать кадр»; the default is the old behaviour).
    Returns (cond, keyframes) — the keyframes are also added to the negative by the caller."""
    images, keyframes = [], []
    if first is not None:
        img = kf_resize(first, width, height, fit[0])
        images.append(img)
        keyframes.append({"resolved_frame_index": 0, "image": img})
    if last is not None:
        img = kf_resize(last, width, height, fit[1])
        images.append(img)
        keyframes.append({"resolved_frame_index": frame_count - 1, "image": img})
    cond = encode_cond(clip, vae, prompt, ref_images or [], width, height, ref_size,
                       ref_audios, ref_videos, cards, frame_images=images)
    for kf in keyframes:
        kf["latent"] = vae.encode(kf.pop("image"))
    return cond, keyframes


def add_keyframes(cond, keyframes):
    if not keyframes:
        return cond
    out = []
    for t, d in cond:
        d = dict(d)
        d["minimax_keyframes"] = list(d.get("minimax_keyframes", [])) + list(keyframes)
        out.append([t, d])
    return out


# ---------------------------------------------------------------- inputs
def load_asset_image(asset):
    """Asset uploaded via /upload/image -> IMAGE [1,H,W,3]."""
    import numpy as np
    from PIL import Image, ImageOps
    path = asset_path(asset)
    before = _ref_source_stamp(path)
    with Image.open(path) as source:
        img = ImageOps.exif_transpose(source).convert("RGB")
    tensor = torch.from_numpy(np.asarray(img).astype("float32") / 255.0)[None]
    after = _ref_source_stamp(path)
    if before == after:  # a source edited during the read must not enter the cache
        tensor._h3zs_source_stamp = after
    return tensor


def asset_path(asset):
    import folder_paths
    base = {"input": folder_paths.get_input_directory, "output": folder_paths.get_output_directory,
            "temp": folder_paths.get_temp_directory}.get(asset.get("type") or "input", folder_paths.get_input_directory)()
    base = os.path.abspath(base)
    p = os.path.abspath(os.path.join(base, asset.get("subfolder") or "", asset["file"]))
    if os.path.commonpath([base, p]) != base:
        raise ValueError(f"H3ZeroStudio: недопустимый путь ассета {asset['file']!r}")
    if not os.path.isfile(p):
        raise FileNotFoundError(f"H3ZeroStudio: нет файла референса {asset.get('name') or asset['file']} ({p}). Загрузите его заново в «Ассетах».")
    return p


def file_sig(path):
    try:
        st = os.stat(path)
        return f"{st.st_size}:{int(st.st_mtime)}"
    except OSError:
        return "missing"


def model_signature(model, clip, vae, audio_vae):
    h = hashlib.sha256()
    try:
        h.update(type(model.model).__name__.encode())
        h.update(str(getattr(model.model, "model_config", None).__class__.__name__).encode())
        for k in sorted(getattr(model, "patches", {}) or {}):
            for p in model.patches[k]:
                h.update(f"{k}:{p[0]}:{p[2] if len(p) > 2 else ''}".encode())
        for k in sorted((model.model_options or {}).get("transformer_options", {}).keys()):
            h.update(str(k).encode())
    except Exception:
        pass
    for o in (clip, vae, audio_vae):
        h.update(type(o).__name__.encode() if o is not None else b"-")
    return h.hexdigest()[:16]


def model_signature_parts(model, clip, vae, audio_vae):
    """What model_signature hashes, readable (cache-miss reasons / take recipes)."""
    out = {"wired": True}
    try:
        out["model"] = type(model.model).__name__ + "/" + str(getattr(model.model, "model_config", None).__class__.__name__)
        out["patches"] = sorted(f"{k}:{p[2] if len(p) > 2 else ''}" for k in (getattr(model, "patches", {}) or {}) for p in model.patches[k])[:4000]
        out["topts"] = sorted(str(k) for k in (model.model_options or {}).get("transformer_options", {}).keys())
    except Exception:
        pass
    for n, o in (("clip", clip), ("vae", vae), ("audio_vae", audio_vae)):
        out[n] = type(o).__name__ if o is not None else "-"
    return out


def audio_signature(audio):
    if audio is None:
        return ""
    wf = audio["waveform"]
    h = hashlib.sha256(f"{tuple(wf.shape)}:{audio['sample_rate']}".encode())
    flat = wf.flatten()
    step = max(1, flat.numel() // 4096)
    h.update(flat[::step].float().cpu().numpy().tobytes())
    return h.hexdigest()[:16]


def encode_audio(audio_vae, audio):
    """AUDIO -> H3 audio latent [1,32,2,T] at 40 latent frames/s (same as MiniMaxH3AddGuide)."""
    wf = audio["waveform"]
    sr = audio["sample_rate"]
    vae_sr = getattr(audio_vae, "audio_sample_rate", 32000)
    if wf.shape[1] == 1:
        wf = wf.repeat(1, 2, 1)
    if sr != vae_sr:
        import comfy.audio
        wf = comfy.audio.resample(wf, sr, vae_sr)
    return audio_vae.encode(wf[:1].movedim(1, -1))


def audio_out_rate(audio_vae):
    return getattr(audio_vae, "audio_sample_rate_output", getattr(audio_vae, "audio_sample_rate", 44100))


def normalize_level(audio):
    """ComfyUI's vae_decode_audio level rule: divide by 5*std when that is above 1."""
    std = torch.std(audio, dim=[1, 2], keepdim=True) * 5.0
    std[std < 1.0] = 1.0
    return audio / std


def decode_audio(audio_vae, latent_a, normalize=True):
    """Like comfy_extras.nodes_audio.vae_decode_audio -> AUDIO dict."""
    audio = audio_vae.decode(latent_a).movedim(-1, 1).float()
    return {"waveform": normalize_level(audio) if normalize else audio, "sample_rate": audio_out_rate(audio_vae)}


def _rms(x):
    return float(torch.sqrt(torch.mean(x.float() ** 2))) if x.numel() else 0.0


SPLICE_SEC = 0.02        # linear splice fade at a correlated (kept-audio) seam
DRIFT_FADE_SEC = 0.01    # fade of the few-sample drift fix after the overlap
CORR_SEAM = 0.5          # overlap correlation above which both sides carry the same (kept) sound


def _mono(x):
    return x.float().mean(0)


def _quietest(x, lo, hi, win):
    """Start of the quietest `win`-sample window of mono x within [lo, hi) (lo if the range is too short)."""
    lo, hi = max(0, int(lo)), min(x.shape[-1], int(hi))
    if hi - lo <= win:
        return lo
    e = x[lo:hi].float() ** 2
    c = torch.cumsum(torch.cat([torch.zeros(1), e]), 0)
    en = c[win:] - c[:-win]
    return lo + int(torch.argmin(en))


def seam_lag(prev, cur, max_lag, prior=0):
    """Best alignment of `cur` against `prev` (mono, same length = the overlap): cur[k] matches prev[k + lag].
    Returns (lag, normalized correlation). Only the middle 70% is compared (decoder edges). Periodic sound
    correlates at several lags: a slight bias picks the one nearest `prior` (the audio-latent grid offset)."""
    n = min(prev.shape[-1], cur.shape[-1])
    m0, m1 = int(n * 0.15), int(n * 0.85)
    if m1 - m0 < 64:
        return 0, 0.0
    b = cur[m0:m1].float()
    lo, hi = max(0, m0 - max_lag), min(n, m1 + max_lag)
    a = prev[lo:hi].float()
    if a.shape[-1] < b.shape[-1]:
        return 0, 0.0
    num = torch.nn.functional.conv1d(a.view(1, 1, -1), b.view(1, 1, -1)).view(-1)
    ea = torch.cumsum(torch.cat([torch.zeros(1), a ** 2]), 0)
    den = torch.sqrt((ea[b.shape[-1]:] - ea[:-b.shape[-1]]) * float((b ** 2).sum())).clamp(min=1e-12)
    r = num / den
    lags = torch.arange(r.shape[-1]) + lo - m0
    k = int(torch.argmax(r - 0.02 * (lags - prior).abs().float() / max(1, max_lag)))
    return lo + k - m0, float(r[k])


def _drift_fix(w, d, q, sr):
    """w placed d samples off its video position: drop (d > 0) or repeat (d < 0) |d| samples at local index q
    with a short linear fade, so everything after q is back on the video timeline."""
    if d == 0:
        return w
    X = max(1, int(round(DRIFT_FADE_SEC * sr)))
    e = abs(d)
    if q - X - e < 0 or q + e >= w.shape[-1]:
        return w
    t = (torch.arange(X, dtype=torch.float32) + 0.5) / X
    if d > 0:
        v = torch.cat([w[:, :q], w[:, q + d:]], dim=-1).clone()
        v[:, q - X:q] = w[:, q - X:q] * (1 - t) + w[:, q + d - X:q + d] * t
    else:
        v = torch.cat([w[:, :q], w[:, q - e:]], dim=-1).clone()
        v[:, q - X:q] = w[:, q - X:q] * (1 - t) + w[:, q - e - X:q - e] * t
    return v


def stitch_audio(waves, sr, items, fps=core.FPS, xfade=0.4, match=True, release=core.AUDIO_MATCH_RELEASE, skip=None, info=None, declick=True):
    """Final audio of an extend chain from separately decoded segments.
    waves[i]: [C, N] audio of segment i, sample 0 = the segment's first frame (timeline frame items[i]["start"]).
    At an extend seam both segments cover the overlap.
      * Kept (correlated) overlap sound — the usual case with the audio seam lock: the next segment's overlap is
        the previous sound, but on the 25 ms audio-latent grid, so it is up to ±12.5 ms off its video position
        (e.g. 8.3 ms at a 22-frame overlap after a 108-frame clip). The exact offset is measured by
        cross-correlation, the two are spliced sample-exactly with a short linear fade (constant gain for
        identical signals) at the quietest point of the overlap's middle, and the offset is removed again at a
        quiet point after the overlap, so the rest stays on the video timeline (no drift along a long chain).
        (A long equal-power crossfade of two copies 8 ms apart combed/cancelled — an audible dip.)
      * Different sound on both sides: the next segment's loudness is matched (RMS gain, limited, back to 1 over
        `release` s) and an equal-power crossfade of `xfade` s is centred in the overlap; xfade 0 = hard cut.
    Segments without overlap (new scene) are butt-joined. info: optional list, gets one dict per seam.
    declick: every hard cut (new scene, footage, xfade 0, cut under a locked track) gets a ~5 ms taper each side."""
    total = int(round(items[-1]["end"] / fps * sr))
    out = torch.zeros(waves[0].shape[0], total)
    gains, cuts = [], []
    for i, it in enumerate(items):
        s0 = int(round(it["start"] / fps * sr))
        n = max(0, min(waves[i].shape[-1], total - s0))
        w = waves[i][:, :n].float().clone()
        ov_n = min(n, int(round((it["overlap"] if i else 0) / fps * sr)))
        g = 1.0
        sk = bool(skip and i < len(skip) and skip[i])
        if ov_n > 0 and not sk:
            # grid prior: the next segment's audio latent starts at a multiple of 1/40 s, not at its first frame
            ta = it["start"] * core.AUDIO_LATENT_FPS / fps
            prior = int(round((round(ta) - ta) / core.AUDIO_LATENT_FPS * sr))
            lag, corr = seam_lag(_mono(out[:, s0:s0 + ov_n]), _mono(w[:, :ov_n]), max(1, int(round(0.02 * sr))), prior)
            if corr >= CORR_SEAM and xfade > 0:
                # same sound on both sides: sample-exact splice, then remove the grid offset after the overlap
                d = lag   # w[k] belongs at timeline s0 + d + k
                L = max(1, min(int(round(SPLICE_SEC * sr)), ov_n // 4))
                mid0, mid1 = s0 + ov_n // 4, s0 + (3 * ov_n) // 4
                a = _quietest(_mono(out), mid0, mid1, L)
                a = max(a, s0 + max(0, d))
                b = a + L
                X = max(1, int(round(DRIFT_FADE_SEC * sr)))
                ov_end = ov_n - d   # local index of the overlap end in w
                q = _quietest(_mono(w), ov_end + int(0.05 * sr), min(w.shape[-1] - abs(d) - 1, ov_end + int(1.5 * sr)), int(0.03 * sr)) + int(0.015 * sr)
                v = _drift_fix(w, d, q, sr) if d else w
                base = s0 + d
                if match:   # same sound, different level (decoder): match it, back to 1 over `release`
                    r_prev = _rms(out[:, max(s0, base):s0 + ov_n])
                    r_cur = _rms(v[:, max(s0, base) - base:s0 + ov_n - base])
                    if r_prev > 1e-6 and r_cur > 1e-6:
                        lo_, hi_ = core.AUDIO_MATCH_RANGE
                        g = min(hi_, max(lo_, r_prev / r_cur))
                    if abs(g - 1.0) > 1e-3:
                        curve = torch.ones(v.shape[-1])
                        k = b - base
                        rel = max(1, int(round(release * sr)))
                        curve[:k] = g
                        m = min(v.shape[-1], k + rel)
                        if m > k:
                            curve[k:m] = g + (1.0 - g) * (torch.arange(m - k, dtype=torch.float32) + 1) / rel
                        v = v * curve
                t = (torch.arange(L, dtype=torch.float32) + 0.5) / L
                out[:, a:b] = out[:, a:b] * (1 - t) + v[:, a - base:b - base] * t
                end = min(total, base + v.shape[-1])
                out[:, b:end] = v[:, b - base:end - base]
                if info is not None:
                    info.append({"seam": i, "mode": "splice", "lag_ms": round(d / sr * 1000, 2), "corr": round(corr, 3),
                                 "at_s": round(a / sr, 3), "drift_fix_s": round((base + q) / sr, 3) if d else None})
            else:
                if xfade > 0:
                    L = max(1, min(int(round(xfade * sr)), int(ov_n * 0.9)))
                    a = s0 + (ov_n - L) // 2
                else:
                    L, a = 0, s0 + ov_n
                b = a + L
                if not L:
                    cuts.append(a)
                if match:
                    r_prev, r_cur = _rms(out[:, s0:s0 + ov_n]), _rms(w[:, :ov_n])
                    if r_prev > 1e-6 and r_cur > 1e-6:
                        lo, hi = core.AUDIO_MATCH_RANGE
                        g = min(hi, max(lo, r_prev / r_cur))
                    if g != 1.0:
                        curve = torch.ones(n)
                        k = b - s0
                        rel = max(1, int(round(release * sr)))
                        curve[:k] = g
                        m = min(n, k + rel)
                        if m > k:
                            curve[k:m] = g + (1.0 - g) * (torch.arange(m - k, dtype=torch.float32) + 1) / rel
                        w = w * curve
                if L:
                    t = (torch.arange(L, dtype=torch.float32) + 0.5) / L
                    out[:, a:b] = out[:, a:b] * torch.cos(t * math.pi / 2) + w[:, a - s0:b - s0] * torch.sin(t * math.pi / 2)
                out[:, b:s0 + n] = w[:, b - s0:]
                if info is not None:
                    info.append({"seam": i, "mode": "crossfade", "corr": round(corr, 3), "xfade_s": xfade})
        elif ov_n > 0:   # under a locked track clip: hard cut at the overlap end
            out[:, s0 + ov_n:s0 + n] = w[:, ov_n:]
            cuts.append(s0 + ov_n)
        else:
            out[:, s0:s0 + n] = w
            if i:
                cuts.append(s0)
        gains.append(g)
    if declick and cuts:
        from .h3s_seams import declick as _declick
        _declick(out, sr, cuts)
        if info is not None:
            info.append({"seam": -1, "mode": "declick", "at_s": [round(c / sr, 3) for c in cuts]})
    return out, gains


def seam_dips(wave, sr, items, fps=core.FPS, window=0.01, drop_db=25.0):
    """Diagnostics: short level holes (> drop_db below the local median) within ±0.3 s of every overlap end."""
    x = _mono(wave)
    W = max(1, int(window * sr))
    found = []
    for i, it in enumerate(items):
        if not i or not it["overlap"]:
            continue
        c = int(round((it["start"] + it["overlap"]) / fps * sr))
        lo, hi = max(0, c - int(0.3 * sr)), min(x.shape[-1], c + int(0.3 * sr))
        seg = x[lo:hi]
        k = seg.shape[-1] // W
        if k < 8:
            continue
        lev = 20 * torch.log10(torch.sqrt((seg[:k * W].view(k, W) ** 2).mean(1)) + 1e-9)
        med = float(lev.median())
        if med < -60:
            continue
        holes = [lo / sr + j * window for j in range(k) if float(lev[j]) < med - drop_db]
        if holes:
            found.append({"seam": i, "at_s": round(holes[0], 3), "len_ms": round(len(holes) * window * 1000), "median_db": round(med, 1)})
    return found


def slice_audio_latent(z, start_frame, length, cov=None):
    """Audio latent slice for a segment starting at timeline pixel frame start_frame; zero-padded.
    cov: optional [Z] 0/1 mask of timeline audio-latent frames covered by the audio clip."""
    a0 = round(start_frame / core.FPS * core.AUDIO_LATENT_FPS)
    out = torch.zeros(z.shape[:-1] + (length,), dtype=z.dtype)
    weight = torch.zeros(length)
    if a0 < z.shape[-1] and a0 + length > 0:
        s0, s1 = max(0, a0), min(z.shape[-1], a0 + length)
        out[..., s0 - a0:s1 - a0] = z[..., s0:s1].cpu()
        weight[s0 - a0:s1 - a0] = 1.0 if cov is None else cov[s0:s1].float()
    return out, weight


def load_audio_ref(ref):
    """Uploaded audio file reference {filename, subfolder, type} -> AUDIO dict."""
    path = asset_path({"file": ref.get("filename", ""), "subfolder": ref.get("subfolder", ""), "type": ref.get("type", "input"),
                       "name": ref.get("name") or ref.get("filename")})
    wf, sr = media.load_audio(path)
    if wf.shape[0] == 0 or wf.shape[1] == 0:
        raise ValueError(f"H3ZeroStudio: пустой аудиофайл {ref.get('filename')}")
    return {"waveform": torch.from_numpy(wf)[None], "sample_rate": sr}


def _resample(audio, sr):
    if int(audio["sample_rate"]) == sr:
        return audio["waveform"][:1].float()
    import comfy.audio
    return comfy.audio.resample(audio["waveform"][:1].float(), int(audio["sample_rate"]), sr)


def audio_sources(project, audio_input=None):
    """{asset id | "input": AUDIO} for every audio used by the track or by segment references.
    Missing files raise; a missing node input is simply absent."""
    lc = core.lock_clips(project)
    used = {c["asset"] for c in lc}
    cn_assets = {c["asset"] for c in lc if c.get("cn")}   # v6l «Звук в H3»: the sound of a ControlNet (video) clip
    for seg in project["segments"]:
        used.update(a["id"] for a in core.audio_refs(project, seg))
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "audio" or (a["id"] in cn_assets and a["category"] == "video")}
    out = {}
    for aid in sorted(used):
        if aid == core.AUDIO_INPUT_ID:
            if audio_input is not None:
                out[aid] = audio_input
        elif aid in by_id:
            a = by_id[aid]
            try:
                out[aid] = load_audio_ref({"filename": a["file"], "subfolder": a["subfolder"], "type": a["type"], "name": a["name"]})
            except ValueError as e:
                if a["category"] != "video":
                    raise
                msg = f"ControlNet: «Звук в H3» — в видео «{a.get('name') or a['file']}» нет звука, клип идёт без звука ({e})."
                log(msg)
                if CTL_RUN.get("warn"):
                    CTL_RUN["warn"](msg)
    return out


def timeline_audio(sources, project, n_frames):
    """Mix the audio track clips onto the timeline: source [in, in+length) -> timeline [start, ...).
    sources: {asset id: AUDIO} (an AUDIO dict alone = the node input, for old callers).
    Returns (AUDIO aligned to timeline frame 0 with n_frames/24 s or None, coverage mask in audio-latent frames)."""
    if isinstance(sources, dict) and "waveform" in sources:
        sources = {core.AUDIO_INPUT_ID: sources}
    z_len = core.audio_len(n_frames)
    cov = torch.zeros(z_len)
    clips = [c for c in core.lock_clips(project) if c["asset"] in sources]
    if not clips:
        return None, cov
    sr = max(int(sources[c["asset"]]["sample_rate"]) for c in clips)
    out, spans = mix_clips(clips, sources, sr, 0.0, int(round(n_frames / core.FPS * sr)))
    t = torch.arange(z_len) / core.AUDIO_LATENT_FPS
    for start, end in spans:
        cov = torch.maximum(cov, ((t >= start) & (t < end)).float())
    return {"waveform": out, "sample_rate": sr}, cov


def clip_envelope(n, sr, volume=1.0, fade_in=0.0, fade_out=0.0):
    """Gain curve of a clip of n samples: volume with linear fades (seconds, clamped to the clip)."""
    env = torch.full((n,), float(volume))
    fi, fo = min(n, int(round(fade_in * sr))), min(n, int(round(fade_out * sr)))
    if fi > 0:
        env[:fi] *= torch.linspace(0.0, 1.0, fi)
    if fo > 0:
        env[n - fo:] *= torch.linspace(1.0, 0.0, fo)
    return env


def mix_clips(clips, sources, sr, t0, n_out):
    """Mix audio clips ({asset, start, in, length, volume, fades}) into [1, 2, n_out] starting at timeline
    second t0. Returns (waveform, [(start, end) timeline seconds of every clip])."""
    out = torch.zeros(1, 2, n_out)
    cache, spans = {}, []
    for c in clips:
        asset = c["asset"]
        if asset not in sources:
            continue
        if asset not in cache:
            wf = _resample(sources[asset], sr)
            cache[asset] = wf.repeat(1, 2, 1) if wf.shape[1] == 1 else wf[:, :2]
        wf = cache[asset]
        start, t_in = float(c.get("start") or 0.0), float(c.get("in") or 0.0)
        ln = float(c.get("length") or 0.0)
        avail = max(0.0, wf.shape[-1] / sr - t_in)
        dur = avail if ln <= 0 else min(ln, avail)
        if dur <= 0:
            continue
        spans.append((start, start + dur))
        n_clip = int(round(dur * sr))
        env = clip_envelope(n_clip, sr, c.get("volume", 1.0), c.get("fade_in", 0.0), c.get("fade_out", 0.0))
        s_out = int(round((start - t0) * sr))
        k0 = max(0, -s_out)
        j0 = s_out + k0
        s_src = int(round(t_in * sr)) + k0
        n = min(n_clip - k0, n_out - j0, wf.shape[-1] - s_src)
        if n <= 0:
            continue
        out[..., j0:j0 + n] += wf[..., s_src:s_src + n] * env[k0:k0 + n]
    return out, spans


def ref_audio_latents(audio_vae, project, seg, sources):
    """Encoded <Audio j> references of a segment (first REF_AUDIO_MAX_SEC seconds of each)."""
    out = []
    state = getattr(_REF_VAE_LOCAL, "state", None)
    for a in core.audio_refs(project, seg)[:core.MAX_REF_AUDIOS]:
        src = sources.get(a["id"])
        if src is None or audio_vae is None:
            log(f"audio reference {a['name']!r} skipped ({'no audio_vae' if audio_vae is None else 'not connected'})")
            continue
        n = int(core.REF_AUDIO_MAX_SEC * int(src["sample_rate"]))
        key = (id(audio_vae), a["id"], id(src["waveform"]), int(src["sample_rate"]), n)
        saved = state["audio"].get(key) if state is not None else None
        if saved is not None:
            state["audio"].move_to_end(key)
            state["audio_hits"] += 1
            out.append(saved.clone())
            continue
        latent = encode_audio(audio_vae, {"waveform": src["waveform"][..., :n], "sample_rate": src["sample_rate"]}).float().cpu()
        if state is not None:
            nbytes = latent.numel() * latent.element_size()
            if nbytes <= _AUDIO_REF_MAX_BYTES:
                while state["audio"] and state["audio_bytes"] + nbytes > _AUDIO_REF_MAX_BYTES:
                    _, evicted = state["audio"].popitem(last=False)
                    state["audio_bytes"] -= evicted.numel() * evicted.element_size()
                state["audio"][key] = latent.detach().clone()
                state["audio_bytes"] += nbytes
        out.append(latent)
    return out


def video_canvas(vw, vh):
    """Reference-video canvas of MiniMaxH3ReferenceToVideo (768 short edge, 768*1344 area cap, /32; never upscaled)."""
    try:
        from comfy_extras.nodes_minimax_h3 import adapt_canvas
        cw, ch = adapt_canvas(vw, vh)
    except Exception:
        r, m = vw / vh, core.CANVAS_MULTIPLE
        nw, nh = (768 * r, 768) if r >= 1 else (768, 768 / r)
        if nw * nh > 768 * 1344:
            k = math.sqrt(768 * 1344 / (nw * nh))
            nw, nh = nw * k, nh * k
        cw, ch = max(m, round(nw / m) * m), max(m, round(nh / m) * m)
    if vw * vh < cw * ch:
        m = core.CANVAS_MULTIPLE
        cw, ch = max(m, round(vw / m) * m), max(m, round(vh / m) * m)
    return cw, ch


def ref_video_frames(asset, target_frames):
    """<Video k> reference: the first min(file, 15 s, target) frames at 24 fps on the reference canvas, 17k+5."""
    path = asset_path(asset)
    before = _ref_source_stamp(path)
    info = media.video_info(path)
    n = min(info["frames"], int(core.REF_VIDEO_MAX_SEC * core.FPS), int(target_frames))
    if n < 5:
        raise ValueError(f"H3ZeroStudio: видео-референс «{asset.get('name')}» короче 5 кадров")
    while n % 17 != 5:
        n -= 1
    cw, ch = video_canvas(info["width"], info["height"])
    frames = torch.from_numpy(media.load_video_frames(path, 0, n, cw, ch, mode="stretch"))
    after = _ref_source_stamp(path)
    if before == after:
        frames._h3zs_source_stamp = (after, n, cw, ch, "stretch")
    return frames


def footage_latents(vae, audio_vae, asset, src, frames, w, h, audio_t):
    """Footage clip -> (video latent, audio latent, pixel frames): its frames from src["in"], VAE-encoded at the
    project size (cover + center crop); the file's sound encoded with audio_vae (silence without one)."""
    path = asset_path(asset)
    px = torch.from_numpy(media.load_video_frames(path, src["in"], frames, w, h, mode="crop"))
    v = vae.encode(px).float().cpu()
    a = None
    if audio_vae is not None:
        try:
            wf, sr = media.load_audio(path)
            i0 = int(round(src["in"] / core.FPS * sr))
            n = int(round(frames / core.FPS * sr))
            seg = torch.zeros(wf.shape[0] or 2, n)
            part = torch.from_numpy(wf[:, i0:i0 + n])
            seg[:, :part.shape[1]] = part
            a = encode_audio(audio_vae, {"waveform": seg[None], "sample_rate": sr}).float().cpu()
        except ValueError:   # no audio stream
            a = None
    if a is None:
        a = torch.zeros(1, 32, 2, audio_t)
    if a.shape[-1] < audio_t:
        a = torch.nn.functional.pad(a, (0, audio_t - a.shape[-1]))
    return v, a[..., :audio_t], px


def decode_video(vae, v):
    img = vae.decode(v)
    return img.reshape((-1,) + tuple(img.shape[-3:]))[..., :3].float().cpu()


def piflow_has_pruned_layout(path):
    """Report whether the 48 AdaLN layers look like a pruned H3, without loading a ~20 GB model.

    pi-H3 DWD expects [96768, 8]; unpruned H3 uses [96768, 2688]. The result is advisory only
    (a warning, never a rejection). A filename is not evidence of either architecture
    (10Eros/B25-49 omit 'pruned'), and some packs store the layers under the full
    'model.diffusion_model.' prefix, so both key spellings are accepted.
    """
    if not path or not os.path.isfile(path):
        return False
    try:
        with open(path, "rb") as f:
            size = int.from_bytes(f.read(8), "little")
            if not 0 < size <= 16 * 1024 * 1024:
                return False
            header = json.loads(f.read(size))
        keys = tuple(header)
        prefix = "model.diffusion_model." if any(k.startswith("model.diffusion_model.blocks.") for k in keys) else ""
        return all(header.get(f"{prefix}blocks.{i}.adaln_proj.linear.weight", {}).get("shape")
                   == [96768, 8] for i in range(48))
    except (OSError, ValueError, TypeError, UnicodeDecodeError):
        return False


def piflow_patch_and_sigmas(model, steps, settings=None):
    """Use the installed piFlow custom nodes, including DWD; 2 and 4 steps have separate adapters.

    The adapter file comes from `settings` (piflow_lora2 / piflow_lora4) exactly like the
    preflight check and the cache key, so a selected custom adapter is the one that is loaded.
    """
    import nodes
    n = int(steps)
    if n not in (2, 4):
        raise ValueError("pi-H3: поддерживаются только 2 или 4 шага")
    adapter = piflow_adapter_name(settings or {}, n)
    loader = nodes.NODE_CLASS_MAPPINGS.get("Load LakonLab Adapter")
    scheduler = nodes.NODE_CLASS_MAPPINGS.get("pi-Flow Scheduler")
    decoder = nodes.NODE_CLASS_MAPPINGS.get("DWD Decode")
    if not all((loader, scheduler, decoder)):
        raise ValueError("pi-H3: ноды LakonLab не загружены. Перезапустите ComfyUI после установки ComfyUI-piFlow.")
    model = loader().load_adapter(model, adapter, 1.0)[0]
    max_t = 0.930 if n == 2 else 0.960
    sigmas = scheduler().get_sigmas(model, n, 0.0, max_t, 0.6)[0]
    log(f"  pi-H3 DWD: {n} steps, adapter {adapter}, max_raw_t {max_t:.3f}, final_step_size_scale 0.60; skip video VAE")
    return model, sigmas


def refine_sigmas(model, steps, scheduler, sigma0):
    """Schedule of the refine pass: the model's own `scheduler` curve below sigma0, resampled to `steps` steps.
    H3 refine passes are set by their start sigma (0.25-0.45 is the proven range): a denoise *fraction* is
    misleading under H3's shift 12 (denoise 0.5 starts at sigma ~0.9, almost a new generation)."""
    ms = model.get_model_object("model_sampling")
    full = comfy.samplers.calculate_sigmas(ms, scheduler, 1000).float().cpu()
    keep = full[full <= float(sigma0) + 1e-6]
    if keep.numel() < steps + 1:
        return torch.linspace(float(sigma0), 0.0, steps + 1)
    idx = torch.linspace(0, keep.numel() - 1, steps + 1).round().long()
    out = keep[idx].clone()
    out[0] = float(sigma0)   # start exactly at the set strength (the curve point is a hair below it)
    return out.contiguous()


def basic_refine_sigmas(model, steps, scheduler, denoise):
    """Mirror ComfyUI BasicScheduler exactly: build int(steps/denoise) sigmas and take the last steps+1.
    The denoise *fraction* is not an absolute sigma; with H3's video shift the resulting start sigma
    can be much higher than 0.30. Kept separate from our legacy absolute-sigma refiner for A/B tests."""
    if not 0.0 < float(denoise) <= 1.0:
        raise ValueError("HiRes BasicScheduler: denoise должен быть в диапазоне (0, 1]")
    total_steps = int(int(steps) / float(denoise))
    full = comfy.samplers.calculate_sigmas(model.get_model_object("model_sampling"), scheduler, total_steps).cpu()
    return full[-(int(steps) + 1):].contiguous()


def pass_sigmas(m, p, refine):
    """Explicit SIGMAS win; for refine choose legacy absolute sigma or exact BasicScheduler fractional denoise."""
    if p.get("sigmas") is not None:
        return torch.tensor(p["sigmas"], dtype=torch.float32)
    if not refine:
        return None
    if p.get("schedule_mode") == "basic":
        return basic_refine_sigmas(m, p["steps"], p["scheduler"], p["schedule_denoise"])
    return refine_sigmas(m, p["steps"], p["scheduler"], p["sigma0"])


def check_custom_sigmas(p):
    """A clear run error when «custom SIGMAS» is chosen but the list is empty / unparsable."""
    if p.get("sigmas") is None and p.get("scheduler") == core.SIGMAS_SCHEDULER:
        raise ValueError("H3ZeroStudio: расписание «custom SIGMAS», но список сигм пуст или не разобрался. "
                         "Нужно минимум 2 числа через запятую, например «1.0, 0.5, 0.0».")


# ---------------------------------------------------------------- wired SAMPLER / SIGMAS (optional node inputs)
# A SAMPLER / SIGMAS wired into the node win over the project's sampler / scheduler / steps:
#   * SIGMAS: every fresh pass (draft / full, region passes) runs exactly these sigmas; the step count is len-1.
#     Refine passes (final from the draft, upscale refine, audio refine, vid2vid from footage) start from their own
#     partial schedule, so they keep it.
#   * SAMPLER: replaces the sampler of every pass (a refine pass then uses its own sigmas with that sampler).
# Both enter every cache key through settings["_custom"] (see core.pass_params).
CUSTOM = {"sampler": None, "sigmas": None, "model_pass2": None, "sampler_pass2": None, "sigmas_pass2": None}


def check_sigmas(sigmas, label="SIGMAS", require_zero=False):
    """Validate a monotone, finite sigma segment. Nonzero endpoints are valid for staged sampling."""
    if sigmas is None:
        return None
    t = torch.as_tensor(sigmas).detach().float().flatten().cpu()
    if t.numel() < 2 or not bool(torch.isfinite(t).all()):
        raise ValueError("H3ZeroStudio: вход SIGMAS: нужно минимум 2 конечных значения (число шагов = число сигм − 1)")
    if bool((t < 0).any()) or bool((t[:-1] < t[1:]).any()):
        raise ValueError("H3ZeroStudio: вход SIGMAS: значения должны быть неотрицательными и невозрастающими")
    if float(t[0]) <= 0:
        raise ValueError(f"H3ZeroStudio: вход {label}: первая сигма должна быть > 0")
    if require_zero and abs(float(t[-1])) > 1e-7:
        raise ValueError(f"H3ZeroStudio: вход {label}: последний элемент должен быть 0")
    return t


def sampler_signature(sampler):
    """Stable short id of a SAMPLER object (its function + options): the cache key must change with it."""
    f = getattr(sampler, "sampler_function", None)
    name = f"{getattr(f, '__module__', '')}.{getattr(f, '__qualname__', type(sampler).__name__)}"
    enc = lambda o: getattr(o, "__qualname__", type(o).__name__)
    opts = json.dumps([getattr(sampler, "extra_options", None), getattr(sampler, "inpaint_options", None)], sort_keys=True, default=enc)
    return hashlib.sha1((name + opts).encode()).hexdigest()[:12]


def custom_info(sampler, sigmas):
    """What the wired SAMPLER / SIGMAS add to the project settings ("_custom"): the step count and a signature."""
    if sampler is None and sigmas is None:
        return None
    out = {"steps": 0, "sig": {}}
    if sigmas is not None:
        lst = [round(float(x), 6) for x in sigmas.tolist()]
        out["steps"], out["sig"]["sigmas"] = len(lst) - 1, lst
    if sampler is not None:
        out["sig"]["sampler"] = sampler_signature(sampler)
    return out


# ---------------------------------------------------------------- loaded-model hygiene (v6l hotfix)
# comfy.model_management.LoadedModel keeps only a weakref to its ModelPatcher; when a clone dies it switches to the
# clone's parent - but only if that parent is still alive. Our passes sample temporary clone chains (cached model →
# shift clone → ControlNet clone); when gc collects such a chain at once, the entry is left "dead" (patcher gone, real
# model alive): ComfyUI logs "Potential memory leak detected with model MiniMaxH3", free_memory skips the entry so it
# stays currently_used forever, and loaded_models(only_currently_used=True) returns None for it - which crashed the
# native ControlNet patch (prepare_control_latent → load_models_gpu → 'NoneType' has no 'model_patches_models').
def _held_patchers():
    try:
        from . import h3s_models as models
        out = set()
        for store in (models.CACHE.base, models.CACHE.patched):
            for v in list(store.values()):
                if isinstance(v, tuple) and v:
                    out.add(id(v[0]))
        return out
    except Exception:
        return set()


def _repoint(lm, target):
    f = getattr(lm, "_patcher_finalizer", None)
    if f is not None:
        try:
            f.detach()
        except Exception:
            pass
    lm._set_model(target)


def heal_loaded_models():
    """Dead entries → re-pointed to their live parent (what ComfyUI's _switch_parent would have done), else marked
    not currently used, so loaded_models(only_currently_used=True) never yields None. Returns the number fixed."""
    try:
        import comfy.model_management as mm
        lst = getattr(mm, "current_loaded_models", None) or []
    except Exception:
        return 0
    n = 0
    for lm in list(lst):
        try:
            if lm.model is not None:
                continue
            ref = getattr(lm, "_parent_model", None)
            par = ref() if callable(ref) else None
            if par is not None and hasattr(lm, "_set_model"):
                _repoint(lm, par)
            else:
                lm.currently_used = False
            n += 1
        except Exception:
            try:
                lm.currently_used = False
            except Exception:
                pass
    if n:
        log(f"  models: {n} stale loaded-model entr{'y' if n == 1 else 'ies'} healed (clone collected before its parent)")
    return n


def hand_back(m):
    """After a pass: loaded entries of the temporary clone chain of `m` are handed to the nearest ancestor we keep
    (the cached model), deterministically, before the clones are dropped."""
    try:
        import comfy.model_management as mm
        lst = getattr(mm, "current_loaded_models", None) or []
        chain, p = [], m
        while p is not None and len(chain) < 16:
            chain.append(p)
            p = getattr(p, "parent", None)
        if len(chain) < 2:
            return 0
        held = _held_patchers()
        target = next((c for c in chain[1:] if id(c) in held), chain[-1])
        temp = {id(c) for c in chain[:chain.index(target)]}
        n = 0
        for lm in list(lst):
            mod = getattr(lm, "model", None)
            if mod is None or id(mod) not in temp or not hasattr(lm, "_set_model"):
                continue
            if any(o is not lm and getattr(o, "model", None) is target for o in lst):
                f = getattr(lm, "_patcher_finalizer", None)   # the kept model already has its entry: drop the duplicate
                if f is not None:
                    try:
                        f.detach()
                    except Exception:
                        pass
                try:
                    lst.remove(lm)
                except ValueError:
                    pass
            else:
                _repoint(lm, target)
            n += 1
        return n
    except Exception as e:
        log(f"  models: hand-back failed ({e})")
        return 0


def sample_pass(m, noise, steps, cfg, sampler, scheduler, pos, neg, samples, denoise, callback, seed,
                noise_mask=None, sigmas=None, fresh=False, second=False, advanced=False, prefer_stage_sampler=False):
    """The one place that calls the sampler (+ loaded-model hygiene around it)."""
    heal_loaded_models()
    m = _memsave(m, samples)   # v6m «Экономия памяти»: chunked feed-forward on a clone (m itself unchanged)
    try:
        return _sample_pass(m, noise, steps, cfg, sampler, scheduler, pos, neg, samples, denoise, callback, seed,
                            noise_mask=noise_mask, sigmas=sigmas, fresh=fresh, second=second, advanced=advanced,
                            prefer_stage_sampler=prefer_stage_sampler)
    finally:
        hand_back(m)


MEM_RUN = {"cfg": None, "said": False}   # this run's settings.memsave (set at run start)


def _latent_tokens(samples):
    """Rough DiT sequence length of a pass (video latent T×H×W / 2×2 patches), 0 when unknown."""
    try:
        x = samples
        if hasattr(x, "unbind") and getattr(x, "is_nested", False):
            x = x.unbind()[0]
        if hasattr(x, "tensors"):
            x = x.tensors[0]
        if getattr(x, "ndim", 0) == 5:
            return int(x.shape[2] * x.shape[3] * x.shape[4] // 4)
    except Exception:
        pass
    return 0


def _memsave(m, samples, tokens=None):
    from . import h3s_memory as mem
    cfg = MEM_RUN.get("cfg")
    if cfg is None:
        return m
    try:
        effective_tokens = _latent_tokens(samples) if tokens is None else int(tokens)
        m2 = mem.apply_ffn(m, cfg, cn=bool(getattr(m, "h3zs_cn", False)), tokens=effective_tokens)
    except Exception as e:
        log(f"memory saving skipped ({e})")
        return m
    if m2 is not m and not MEM_RUN.get("said"):
        c = mem.normalize(cfg)
        MEM_RUN["said"] = True
        log(f"memory saving: feed-forward in {c['chunks']} chunks above {c['threshold']} tokens ({c['mode']})")
    return m2


def _sample_pass(m, noise, steps, cfg, sampler, scheduler, pos, neg, samples, denoise, callback, seed,
                 noise_mask=None, sigmas=None, fresh=False, second=False, advanced=False, prefer_stage_sampler=False):
    """By default the shared wired SAMPLER wins; Advanced HiRes can explicitly select each arm's sampler.
    A dedicated pass-2 SAMPLER wire always wins over the project. SIGMAS wires retain their priority."""
    dedicated_pass2 = CUSTOM["sampler_pass2"] if second else None
    cs = dedicated_pass2 if dedicated_pass2 is not None else (None if prefer_stage_sampler else CUSTOM["sampler"])
    csg = CUSTOM["sigmas_pass2"] if second else CUSTOM["sigmas"]
    use_csg = csg is not None and (second or fresh)
    if cs is None and not use_csg and not advanced:
        return comfy.sample.sample(m, noise, steps, cfg, sampler, scheduler, pos, neg, samples, denoise=denoise, callback=callback,
                                   disable_pbar=True, seed=seed, noise_mask=noise_mask, sigmas=sigmas)
    if use_csg:
        sigmas = csg
    if sigmas is None:   # only a SAMPLER is wired: the project's scheduler / steps give the sigmas, as KSampler would
        sigmas = comfy.samplers.KSampler(m, steps=steps, device=m.load_device, sampler=sampler, scheduler=scheduler,
                                         denoise=denoise, model_options=m.model_options).sigmas
    obj = cs if cs is not None else comfy.samplers.sampler_object(sampler)
    return comfy.sample.sample_custom(m, noise, cfg, obj, sigmas, pos, neg, samples, noise_mask=noise_mask, callback=callback,
                                      disable_pbar=True, seed=seed)


def preview_sigma_list(m, p, refine_sigmas_t=None, fresh=False):
    """Sigmas the live preview / dynamics panel plots for a pass (the wired ones when they apply)."""
    if fresh and CUSTOM["sigmas"] is not None:
        return [float(x) for x in CUSTOM["sigmas"].tolist()]
    if refine_sigmas_t is not None:
        return [float(x) for x in refine_sigmas_t.tolist()]
    try:
        return preview.preview_sigmas(m, p["steps"], p["sampler"], p["scheduler"], p["denoise"])
    except Exception:
        return []   # «custom SIGMAS» without a parsed list (a clear run error elsewhere): nothing to plot


def upscale_video_latent(vae, v, w, h, method="learned", frames=None, model=None):
    """Video latent [1,24,T,h',w'] -> the w x h canvas via the learned H3 latent upscaler;
    missing model = spatial latent stretch + refine (warn toast; no abort).
    model: which learned upscaler file (settings.upscale_model, "" = the first). Audio is never touched."""
    if tuple(v.shape[-2:]) == (h // 16, w // 16):
        return v
    from . import h3s_upscale
    chosen = h3s_upscale.picked_learned_model(model)
    if "2d_conv" in (chosen or "").lower():
        # A 2D upscale shifts the geometry a little; on a join with source footage that shows up.
        vlog("  upscale: 2D-модель (LBH) слегка сдвигает геометрию — на стыке с исходным видеом лучше 3D")
    return h3s_upscale.upscale_input(vae, v, w, h, "learned", frames, model=model)[0]


# ---------------------------------------------------------------- one segment
def refs_line(project, index, kmode, images, ref_videos, ref_audios, cards, cont):
    """v6n console line: the references a segment really passes to the model — '[H3ZS] refs: N images, M videos (…)'.
    REF + ControlNet looked «as slow as with a video ref»: this says whether one is there."""
    seg = project["segments"][index]
    names = [a.get("name") or a.get("file") for a in core.ordered_refs(project, seg)]
    if cont and core.continuity_picture(project, index):
        names.append("last frame of the previous clip")
    vids = [f"«{a.get('name') or a.get('file')}» {int(fr.shape[0])} fr" for a, fr in zip(core.video_refs(project, seg), ref_videos or [])]
    cards = cards or {}
    nc = {k: len(v) for k, v in cards.items() if v}
    parts = [f"{len(images)} images" + (f" ({', '.join(map(str, names))})" if names else ""),
             f"{len(ref_videos or [])} videos" + (f" ({', '.join(vids)})" if vids else "")]
    if ref_audios:
        parts.append(f"{len(ref_audios)} audio")
    if nc:
        parts.append("cards " + ", ".join(f"{k} ×{n}" for k, n in nc.items()))
    if kmode != "t2v":
        parts.append(f"FLF/keyframes mode {kmode}")
    return "refs: " + ", ".join(parts)


# ---------------------------------------------------------------- continuation noise
# One noise field for the whole film instead of one per clip. comfy.sample.prepare_noise() restarts the
# generator at every segment, so a continued clip drew a field unrelated to the one its predecessor used
# on the very same frames and the DC level jumped on every stitch (measured: blue +1.37 with a fresh
# field, +0.13 with a shared one). Here every latent step draws its own block from a generator seeded by
# (seed, absolute pixel frame of the step, stream), so a step gets the same noise wherever it lands.
# Pixel frames, not latent or audio indices: the video grid repeats every 17 pixel frames (5 latent steps,
# points at 17k+{0,1,5,9,13}) while the audio stream is a uniform 40 Hz tick, so an index offset drifts
# by the grid head exactly at the seams. Clip starts are multiples of 17, so the grids coincide and the
# field of a continued clip continues its predecessor's step by step.
NOISE_TAG = "h3zs-1"   # changing it re-rolls every take; keep it stable


def noise_seed(seed, frame, stream):
    """Stable 64-bit generator seed of one latent step (hashlib: Python's hash() is salted per process)."""
    d = hashlib.blake2b(f"{NOISE_TAG}|{int(seed)}|{int(frame)}|{stream}".encode(), digest_size=8).digest()
    return int.from_bytes(d, "little")


def _noise_block(seed, frame, stream, shape):
    g = torch.Generator()
    g.manual_seed(noise_seed(seed, frame, stream))
    return torch.randn(shape, generator=g, dtype=torch.float32)


def position_noise(video, audio, seed, start):
    """The noise field of a segment as if the whole film shared one field: keyed by absolute film time.

    `start` is the segment's first pixel frame on the stitched timeline (core.plan -> item["start"]), so a
    continued clip draws the same noise the previous clip had on the overlapping frames — and the same
    field right after the seam, which is what keeps the level from stepping. Both arms are IID normal,
    exactly like prepare_noise(); only the seeding changed.
    """
    c, t, h, w = (int(x) for x in video.shape[1:])
    v = torch.empty([1, c, t, h, w], dtype=torch.float32)
    for i in range(t):
        v[:, :, i] = _noise_block(seed, start + core.frames_for_latent(i), "v", [1, c, 1, h, w])[:, :, 0]
    c, ch, a_n = (int(x) for x in audio.shape[1:])
    tick = int(round(start * core.AUDIO_LATENT_FPS / core.FPS))   # the segment's first absolute audio tick
    a = torch.empty([1, c, ch, a_n], dtype=torch.float32)
    for k in range(a_n):
        a[..., k] = _noise_block(seed, tick + k, "a", [1, c, ch, 1])[..., 0]
    return comfy.nested_tensor.NestedTensor((v, a))


def sample_segment(model, clip, vae, project, index, items, prev, ref_images, audio_z=None, step_cb=None, preview_cb=None,
                   audio_cov=None, ref_audios=None, ref_videos=None, init=None, kind="full", refine=None,
                   sampling_started=None, guide=None):
    """prev: dict(v, a, last_frame) of the finished previous segment (or None), of the same pass kind.
    kind: "full" | "draft" (canvas/steps of the pass) | "refine": `refine` = (upscaled video latent, draft audio
    latent); the video is re-sampled with partial denoise, the draft audio is kept 1:1 through the H3 audio
    denoise mask (it already holds the continuation and the locked track).
    Returns (video_latent [1,24,T,h,w], audio_latent [1,32,2,A]) on CPU."""
    s = project["settings"]
    it = items[index]
    p = core.pass_params(project, index, kind)
    w, h = core.work_resolution(s, kind)
    T, A = it["latent_t"], it["audio_t"]
    dev = comfy.model_management.intermediate_device()
    video = torch.zeros([1, 24, T, h // 16, w // 16], device=dev)
    audio = torch.zeros([1, 32, 2, A], device=dev)
    if init is not None:   # vid2vid: start from the footage latent, partial denoise
        iv, ia = init
        video[:, :, :min(T, iv.shape[2])] = iv[:, :, :T].to(video.device, video.dtype)
        audio[..., :min(A, ia.shape[-1])] = ia[..., :A].to(audio.device, audio.dtype)
        p["denoise"] = float(project["segments"][index]["source"]["denoise"])
    if refine is not None:   # final from the draft: start from the upscaled draft, partial denoise
        rv_, ra_ = refine
        video[:, :, :min(T, rv_.shape[2])] = rv_[:, :, :T].to(video.device, video.dtype)
        audio[..., :min(A, ra_.shape[-1])] = ra_[..., :A].to(audio.device, audio.dtype)
    lock_v = w_v = lock_a = w_a = None
    # audio that must be kept (previous tail / locked track) goes through H3's native denoise mask: those
    # rows are injected clean every step and labelled with the clean timestep, so the model hears them as
    # context from the first step on (an x0 replacement only showed it a noised copy -> no real continuation)
    amask = torch.ones([1, 1, 2, A])
    keyframes = []
    if guide is not None:   # Character Swap: original video is conditioning, NOT a vid2vid starting x0.
        gv = guide["v"].float().cpu()
        if tuple(gv.shape) != tuple(video.shape):
            raise ValueError(f"Character Swap guide shape {tuple(gv.shape)} != target {tuple(video.shape)}")
        gkf = {"resolved_frame_index": 0, "latent": gv.clone()}
        ga = guide.get("a")
        if ga is not None:
            gkf["audio_latent"] = ga.float().cpu().clone()
        keyframes.append(gkf)
        log(f"  character swap: guide latent {tuple(gv.shape)} at frame 0"
            + (" + source audio" if ga is not None else ""))
    cont = it["link"] == "extend" and prev is not None
    hidden_handover = False  # all three modes use a carried latent overlap; none uses LAST FRAME hidden handover
    if cont and it["overlap"]:
        ov_t = core.latent_t(it["overlap"])                    # 5o+2 latent frames
        pv, pa = prev["v"], prev["a"]
        tail_v = pv[:, :, pv.shape[2] - ov_t:].to(video.dtype)
        f_start = items[index - 1]["frames"] - it["overlap"]   # pixel frame inside prev where the overlap starts
        a_ov = pa.shape[-1] - round(f_start / core.FPS * core.AUDIO_LATENT_FPS)
        a_ov = max(0, min(a_ov, A))
        if not hidden_handover:
            video[:, :, :ov_t] = tail_v.to(video.device)
            keyframes.append({"resolved_frame_index": 0, "latent": tail_v.clone()})
        if not hidden_handover and s.get("lock_overlap", True):
            lock_v = video.clone()
            ramp_px = int(s.get("video_ramp_frames") or 0)
            ramp_t = max(0, min(ov_t, round(ramp_px / 4))) if ramp_px else 0
            w_v = video_lock_weights(T, ov_t, ramp_t)
            if ramp_t:
                vlog(f"  video ramp: the last {ramp_t} latent frame(s) of the overlap are released "
                     f"gradually ({ramp_px} px)")
        # audio: the new segment continues the previous sound (own switch, independent of the video lock)
        if a_ov and core.audio_lock_overlap(project) and refine is None:
            s0 = pa.shape[-1] - a_ov                       # audio frame of prev where the overlap starts
            tail_a = pa[..., s0:].float()
            # 1) the overlap audio is copied into the target and protected with H3's audio denoise mask
            audio[..., :a_ov] = tail_a.to(audio.device, audio.dtype)
            lock_a = audio.clone()
            w_a = torch.zeros(A)
            w_a[:a_ov] = 1.0
            ramp = core.AUDIO_HANDOFF_TICKS if core.AUDIO_HANDOFF_TICKS and a_ov > 2 * core.AUDIO_HANDOFF_TICKS else 0
            if ramp:   # the last ticks gradually receive denoising: soft hand-off into the new sound
                w_a[a_ov - ramp:a_ov] = 1.0 - torch.arange(1, ramp + 1, dtype=torch.float32) / (ramp + 1)
            # 2) the previous sound as clean cond rows on this clip's timeline, ending where the overlap ends and
            #    reaching back before it (audio_context_sec): the model hears "this clip, earlier", not a reference
            ext = core.audio_context_extra(project, a_ov, s0)   # extra audio frames before the overlap (multiple of 5)
            kf_idx = -(ext * 3 // 5)                              # 5 audio frames = 3 pixel frames (FRAME_RESCALE 5/3)
            keyframes.append({"resolved_frame_index": kf_idx, "audio_latent": pa[..., s0 - ext:].float().clone()})
            vlog(f"  audio context: overlap {a_ov} fr ({a_ov / core.AUDIO_LATENT_FPS:.2f}s, prev frames {s0}-{pa.shape[-1] - 1})"
                 f" + {ext} fr ({ext / core.AUDIO_LATENT_FPS:.2f}s) before it as cond audio at pixel frame {kf_idx}; hand-off ramp {ramp} fr")
    if refine is not None:   # the whole draft sound is kept: continuation and locked track are already in it
        lock_a, w_a = audio.clone(), torch.ones(A)
        strength = (f"BasicScheduler denoise {p['schedule_denoise']}" if p.get("schedule_mode") == "basic"
                    else f"start sigma {p['sigma0']}")
        vlog(f"  refine: draft {tuple(refine[0].shape)} -> {w}x{h}, {strength}, {p['steps']} steps, "
             f"draft audio kept ({A / core.AUDIO_LATENT_FPS:.2f}s)")
    elif guide is not None and guide.get("keep_audio") and guide.get("a") is not None:
        # Keep the source soundtrack latent through every sampling step.
        ga = guide["a"].to(audio.device, audio.dtype)
        audio[..., :min(A, ga.shape[-1])] = ga[..., :A]
        lock_a, w_a = audio.clone(), torch.ones(A)
    elif audio_z is not None:   # audio track = main composition: locked where a clip lies
        sl, wt = slice_audio_latent(audio_z, it["start"], A, audio_cov)
        if wt.sum() > 0:
            if lock_a is None:
                lock_a, w_a = sl.to(audio.dtype), wt
            else:   # the track wins over the previous segment's tail
                lock_a = torch.where(wt.bool(), sl.to(lock_a.dtype), lock_a)
                w_a = torch.maximum(w_a, wt)
            audio = lock_a * w_a + audio * (1 - w_a)
    if cont and it["overlap"]:
        vlog(f"  seam {index}->{index + 1}: overlap {it['overlap']} fr ({core.latent_t(it['overlap'])} latent fr) "
             f"video {'locked' if lock_v is not None else 'keyframe only'}; audio overlap "
             f"{'kept from the draft (whole clip)' if refine is not None else 'locked to previous tail' if (lock_a is not None and core.audio_lock_overlap(project)) else 'free'}")
    if audio_z is not None and w_a is not None:
        vlog(f"  audio lock: {float(w_a.sum()) / core.AUDIO_LATENT_FPS:.2f}s of {A / core.AUDIO_LATENT_FPS:.2f}s fixed "
             f"(track clips{' + previous tail' if cont and it['overlap'] else ''})")
    seg_k = project["segments"][index]
    kmode = core.kf_mode(project, seg_k) if init is None else "t2v"   # vid2vid keeps its own path
    images = list(ref_images)
    if cont and core.continuity_picture(project, index):
        images.append(prev["last_frame"])
    if len(images) > core.MAX_REF_IMAGES:
        raise ValueError(f"H3ZeroStudio: отрезок {index + 1}: {len(images)} референсов, максимум {core.MAX_REF_IMAGES}")
    if kind == "refine":   # final-from-draft ignores video references (slow, VRAM-hungry): the draft already has the motion
        ref_videos = None
    # Stage 2 normally omits video-like character refs. A multi-photo RefMod card is stored as
    # a synthetic temporal stack, not a real video: optionally reuse its FIRST photo as an
    # ordinary Picture for identity, while preserving the independently encoded voice.
    identity_cards = None
    identity_image_ids = set()
    if kind == "refine" and s.get("refine_identity_images"):
        identity_cards = holder_cards(project, seg_k, vae, "refine_identity")
        identity_image_ids = {
            cid for _item, _block, cid in (identity_cards or {}).get("image", ())
            if (project.get("cards", {}).get(cid) or {}).get("vkind") != "image"
        }
    prompt = core.compose_prompt(project, index, video=(kind != "refine"),
                                 identity_image_ids=identity_image_ids)
    if kind == "refine" and (s.get("refine_prompt") or "").strip():
        # the second pass can aim at detail instead of re-describing the scene (the reference workflow does this)
        prompt = (s["refine_prompt"]).strip()
    if VERBOSE[0]:
        seg = project["segments"][index]
        labels = [f"<Picture {j + 1}>={a.get('name') or a.get('file')}" for j, a in enumerate(core.ordered_refs(project, seg))]
        if cont and core.continuity_picture(project, index):
            labels.append(f"<Picture {len(labels) + 1}>=last frame of segment {index}")
        labels += [f"<Audio {j + 1}>={a.get('name') or a.get('id')}" for j, a in enumerate(core.audio_refs(project, seg))]
        if kind != "refine":
            labels += [f"<Video {k + 1}>={a.get('name')}" for k, a in enumerate(core.video_refs(project, seg)[:core.MAX_REF_VIDEOS])]
        if kmode != "t2v":
            fa_, la_ = core.kf_assets(project, seg)
            labels += [f"{r} frame={a.get('name') or a.get('file')}" for r, a in (("first", fa_), ("last", la_)) if a]
        vlog(f"  mode {'vid2vid denoise ' + str(p['denoise']) if init is not None else 'refine from sigma ' + str(p['sigma0']) if refine is not None else kind + ('' if kmode == 't2v' else ' · frames ' + kmode)} · {w}x{h} · start {it['start'] / core.FPS:.2f}s · link {it['link']} · refs: {', '.join(labels) or 'none'}")
        vlog(f"  prompt: {prompt[:220]}{'…' if len(prompt) > 220 else ''}")
    log(f"segment {index + 1}{' [' + kind + ']' if kind != 'full' else ''}: {it['frames']} frames, {len(images)} ref(s), overlap {it['overlap']} fr, "
        f"steps {p['steps']} cfg {p['cfg']} seed {p['seed']} {p['sampler']}/{p['scheduler']}")
    cond_t0 = time.perf_counter()
    cards = identity_cards if kind == "refine" and s.get("refine_identity_images") else holder_cards(project, seg_k, vae, kind)
    if identity_image_ids:
        log(f"  refine identity: first photos from {len(identity_image_ids)} stacked card(s) as Picture; voices remain Audio")
    # Opt-in, full-pass REF conditioning only. A hand-picked audio or character
    # voice reference always wins. The original clip audio and handover stay intact.
    if (s.get("self_anchor_voice") and kind == "full" and cont
            and kmode == "t2v" and init is None and not ref_audios
            and not core.audio_refs(project, seg_k) and not (cards or {}).get("audio")):
        anchor_audio = voice.first_voice_latent(prev)
        if anchor_audio is not None:
            ref_audios = [anchor_audio]
            prompt = voice.reference_prompt(prompt)
            log(f"  self voice: <Audio 1> anchored from first clip of chain "
                f"({anchor_audio.shape[-1] / core.AUDIO_LATENT_FPS:.1f}s, experimental)")
        else:
            log("  self voice: no usable previous audio latent, skipped")
    if cards:
        log(f"  characters: " + ", ".join(f"<{'Picture' if k == 'image' else k.title()}> ×{len(v)}" for k, v in cards.items() if v)
            + " · " + "; ".join(f"{r['snap'].get('name', r['id'])}: " + ", ".join([f"<Picture {n}>" for n in r["image"]] + [f"<Video {n}>" for n in r["video"]] + [f"<Audio {n}>" for n in r["audio"]])
                                for r in core.card_labels(project, project["segments"][index], index, video=(kind != "refine"),
                                                          identity_image_ids=identity_image_ids)))
    log(refs_line(project, index, kmode, images, ref_videos, ref_audios, cards, cont))   # v6n: what the model really gets
    if hidden_handover:
        # LAST FRAME: the previous decoded RGB frame guides the *last hidden pixel frame*.
        # Earlier hidden frames are generated, never copied from the preceding video.
        # The stitcher already excludes it["overlap"] frames from every continued clip.
        fa, la = core.kf_assets(project, seg_k)
        # Explicit FLF first frame wins; LAST FRAME is only a fallback for an empty first slot.
        fi = load_asset_image(fa) if fa else prev["last_frame"].detach().float().cpu().contiguous()
        li = load_asset_image(la) if la else None
        fit = kf_crops(*core.kf_fit(project))
        ref_args = (images, s.get("ref_size", "match"), ref_audios, ref_videos, cards)
        pos, handover_kfs = encode_cond_kf(clip, vae, prompt, fi, li, w, h, it["frames"], fit, *ref_args)
        neg = pos if p["cfg"] == 1.0 else encode_cond_kf(clip, vae, s.get("negative") or "", fi, li, w, h, it["frames"], fit, *ref_args)[0]
        handover_kfs[0]["resolved_frame_index"] = 0 if fa else it["overlap"] - 1
        keyframes = handover_kfs + keyframes  # retain native audio conditioning
        log(f"  LAST FRAME: previous RGB -> hidden frame {it['overlap'] - 1}; hidden prefix {it['overlap']} frames excluded from export")
    elif kmode != "t2v":
        fa, la = core.kf_assets(project, seg_k)
        fi = load_asset_image(fa) if fa else None
        li = load_asset_image(la) if la else None
        fit = kf_crops(*core.kf_fit(project))
        ref_args = (images, s.get("ref_size", "match"), ref_audios, ref_videos, cards)
        pos, kfs = encode_cond_kf(clip, vae, prompt, fi, li, w, h, it["frames"], fit, *ref_args)
        neg = pos if p["cfg"] == 1.0 else encode_cond_kf(clip, vae, s.get("negative") or "", fi, li, w, h, it["frames"], fit, *ref_args)[0]
        keyframes = kfs + keyframes   # the continuation tail (last frame only + extend) stays at frame 0
        log(f"  frames mode {kmode} (fit {'/'.join(fit)}): " + ", ".join(f"{'first' if k['resolved_frame_index'] == 0 else 'last'} frame → pixel frame {k['resolved_frame_index']}" for k in kfs))
    else:
        pos = encode_cond(clip, vae, prompt, images, w, h, s.get("ref_size", "match"), ref_audios, ref_videos, cards)
        neg = pos if p["cfg"] == 1.0 else encode_cond(clip, vae, s.get("negative") or "", images, w, h, s.get("ref_size", "match"), ref_audios, ref_videos, cards)
    log(f"  preparation timing: characters + conditioning {time.perf_counter() - cond_t0:.1f}s")
    sample_setup_t0 = time.perf_counter()
    pos, neg = add_keyframes(pos, keyframes), add_keyframes(neg, keyframes)
    m = apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    m, cinfo = control.apply(m, vae, project, it, log=log, warn=CTL_RUN.get("warn"), asset_path_fn=asset_path)   # v6k ControlNet track
    CTL_RUN["info"][index] = cinfo
    pi_sigmas = None
    if kind == "full" and s.get("piflow_steps") in (2, 4):
        m, pi_sigmas = piflow_patch_and_sigmas(m, s["piflow_steps"], s)
    noise_mask = None
    if w_a is not None and float(w_a.max()) > 0:
        audio = (lock_a * w_a + audio * (1 - w_a)).to(audio.dtype)
        amask = (1.0 - w_a.float().clamp(0, 1)).view(1, 1, 1, A).expand(1, 1, 2, A).contiguous()
        # latent_image is in model space: process_latent_in / scale_latent_inpaint apply audio_scale themselves
        noise_mask = comfy.nested_tensor.NestedTensor((torch.ones([1, 1] + list(video.shape[2:])), amask))
        kept = int((w_a > 0.5).sum())
        ka = audio[..., w_a > 0.5]
        cak = [k for k in keyframes if k.get("audio_latent") is not None]
        log(f"  audio lock: latent {tuple(audio.shape)}, kept {kept}/{A} frames = {kept / core.AUDIO_LATENT_FPS:.2f}s "
            f"(frames {int(torch.nonzero(w_a > 0.5)[0])}-{int(torch.nonzero(w_a > 0.5)[-1])}), "
            f"kept latent mean {float(ka.mean()):+.3f} std {float(ka.std()):.3f}; mask zeros {int((amask < 0.5).sum())} of {amask.numel()}; "
            f"cond audio keyframe {'yes ' + str(tuple(cak[0]['audio_latent'].shape)) + ' at frame ' + str(cak[0]['resolved_frame_index']) if cak else 'no'}")
    if (lock_v is not None or noise_mask is not None) and (s.get("final_mode") != "luna" or guide is not None):
        m.set_model_unet_function_wrapper(LockWrapper(lock_v, w_v, None, None, probe=int((w_a > 0.5).sum()) if noise_mask is not None else None))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    luna = bool(kind == "full" and s.get("final_mode") == "luna" and init is None and guide is None)
    # Low/High prepares correctly sized noise per arm. Avoid a third, unused
    # full-resolution noise tensor on long scenes.
    check_custom_sigmas(p)
    sigmas = pi_sigmas if pi_sigmas is not None else pass_sigmas(m, p, refine is not None)
    advanced_hires = (s.get("final_mode") == "refine" and s.get("refine_schedule_mode") == "basic"
                      and kind in ("draft", "refine"))
    if advanced_hires and kind == "draft" and sigmas is None:
        # Original graph's first BasicScheduler: normal complete schedule, explicitly fed into
        # SamplerCustomAdvanced (not the legacy KSampler path). Respect a chosen draft denoise.
        sigmas = basic_refine_sigmas(m, p["steps"], p["scheduler"], p["denoise"])
    if refine is not None and CUSTOM["sigmas_pass2"] is not None:
        sigmas = CUSTOM["sigmas_pass2"]
        # Explicit external Stage 2 SIGMAS override the UI's default refine strength.
        # The second pass still starts from the decoded draft latent; this is NOT a
        # guaranteed continuation of a nonzero-sigma diffusion trajectory.
        p["steps"] = len(sigmas) - 1
        log(f"  Stage 2 external SIGMAS: {p['steps']} steps, start {float(sigmas[0]):.4f}, end {float(sigmas[-1]):.4f}; "
            "overrides UI refine strength; separate refinement of draft latent")
    fresh = refine is None and init is None   # starts from pure noise: wired SIGMAS apply
    if p.get("sigmas") is not None:
        vlog(f"  custom sigmas: {p['steps']} steps {[round(float(x), 3) for x in sigmas.tolist()]}")
    elif pi_sigmas is not None:
        log(f"  pi-Flow Scheduler: {p['steps']} steps, sigmas {[round(float(x), 5) for x in sigmas]}")
    elif sigmas is not None:
        if advanced_hires and kind == "draft":
            log(f"  Advanced draft BasicScheduler: {p['steps']} steps from sigma {float(sigmas[0]):.3f} "
                f"({p['scheduler']}; denoise {p['denoise']:.3f}; sample_custom)")
        else:
            mode_name = (f"BasicScheduler denoise={p['schedule_denoise']:.3f} / sample_custom"
                         if refine is not None and p.get("schedule_mode") == "basic" else "absolute start sigma")
            log(f"  refine schedule: {p['steps']} steps from sigma {float(sigmas[0]):.3f} "
                f"({p['scheduler']}; {mode_name})")
    elif fresh and CUSTOM["sigmas"] is not None:
        vlog(f"  wired sigmas: {p['steps']} steps {[round(float(x), 3) for x in CUSTOM['sigmas'].tolist()]}")
    if hasattr(preview_cb, "set_sigmas"):
        preview_cb.audio_scale = sampler_audio_scale(m) or 1.0
        preview_cb.set_sigmas(preview_sigma_list(m, p, sigmas, fresh))

    def cb(step, x0, x, total):
        comfy.model_management.throw_exception_if_processing_interrupted()
        if preview_cb is not None:
            try:
                preview_cb(step, x0, x, total)
            except Exception:
                pass
        if step_cb is not None:
            step_cb(step, total)

    if luna:
        if p["denoise"] != 1.0:
            raise ValueError("Low Res → High Res требует denoise=1.0")
        if p["steps"] < 2:
            raise ValueError("Low Res → High Res требует минимум 2 шага")
        if not upscale.capabilities()["learned"]:
            raise ValueError("Low Res → High Res: обученный H3 latent upscaler не найден; установите модель и узел апскейлера")
        from .h3s_luna import luna_two_pass
        m2_base = CUSTOM["model_pass2"] if CUSTOM["model_pass2"] is not None else model
        m2 = apply_shift(m2_base, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else m2_base.clone()
        m2, _ = control.apply(m2, vae, project, it, log=log, warn=CTL_RUN.get("warn"), asset_path_fn=asset_path)
        # Low-res stage resizes the video grid, so a full-resolution LockWrapper would be
        # dimensionally invalid on pass 1. Use the sampler's native nested mask.
        if lock_v is not None:
            vmask = (1.0 - w_v.float()).view(1, 1, T, 1, 1).expand(1, 1, T, video.shape[-2], video.shape[-1]).contiguous()
            noise_mask = comfy.nested_tensor.NestedTensor((vmask, amask))
        total = int(p["steps"])
        transition, lowhigh_scale, highres_denoise = core.lowhigh_params(s, total)
        low_s = luna_two_pass.arm_sigmas(m, p["scheduler"], total, transition, True)
        # Keep the lifted low-res result: lower High Res denoise starts at a lower sigma.
        high_s = luna_two_pass.arm_sigmas(m2, p["scheduler"], total, transition, False, denoise=highres_denoise)
        # Developer-only A/B: alter the spacing of the SAME High Res steps, not the
        # denoise entry point, final fine-detail step, or saved default recipe.
        if s.get("high_sigma_schedule") == "karras7" or s.get("_ab_high_sigmas") == "karras7":
            from .h3s_luna.high_sigma_experiment import frontload_high_sigmas
            baseline_sigmas = high_s.clone()
            high_s = frontload_high_sigmas(high_s, rho=7.0)
            log(f"  sigma A/B karras7: baseline {[round(float(x), 5) for x in baseline_sigmas]} "
                f"-> test {[round(float(x), 5) for x in high_s]}")
        if abs(float(low_s[-1]) - float(high_s[0])) > 1e-4:
            log(f"  Low→High: boundary differs across models: {float(low_s[-1]):.5f} vs {float(high_s[0]):.5f}; audio handover compensates")
        if hasattr(preview_cb, "set_sigmas"):
            preview_cb.set_sigmas([float(x) for x in low_s] + [float(x) for x in high_s[1:]])
        # The trained upscaler works in VAE latent space. The lift callable
        # receives model-space latents; convert explicitly in both directions.
        latent_format = m.get_model_object("latent_format")
        def trained_lifter(z, hw):
            z_vae = latent_format.process_out(z)
            result = upscale.learned_upscale(z_vae, int(hw[1]) * 16, int(hw[0]) * 16, s.get("upscale_model") or None)
            if result is None:
                raise RuntimeError("Low Res → High Res: trained latent upscaler failed; refusing silent interpolation fallback")
            if tuple(result.shape) != (z.shape[0], z.shape[1], z.shape[2], int(hw[0]), int(hw[1])):
                raise ValueError(f"Low Res → High Res: wrong trained upscaler output {tuple(result.shape)} for target {hw}")
            return latent_format.process_in(result).to(z)
        stage = [0]
        def luna_cb(step, x0, x, n):
            comfy.model_management.throw_exception_if_processing_interrupted()
            if step == 0 and stage[0] == 0:
                stage[0] = 1
            elif step == 0 and stage[0] == 1:
                stage[0] = 2
                if hasattr(preview_cb, "set_sigmas"):
                    # Changing the sigma chart must not erase the elapsed time
                    # of the first High Res step (formerly displayed as 0 ms).
                    previous_clock = getattr(preview_cb, "t_step", None)
                    preview_cb.set_sigmas([float(v) for v in high_s])
                    if previous_clock is not None:
                        preview_cb.t_step = previous_clock
            cb(step, x0, x, n)
        sampler_low = CUSTOM["sampler"] or comfy.samplers.sampler_object(p["sampler"])
        sampler_high = CUSTOM["sampler_pass2"] or CUSTOM["sampler"] or comfy.samplers.sampler_object(p["sampler"])
        latent_image = {"samples": samples}
        if noise_mask is not None:
            latent_image["noise_mask"] = noise_mask
        log(f"  Low Res → High Res: {transition}+{total-transition} steps, scale {lowhigh_scale:.2f}, high-res denoise {highres_denoise:.2f}, sigma {float(high_s[0]):.5f}, trained upscaler {upscale.picked_learned_model(s.get('upscale_model') or None)}")
        from . import h3s_memory as memory
        heal_loaded_models()
        # Each arm's MLP policy uses its *actual* token count. The source latent
        # is full-size, but the Low Res pass downsamples it before sampling.
        # Do not spend FFN chunks on Low Res merely because High Res is large.
        video_shape = samples.unbind()[0].shape
        t_lat, h_lat, w_lat = (int(v) for v in video_shape[-3:])
        low_h = max(2, round(h_lat * lowhigh_scale / 2) * 2)
        low_w = max(2, round(w_lat * lowhigh_scale / 2) * 2)
        low_tokens = t_lat * low_h * low_w // 4
        high_tokens = t_lat * h_lat * w_lat // 4
        low_mem = _memsave(m, samples, tokens=low_tokens)
        high_mem = _memsave(m2, samples, tokens=high_tokens)
        phase_times = {}
        def stage_profile(stage, seconds, step_count):
            phase_times[stage] = (float(seconds), int(step_count))
        log(f"  preparation timing: model + sampler setup {time.perf_counter() - sample_setup_t0:.1f}s")
        profile_started = time.perf_counter()
        if sampling_started is not None:
            sampling_started()  # start ETA after references, conditioning and sampler setup
        try:
            result, _ = luna_two_pass.two_pass_sample(
                low_mem, pos, neg, vae, latent_image, sampler_low, sampler_high, p["scheduler"],
                total, transition, int(p["seed"]), p["cfg"], p["cfg"], lowhigh_scale,
                0.0, 0.0, 0.0, latent_lifter=trained_lifter, high_res_model=high_mem,
                sigmas_low=low_s, sigmas_high=high_s, on_step=luna_cb,
                on_boundary=lambda stage: memory.cleanup_runtime(stage), return_low_res=False,
                on_profile=stage_profile)
        finally:
            # Avoid stale Comfy loaded-model entries from temporary FFN clones.
            hand_back(high_mem)
            hand_back(low_mem)
        if phase_times:
            low_sec, low_n = phase_times.get("low", (0.0, 0))
            lift_sec, _ = phase_times.get("lift", (0.0, 0))
            high_sec, high_n = phase_times.get("high", (0.0, 0))
            other_sec = max(0.0, time.perf_counter() - profile_started - low_sec - lift_sec - high_sec)
            log(f"  Low→High timing: Low {low_sec:.1f}s ({low_sec / max(1, low_n):.1f}s/step); "
                f"trained lift {lift_sec:.1f}s; High {high_sec:.1f}s ({high_sec / max(1, high_n):.1f}s/step); "
                f"handoff/cleanup {other_sec:.1f}s")
        ov_, oa_ = result["samples"].unbind()
        return ov_.float().cpu(), oa_.float().cpu()

    field_seed = core.noise_seed_for(project, index, kind)
    noise = position_noise(video, audio, field_seed, it["start"])   # one field for the whole film (see position_noise)
    vlog(f"  noise: field positioned at pixel frame {it['start']} (field seed {field_seed}, audio tick "
         f"{int(round(it['start'] * core.AUDIO_LATENT_FPS / core.FPS))}) — shared with the neighbouring clips")
    if sampling_started is not None:
        sampling_started()
    prefer_stage_sampler = (advanced_hires and bool(s.get(kind + "_sampler")))
    if prefer_stage_sampler and CUSTOM["sampler"] is not None and not (refine is not None and CUSTOM["sampler_pass2"] is not None):
        log(f"  Advanced pass {1 if kind == 'draft' else 2}: project sampler {p['sampler']} overrides shared SAMPLER cable")
    out = sample_pass(m, noise, p["steps"], p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples, p["denoise"], cb, p["seed"],
                      noise_mask=noise_mask, sigmas=sigmas, fresh=fresh, second=refine is not None,
                      advanced=advanced_hires or pi_sigmas is not None, prefer_stage_sampler=prefer_stage_sampler)
    if pi_sigmas is not None:
        import nodes
        pixels = nodes.NODE_CLASS_MAPPINGS["DWD Decode"]().decode({"samples": out})[0]
        PIFLOW_RUN["frames"][index] = pixels.float().cpu()
        log(f"  pi-H3 DWD: decoded {pixels.shape[0]} frames directly; video VAE bypassed")
    ov_, oa_ = out.unbind()
    if noise_mask is not None:
        sel = w_a > 0.999
        err = float((oa_.float().cpu()[..., sel] - audio.float().cpu()[..., sel]).abs().max())
        log(f"  audio lock check: kept frames reproduced, max |out - kept| = {err:.2e}" + ("" if err < 1e-2 else "  <-- NOT KEPT"))
    if refine is not None:
        original_audio = refine[1].float().cpu()
        if tuple(original_audio.shape) != tuple(oa_.shape):
            raise ValueError(f"H3ZeroStudio Stage 2: audio latent shape mismatch: draft {tuple(original_audio.shape)} vs refine {tuple(oa_.shape)}")
        audio_error = float((oa_.float().cpu() - original_audio).abs().max())
        log(f"  Stage 2 audio preserved from draft: sampled delta {audio_error:.2e}; original audio restored (exact tensor)")
        return ov_.float().cpu(), original_audio
    return ov_.float().cpu(), oa_.float().cpu()


def face_refine_key(base_key, fr, seed):
    """v6k «Рефайн лица»: cache key of the face-refined copy of a take (h3s_face.face_refine_key)."""
    from . import h3s_face
    return h3s_face.face_refine_key(base_key, fr, seed)


def audio_refine_key(base_key, steps, denoise, video_denoise, seed):
    """Cache key of an audio-refined copy of a segment (alphanumeric, like every segment key)."""
    h = hashlib.sha1(json.dumps([steps, round(denoise, 3), round(video_denoise, 3), seed, "ar1"]).encode()).hexdigest()[:10]
    return f"{base_key}A{h}"


def refine_audio(model, clip, vae, project, index, items, v, a, ar, ref_images, ref_audios=None, step_cb=None):
    """«Улучшить звук»: extra sampler steps over the SOUND of a finished segment (own implementation of the
    H3-AudioRefine idea). The video latent is frozen by the noise mask (video_denoise 0 -> bit-identical),
    the audio latent is re-noised by `denoise` (0.3-0.6 keeps the sound and adds detail, 1.0 = new sound) and
    re-sampled with the segment's own prompt / cfg / sampler / scheduler / shift.
    ar = dict(steps, denoise, video_denoise). Returns (video_latent, audio_latent) on CPU."""
    s = project["settings"]
    p = core.pass_params(project, index, "full")
    steps, den, vden = int(ar["steps"]), float(ar["denoise"]), float(ar["video_denoise"])
    h, w = int(v.shape[-2]) * 16, int(v.shape[-1]) * 16
    A = int(a.shape[-1])
    dev = comfy.model_management.intermediate_device()
    video, audio = v.to(dev).float().clone(), a.to(dev).float().clone()
    images = list(ref_images)[:core.MAX_REF_IMAGES]
    prompt = core.compose_prompt(project, index, video=True)
    cards = holder_cards(project, project["segments"][index], vae, "full")
    pos = encode_cond(clip, vae, prompt, images, w, h, s.get("ref_size", "match"), ref_audios, None, cards)
    neg = pos if p["cfg"] == 1.0 else encode_cond(clip, vae, s.get("negative") or "", images, w, h, s.get("ref_size", "match"), ref_audios, None, cards)
    m = apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    # noise mask: 1 = re-sampled, 0 = kept exactly
    vmask = torch.full([1, 1] + list(video.shape[2:]), max(0.0, min(1.0, vden)))
    amask = torch.ones([1, 1, 2, A])
    noise_mask = comfy.nested_tensor.NestedTensor((vmask, amask))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    seed = int(p["seed"])
    noise = comfy.sample.prepare_noise(samples, seed)
    log(f"segment {index + 1} [audio refine]: {steps} steps, audio denoise {den}, video denoise {vden}, "
        f"cfg {p['cfg']} {p['sampler']}/{p['scheduler']}, {A / core.AUDIO_LATENT_FPS:.2f}s of sound")

    def cb(step, x0, x, total):
        comfy.model_management.throw_exception_if_processing_interrupted()
        if step_cb is not None:
            step_cb(step, total)

    check_custom_sigmas(p)
    sig = pass_sigmas(m, p, False)   # «custom SIGMAS»: the exact list (the denoise fraction gives way to it)
    out = sample_pass(m, noise, steps, p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples, den, cb, seed, noise_mask=noise_mask, sigmas=sig)
    ov_, oa_ = out.unbind()
    if vden <= 0:
        err = float((ov_.float().cpu() - v.float()).abs().max())
        log(f"  audio refine: video frozen check max |out - in| = {err:.2e}" + ("" if err < 1e-2 else "  <-- VIDEO CHANGED"))
        ov_ = v.to(ov_.dtype).to(ov_.device)   # bit-identical picture regardless of numeric noise
    return ov_.float().cpu(), oa_.float().cpu()


# ---------------------------------------------------------------- live preview
# MiniMaxH3Video.latent_rgb_factors (comfy/latent_formats.py), used if the model does not expose them
H3_RGB = [[-0.018555, 0.024344, -0.017536], [0.150164, 0.137244, 0.129221], [0.027367, -0.050369, -0.208606],
          [-0.000793, -0.164622, -0.323161], [-0.048556, 0.013970, -0.074286], [0.011740, 0.014172, -0.006906],
          [0.061517, 0.061212, 0.110025], [0.035321, 0.086879, 0.110059], [-0.017426, 0.002997, 0.035356],
          [0.531539, 0.548819, 0.624404], [-0.024968, -0.040234, -0.034302], [-0.032549, -0.029096, -0.017221],
          [0.022609, 0.020286, 0.050661], [-0.084001, -0.038131, -0.020805], [-0.018830, 0.010412, 0.061120],
          [0.020777, 0.011196, -0.030994], [-0.008390, -0.012201, -0.025687], [-0.013281, -0.002924, 0.006331],
          [0.000260, 0.001833, -0.011038], [0.105471, 0.100482, 0.132106], [0.016529, 0.015213, 0.009999],
          [-0.014015, -0.017438, -0.019134], [-0.033787, -0.009984, -0.019725], [0.004224, 0.017284, 0.027196]]
H3_RGB_BIAS = [0.057426, -0.022078, -0.071449]


def latent_rgb(model):
    lf = getattr(getattr(model, "model", None), "latent_format", None)
    f = getattr(lf, "latent_rgb_factors", None)
    b = getattr(lf, "latent_rgb_factors_bias", None)
    if f is None or len(f) < 24:
        f, b = H3_RGB, H3_RGB_BIAS
    return torch.tensor(f[:24], dtype=torch.float32), torch.tensor(b or [0.0, 0.0, 0.0], dtype=torch.float32)


LIVE_MIN_INTERVAL = 0.25  # s between live preview updates (last step always sent)
LIVE_AUDIO_INTERVAL = 1.5  # s between audio preview decodes


class LivePreview:
    """Per-step preview of the segment being sampled (see h3s_preview): the predicted x0 is decoded with the
    tiny VAE taeh3 (or H3's latent->RGB projection as a fallback), sent as one JPEG sprite over the websocket
    ("h3lab.progress" event "live"); with an audio VAE the audio stream is decoded too and sent as a short
    WAV URL. Every step also records sigma, delta (RMS change of x0) and step time for the dynamics panel."""

    def __init__(self, notify, model, seg, min_interval=None, max_frames=None, tile_h=None, settings=None,
                 audio_vae=None, out_dir=None, sub=None):
        s = settings or {}
        self.notify, self.seg = notify, seg
        self.factors, self.bias = latent_rgb(model)
        self.min_interval = LIVE_MIN_INTERVAL if min_interval is None else min_interval
        self.max_frames = int(max_frames or s.get("preview_frames") or 48)
        self.fps = float(s.get("preview_fps") or 0)
        self.max_res = int(s.get("preview_max_res", 512) or 0)
        self.quality = int(s.get("preview_quality", 80) or 80)
        self.tile_h = tile_h
        self.dec = None
        path = preview.resolve_tiny_vae(s.get("preview_tiny_vae", "auto"))
        if path:
            dec = preview.load_tiny_vae(path)
            if dec is not None and dec.latent_channels == 24:
                self.dec = dec
                self.tae_name = os.path.basename(path)
        self.audio_vae = None   # the live preview is silent: mid-sampling audio sounded awful (user feedback)
        self.out_dir, self.sub = out_dir, sub
        self.audio_scale = 1.0
        self.sigmas = []
        self.extra = None
        self.last = 0.0
        self.last_audio = 0.0
        self.sent = 0
        self.prev_v = None
        self.t_step = time.perf_counter()
        self.dyn = {}

    def set_sigmas(self, sigmas):
        self.sigmas = list(sigmas or [])
        self.t_step = time.perf_counter()
        self.notify("sigmas", seg=self.seg, sigmas=self.sigmas)

    @staticmethod
    def parts(x0):
        if getattr(x0, "is_nested", False) or hasattr(x0, "tensors"):
            t = x0.tensors if hasattr(x0, "tensors") else x0.unbind()
            return t[0], (t[1] if len(t) > 1 else None)
        return x0, None

    def video_part(self, x0):
        v = self.parts(x0)[0]
        return v[:, :24] if v is not None and v.ndim == 5 else None

    def frames(self, x0):
        v = self.video_part(x0)
        if v is None:
            return None, None
        v = v[0].detach()
        T = v.shape[1]
        idx = preview.pick_frames(T, self.max_frames)
        rgb = None
        if self.dec is not None:
            try:
                rgb = preview.tiny_decode(self.dec, v, idx, self.max_res)
            except Exception as e:
                log(f"live preview: tiny VAE failed, falling back to latent2rgb: {e}")
                self.dec = None
        if rgb is None:
            vv = v.float()
            f, b = self.factors.to(vv.device), self.bias.to(vv.device)
            rgb = ((torch.einsum("cthw,cr->thwr", vv[:, idx], f) + b + 1.0) / 2.0).clamp(0, 1).cpu()
        return rgb, preview.durations(T, idx, self.fps)

    def audio_url(self, x0):
        a = self.parts(x0)[1]
        if self.audio_vae is None or a is None or self.out_dir is None:
            return None
        try:
            wav = decode_audio(self.audio_vae, (a[:1].detach().float() / self.audio_scale).to(a.device))
            name = f"live_{self.seg}_{self.sent % 4}.wav"
            os.makedirs(os.path.join(self.out_dir, "live"), exist_ok=True)
            media.write_wav(os.path.join(self.out_dir, "live", name), wav["waveform"][0], wav["sample_rate"])
            return {"filename": name, "subfolder": (self.sub or "") + "/live", "type": "output", "v": self.sent}
        except Exception as e:
            log(f"live preview: audio decode failed, audio preview off: {e}")
            self.audio_vae = None
            return None

    def track(self, step, x0, total):
        now = time.perf_counter()
        ms = (now - self.t_step) * 1000.0
        self.t_step = now
        v = self.video_part(x0)
        delta = None
        if v is not None:
            cur = v[0, :, :, ::2, ::2].detach().float().cpu()   # half resolution is plenty for an RMS
            delta = preview.step_delta(cur, self.prev_v)
            self.prev_v = cur
        sig = self.sigmas[step] if 0 <= step < len(self.sigmas) else None
        sig_next = self.sigmas[step + 1] if 0 <= step + 1 < len(self.sigmas) else None
        self.dyn = {"sigma": sig, "sigma_next": sig_next, "delta": delta, "ms": round(ms, 1)}
        return now

    def __call__(self, step, x0, x, total):
        now = self.track(step, x0, total)
        if self.extra is not None:
            try:
                self.extra(step, x0, x, total)
            except Exception:
                pass
        last = step + 1 >= total
        if not last and now - self.last < self.min_interval:
            return
        self.last = now
        rgb, dur = self.frames(x0)
        if rgb is None:
            return
        th = self.tile_h or (min(rgb.shape[1], self.max_res) if self.dec is not None and self.max_res else rgb.shape[1] if self.dec is not None else 144)
        data, tw, th, cols = media.sprite_grid(rgb, th, self.quality if self.dec is not None else 72)
        aud = None
        if self.audio_vae is not None and (last or now - self.last_audio >= LIVE_AUDIO_INTERVAL):
            self.last_audio = now
            aud = self.audio_url(x0)
        self.sent += 1
        self.notify("live", seg=self.seg, step=step + 1, steps=total, n=int(rgb.shape[0]), tw=tw, th=th, cols=cols,
                    dur=dur, img=data, mode="taeh3" if self.dec is not None else "latent2rgb", audio=aud)


# ---------------------------------------------------------------- whole project
STATUS = {}   # node id -> run status for the editor's polling fallback (/h3lab/status)
STATUS_KEEP = ("start", "seg_start", "step", "phase", "seg_preview", "seg_done", "done", "error")


class Notifier:
    """Sends progress over the websocket and mirrors it into STATUS, so an editor that missed events
    (background tab, re-render, reconnect) can catch up by polling."""

    def __init__(self, node_id, run_id=None):
        self.node_id = str(node_id) if node_id is not None else None
        self.run_id = run_id or f"r{int(time.time() * 1000):x}"
        self.seq = 0
        try:
            from server import PromptServer
            self.inst = getattr(PromptServer, "instance", None)
        except Exception:
            self.inst = None

    def record(self, event, d):
        if self.node_id is None or event not in STATUS_KEEP:
            return
        st = STATUS.get(self.node_id)
        if event == "start" or st is None or st.get("run") != self.run_id:
            st = STATUS[self.node_id] = {"run": self.run_id, "seq": 0, "active": True, "start": None, "progress": None,
                                         "results": {}, "previews": {}, "done": None, "error": None, "t": time.time()}
        st["seq"] = self.seq
        st["t"] = time.time()
        if event == "start":
            st["start"] = {k: v for k, v in d.items() if k not in ("node", "event")}
        elif event in ("seg_start", "step", "uptile"):
            st["progress"] = {k: v for k, v in d.items() if k not in ("node",)}
            if event == "seg_start":
                st["phase"] = None
        elif event == "phase":
            st["phase"] = {k: v for k, v in d.items() if k not in ("node",)}
        elif event == "seg_preview":
            st["previews"][str(d.get("seg"))] = d.get("result")
        elif event == "seg_done":
            st["previews"].pop(str(d.get("seg")), None)
            st["results"][str(d.get("seg"))] = d.get("result")
        elif event == "done":
            st["done"] = {k: v for k, v in d.items() if k not in ("node", "event")}
            st["active"] = False
        elif event == "error":
            st["error"] = d.get("message")
            st["active"] = False

    def __call__(self, event, **data):
        self.seq += 1
        d = dict(data)
        d["node"], d["event"], d["run"], d["seq"] = self.node_id, event, self.run_id, self.seq
        try:
            self.record(event, d)
        except Exception:
            pass
        if self.inst is None:
            return
        try:
            self.inst.send_sync("h3lab.progress", d)
        except Exception:
            pass


def run_status(node_id):
    st = STATUS.get(str(node_id))
    if not st:
        return None
    out = dict(st)
    out["results"] = dict(st["results"])
    out["previews"] = dict(st.get("previews", {}))
    return out


def project_dir(project):
    import folder_paths
    from .h3s_library import SPECIAL
    if project["id"] in SPECIAL or not project["id"]:
        raise ValueError(f"H3ZeroStudio: недопустимый id проекта {project['id']!r}")
    sub = os.path.join("h3labstudio", project["id"])
    d = os.path.join(folder_paths.get_output_directory(), sub)
    os.makedirs(os.path.join(d, "cache"), exist_ok=True)
    return d, sub.replace("\\", "/")


def sweep_stream_files(folder, keep=None, min_age=300.0):
    """Убрать брошенные файлы потокового экспорта (`.stream_<pid>_<thread>.frames`) из папки проекта.

    Их оставляют прошлые запуски, если Windows не отдал файл сразу (он был ещё отображён в память):
    имя содержит pid и поток, поэтому чужой живой файл не тронуть, а освободить гигабайты нужно.
    """
    import glob
    import time as _time
    freed, kept = 0, 0
    now = _time.time()
    for path in glob.glob(os.path.join(folder, ".stream_*.frames")):
        if keep and os.path.abspath(path) == os.path.abspath(keep):
            kept += 1
            continue
        try:
            if min_age and (now - os.path.getmtime(path)) < float(min_age):
                kept += 1
                continue
            freed += os.path.getsize(path)
            os.remove(path)
        except OSError:
            kept += 1
    return {"freed": freed, "kept": kept}


def remove_stream_file(path, tries=12, delay=0.4):
    """Удалить файл потокового экспорта с повторами: Windows отпускает отображённый файл не сразу."""
    import gc
    import time as _time
    for attempt in range(max(1, int(tries))):
        try:
            os.remove(path)
            return True
        except FileNotFoundError:
            return True
        except OSError:
            gc.collect()
            if attempt + 1 < int(tries):
                _time.sleep(float(delay))
    return False


def anchor_base_index(items, i):
    """Номер отрезка, который держит текущую цепочку продлений: последний перед `i` со связью «новая сцена».

    Якорь низкого разрешения возвращает латент продолжения к этому отрезку, поэтому ошибка не накапливается
    на длинных цепочках, а новая сцена (монтажная склейка) начинает свой отсчёт и её вид остаётся её собственным.
    """
    for j in range(int(i) - 1, -1, -1):
        if items[j].get("link") != "extend":
            return j
    return 0


def seg_pt_path(d, key, frozen=False):
    """Latent file of a segment: cache/seg_<key>.pt, or frozen/seg_<key>.pt for a frozen one (falls back to the cache)."""
    if frozen:
        fp = os.path.join(d, "frozen", f"seg_{key}.pt")
        if os.path.isfile(fp):
            return fp
    return os.path.join(d, "cache", f"seg_{key}.pt")


def cache_file_structurally_valid(path):
    """Cheap preflight for torch.save latent archives (no tensor allocation).

    Detects truncated files, broken ZIP directory and missing pickle metadata.
    Does not replace torch.load's tensor-level validation on actual use.
    """
    try:
        if not os.path.isfile(path) or os.path.getsize(path) < 128:
            return False
        with zipfile.ZipFile(path, "r") as z:
            names = z.namelist()
            return bool(names) and any(n.endswith("/data.pkl") for n in names) and any(
                n.endswith("/version") for n in names
            )
    except (OSError, ValueError, zipfile.BadZipFile, EOFError):
        return False


def usable_cache_file(path, *, frozen=False):
    """Preflight cache archive and decoded AV tensors before accepting a cache hit.

    Normal invalid entries are treated as misses and may be regenerated. Frozen
    entries fail closed, preserving their files and avoiding silent resampling.
    No files are removed or renamed here.
    """
    if not os.path.isfile(path):
        return False
    if not cache_file_structurally_valid(path):
        reason = "truncated or malformed torch archive"
    else:
        try:
            load_av_cache(path)
            return True
        except InvalidLatentCache as exc:
            reason = str(exc)
    if frozen:
        raise ValueError(f"H3ZeroStudio: повреждён зафиксированный латент: {path}. "
                         f"{reason}. Автоматическая регенерация запрещена; "
                         "восстановите файл или разморозьте отрезок.")
    log(f"cache invalid ({reason}), will regenerate: {path}")
    return False


def freeze_segment(project_id, key):
    """«Зафиксировать»: copy a segment's latent and preview files to <project>/frozen/, out of reach of
    «Очистить кэш». Returns the freeze record for the segment."""
    import re
    import shutil
    import folder_paths
    pid = re.sub(r"[^A-Za-z0-9_-]", "", str(project_id or ""))
    key = re.sub(r"[^A-Za-z0-9]", "", str(key or ""))
    if not pid or not key:
        raise ValueError("no project id / key")
    sub = f"h3labstudio/{pid}"
    d = os.path.join(folder_paths.get_output_directory(), "h3labstudio", pid)
    src = os.path.join(d, "cache", f"seg_{key}.pt")
    fdir = os.path.join(d, "frozen")
    os.makedirs(fdir, exist_ok=True)
    dst = os.path.join(fdir, f"seg_{key}.pt")
    if not os.path.isfile(dst):
        if not usable_cache_file(src):
            raise FileNotFoundError(f"cache/seg_{key}.pt not found (cache cleared?) — generate the segment again")
        shutil.copy2(src, dst + ".part")
        media.replace_file(dst + ".part", dst)
    data = torch.load(dst, map_location="cpu", weights_only=True)
    frames = core.frames_for_latent(int(data["v"].shape[2]))
    out = {"key": key, "frames": frames, "file": view_ref(sub + "/frozen", f"seg_{key}.pt"), "created": int(time.time())}
    import glob

    def _preview(plain, pattern):
        """The plain name first, else the Studio-coloured variant (seg_<key>_studio_c3*.mp4)."""
        if os.path.isfile(os.path.join(d, plain)):
            return plain
        hits = sorted(glob.glob(os.path.join(d, pattern)))
        return os.path.basename(hits[0]) if hits else None

    for kind, plain, pattern in (("video", f"seg_{key}.mp4", f"seg_{key}_studio*.mp4"),
                                 ("strip", f"seg_{key}_tiles.jpg", f"seg_{key}_studio*_tiles.jpg"),
                                 ("poster", f"seg_{key}_poster.jpg", f"seg_{key}_studio*_poster.jpg")):
        name = _preview(plain, pattern)
        if not name:
            continue
        sp, dp = os.path.join(d, name), os.path.join(fdir, name)
        if not os.path.isfile(dp) and os.path.isfile(sp):
            shutil.copy2(sp, dp)
        if os.path.isfile(dp):
            out[kind] = view_ref(sub + "/frozen", name)
    try:
        from . import h3s_library
        h3s_library.gallery_mark_frozen(d, key)
    except Exception:
        pass
    return out


def video_asset_info(ref, strip=True):
    """Info + poster of an uploaded video file (for the Assets panel); posters cached in output/h3labstudio/_thumbs.
    strip=False skips the filmstrip (the editor asks for it lazily, so importing / editing stays fast)."""
    import folder_paths
    path = asset_path({"file": ref.get("filename", ""), "subfolder": ref.get("subfolder", ""), "type": ref.get("type", "input"),
                       "name": ref.get("filename")})
    info = media.video_info(path)
    tag = hashlib.sha256(f"{path}|{file_sig(path)}".encode()).hexdigest()[:16]
    from . import h3s_projfiles as pf
    pid = pf.project_of(path)   # a project's video: its posters live (and die) with the project
    tsub = pf.sub_of(pid, "thumbs") if pid else "h3labstudio/_thumbs"
    tdir = os.path.join(folder_paths.get_output_directory(), *tsub.split("/"))
    os.makedirs(tdir, exist_ok=True)
    name = f"v_{tag}.jpg"
    fps = 24
    if not os.path.isfile(os.path.join(tdir, name)):
        tw = 320
        th = max(16, int(round(tw * info["height"] / max(1, info["width"]))))
        fr = media.sample_video_frames(path, [min(info["frames"] // 10, 48) / fps], tw, th)
        media.write_poster(os.path.join(tdir, name), torch.from_numpy(fr[0].astype(np.float32) / 255.0), max_width=tw)
    info["poster"] = view_ref(tsub, name)
    if not strip:
        info["strip"], info["strip_n"] = None, 0
        return info
    # filmstrip for the footage clip on the timeline: tiles evenly over the WHOLE file (the clip maps its in-point/
    # length onto it), about 2 per second, so trimmed clips still show the right frames
    n_all = max(1, int(info["frames"]))
    count = max(1, min(n_all, max(media.STRIP_COUNT, int(info["duration"] * 2)), 240))
    sname = f"vs_{tag}_{count}.jpg"
    if not os.path.isfile(os.path.join(tdir, sname)):
        th = 72
        tw = max(8, int(round(th * info["width"] / max(1, info["height"]))))
        times = [min(n_all - 1, int((j + 0.5) * n_all / count)) / fps for j in range(count)]
        frs = media.sample_video_frames(path, times, tw, th)
        media.write_strip(os.path.join(tdir, sname), torch.from_numpy(frs.astype(np.float32) / 255.0), count=count, height=th)
    info["strip"] = view_ref(tsub, sname)
    info["strip_n"] = count
    return info


def export_dir():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "h3labstudio", "export")


def safe_name(name, default="h3labstudio"):
    import re
    n = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or "")).strip(" .")[:120] or default
    return n[:-4] if n.lower().endswith(".mp4") else n


def export_video(body):
    """«Сохранить видео»: source mp4 (the stitched result or one clip's preview) -> <folder>/<name>.mp4.
    body: {source: view ref, folder ("" = output/h3labstudio/export, relative = inside output), name,
    range: [start, end] frames of the source or None, project (for the music track, optional)}.
    Never overwrites: name_2, name_3 ..."""
    import shutil
    import folder_paths
    src_ref = body.get("source") or {}
    src = asset_path({"file": src_ref.get("filename", ""), "subfolder": src_ref.get("subfolder", ""),
                      "type": src_ref.get("type", "output"), "name": src_ref.get("filename")})
    folder = str(body.get("folder") or "").strip().strip('"')
    if not folder:
        from . import h3s_projfiles as pf
        pid = pf.project_of(src) or pf.clean_id(body.get("project"))
        folder = os.path.join(pf.proj_dir(pid), "export") if pid and os.path.isdir(pf.proj_dir(pid)) else export_dir()
    elif not os.path.isabs(os.path.expanduser(folder)):
        folder = os.path.join(folder_paths.get_output_directory(), folder)
    folder = os.path.abspath(os.path.expanduser(folder))
    os.makedirs(folder, exist_ok=True)
    base = safe_name(body.get("name"))
    dst = os.path.join(folder, base + ".mp4")
    k = 2
    while os.path.exists(dst):
        dst = os.path.join(folder, f"{base}_{k}.mp4")
        k += 1
    rng = body.get("range")
    fps = core.FPS
    start, end = 0, None
    if isinstance(rng, (list, tuple)) and len(rng) == 2:
        start, end = max(0, int(rng[0])), max(0, int(rng[1]))
        if end <= start:
            raise ValueError("пустой диапазон")
    music = None
    proj = body.get("project")
    # The UI sends a project ID (string) when no audio remix is requested.
    # Only a full project object can be normalized for music mixing.
    if isinstance(proj, dict):
        music = export_audio(core.normalize_project(proj), src, start, end, fps, body.get("timeline_start", 0))
    encoder = body.get("encoder") if body.get("encoder") in ("cpu", "nvenc") else "cpu"
    if music is None and start == 0 and end is None:
        # Identical full-length MP4: a plain copy is faster than *any* encoder.
        shutil.copy2(src, dst + ".part.mp4")
        media.replace_file(dst + ".part.mp4", dst)
        n = media.video_info(dst)["frames"]
        encoder = "copy"
    else:
        wf, sr = music if music is not None else (None, None)
        dc = core.normalize_project(proj)["settings"].get("audio_declick", True) if isinstance(proj, dict) else True
        try:
            n = media.export_video(src, dst, start, end, fps, wf, sr, declick=dc, encoder=encoder)
        except Exception as enc_error:
            if encoder != "nvenc":
                raise
            log(f"export: NVENC unavailable ({enc_error}), retry with CPU for selected range/music")
            try:
                os.remove(dst + ".part.mp4")
            except OSError:
                pass
            n = media.export_video(src, dst, start, end, fps, wf, sr, declick=dc, encoder="cpu")
            encoder = "cpu"
    log(f"export: {dst} ({n} frames, {n / fps:.2f}s) · {'NVENC' if encoder == 'nvenc' else 'CPU/copy'}" + (" + music" if music is not None else ""))
    return {"path": dst, "frames": n, "seconds": round(n / fps, 3), "folder": folder, "encoder": encoder}


def export_audio(proj, src, start, end, fps, timeline_start=0):
    """Export sound: the file's own (generated) sound at audio.video_volume + the music lane clips mixed over it.
    start/end: frames of the source file; timeline_start: timeline frame of the file's frame 0.
    None = nothing to mix (keep the file's sound as is)."""
    music = core.music_clips(proj)
    vv = float(proj["audio"].get("video_volume", 1.0))
    if not music and vv == 1.0:
        return None
    if end is None:
        end = media.video_info(src)["frames"]
    try:
        wf, sr = media.load_audio(src)
        own = torch.from_numpy(wf)
    except ValueError:
        own, sr = None, 44100
    sources = {}
    for aid in {c["asset"] for c in music}:
        try:
            sources.update(audio_sources({"audio": {"clips": [{"asset": aid, "lane": 0}]}, "segments": [], "assets": proj["assets"]}, None))
        except Exception as e:
            log(f"export: music {aid} skipped ({e})")
    if own is None and sources:
        sr = max(int(x["sample_rate"]) for x in sources.values())
    n = int(round((end - start) / fps * sr))
    mix = torch.zeros(1, 2, n)
    if own is not None:
        o = own[:, int(round(start / fps * sr)):][:, :n]
        o = o.repeat(2, 1) if o.shape[0] == 1 else o[:2]
        mix[0, :, :o.shape[-1]] += o * vv
    if sources:
        m, _ = mix_clips(music, sources, sr, (timeline_start + start) / fps, n)
        mix += m
    peak = float(mix.abs().max()) if n else 0.0
    if peak > 1.0:   # soft protection against clipping of the sum
        mix = mix / peak * 0.98
    return mix[0].numpy(), sr


def view_ref(sub, name):
    return {"filename": name, "subfolder": sub, "type": "output"}


class vram_headroom:
    """Keep `gb` of VRAM free while the run samples / decodes: ComfyUI's own reserve
    (model_management.EXTRA_RESERVED_VRAM, the --reserve-vram value), raised for the run and put back afterwards,
    also after an interrupt. Never lowers a larger reserve set at launch. The loader then streams a few more weights
    from RAM instead of over-committing the card (Windows paging VRAM over PCIe makes a run crawl).
    Idea after chanon/comfyui-obvpm-timeline («H3 VRAM Headroom»)."""

    def __init__(self, gb):
        try:
            self.gb = max(0.0, min(8.0, float(gb or 0)))
        except (TypeError, ValueError):
            self.gb = 0.0
        self.old = None

    def __enter__(self):
        mm = comfy.model_management
        if self.gb > 0 and hasattr(mm, "EXTRA_RESERVED_VRAM") and mm.cpu_state == mm.CPUState.GPU:
            want = int(self.gb * 1024 ** 3)
            if want > mm.EXTRA_RESERVED_VRAM:
                self.old = mm.EXTRA_RESERVED_VRAM
                mm.EXTRA_RESERVED_VRAM = want
                vlog(f"VRAM headroom: {self.gb:g} GB kept free during the run (was {self.old / 1024 ** 3:.2f} GB)")
        return self

    def __exit__(self, *exc):
        if self.old is not None:
            comfy.model_management.EXTRA_RESERVED_VRAM = self.old
        return False


# ---------------------------------------------------------------- generation timer + run history (header of the editor)
RUNS = {"current": None}
HISTORY_KEEP = 20
_HLOCK = threading.Lock()


def _history_path():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "h3labstudio", "_history.json")


def run_history(n=5):
    try:
        with open(_history_path(), "r", encoding="utf-8") as f:
            runs = json.load(f).get("runs") or []
    except (OSError, ValueError):
        runs = []
    return runs[-n:][::-1]


def _describe_run(project):
    """What a run is about, for the timer popover: type, scope, segments, size, stage."""
    try:
        p = core.normalize_project(project)
        s, req = p["settings"], p.get("run") or {}
        kind = req.get("kind") if req.get("kind") in core.RUN_KINDS else core.run_kind(s)
        lp = core.limited_project(p)
        n = len(lp["segments"])
        segs = p["segments"]
        if req.get("region"):
            rg = next((r for r in p.get("regions") or [] if r.get("id") == req["region"]), {})
            what = "✂ участок" + (f" «{rg.get('name')}»" if rg.get("name") else "")
        elif int(req.get("only", -1)) >= 0:
            i = int(req["only"])
            what = f"отрезок {i + 1}" + (" · апскейл" if i < len(segs) and segs[i].get("upscale") else "")
        elif int(req.get("upto", -1)) >= 0:
            what = f"до отрезка {int(req['upto']) + 1}"
        else:
            what = "весь ролик"
        w, h = core.work_resolution(s, kind)
        return {"what": what, "kind": kind, "stage": {"draft": "черновик", "full": "финал", "refine": "финал из черновика"}.get(kind, kind),
                "segments": n, "wh": [w, h], "project": p.get("name") or "", "pid": p.get("id") or ""}
    except Exception as e:
        return {"what": "запуск", "err": str(e)[:100]}


def _run_begin(project):
    rec = dict(_describe_run(project), id=f"r{int(time.time() * 1000)}", start=time.time(), end=None, status="running")
    RUNS["current"] = rec
    return rec


def _run_end(rec, status, info=None, err=None):
    rec.update(end=time.time(), status=status)
    rec["dur"] = round(rec["end"] - rec["start"], 1)
    if info:
        segs = info.get("segments") or []
        rec["generated"] = sum(1 for r in segs if not r.get("cached"))
        rec["cached"] = sum(1 for r in segs if r.get("cached"))
    if err:
        rec["error"] = str(err)[:200]
    with _HLOCK:
        try:
            path = _history_path()
            try:
                with open(path, "r", encoding="utf-8") as f:
                    runs = json.load(f).get("runs") or []
            except (OSError, ValueError):
                runs = []
            runs = (runs + [rec])[-HISTORY_KEEP:]
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path + ".part", "w", encoding="utf-8") as f:
                json.dump({"runs": runs}, f, ensure_ascii=False)
            os.replace(path + ".part", path)
        except OSError as e:
            log(f"run history not saved: {e}")


def runs_state():
    return {"now": time.time(), "current": RUNS["current"], "history": run_history(5)}


def level_lock_joins(images, parts, items, results, n, gaps=(), gap_at=()):
    """Level lock at every continuation join of the stitched frames; the seam rating keeps the raw value
    («до») and shows the one after the correction. parts: the clips' stitched frames; gaps/gap_at: lengths and
    positions (in the full list of parts incl. gaps) of black gap fillers between them."""
    from . import h3s_seams
    at = 0
    gi = 0
    for k, fr in enumerate(parts):
        while gi < len(gap_at) and gap_at[gi] <= k + gi:
            at += gaps[gi]
            gi += 1
        if k and items[k].get("link") == "extend" and items[k].get("overlap"):
            try:
                info = h3s_seams.level_lock(images, at, n)
                r = results[k] if k < len(results) else None
                if info and r is not None:
                    after = h3s_seams.rate_video(images[max(0, at - 12):at], images[at:at + 12])
                    raw = r.get("seam")
                    if after and raw:
                        r["seam"] = dict(after, raw={"ratio": raw["ratio"], "verdict": raw["verdict"]}, level=info)
                    if raw and after and after["verdict"] != raw["verdict"]:
                        log(f"seam {k}->{k + 1}: level lock {h3s_seams.VERDICTS[raw['verdict']]} (×{raw['ratio']}) -> "
                            f"{h3s_seams.VERDICTS[after['verdict']]} (×{after['ratio']})")
            except Exception as e:
                vlog(f"level lock failed at join {k}: {e}")
        at += fr if isinstance(fr, int) else int(fr.shape[0])   # a part is a frame tensor or just its length


# CUSTOM, CTL_RUN and VERBOSE are shared by all generation calls. Until those
# are refactored into run-local state, serialize the ENTIRE execution, including
# validation and finally cleanup, to prevent overlapping runs corrupting inputs.
_GENERATION_LOCK = threading.RLock()


def _run_project_serialized(model, clip, vae, project, audio_vae=None, audio=None, node_id=None, preview_factory=None, sampler=None, model_pass2=None, sampler_pass2=None, global_seed=-1, stream_output=False):
    from . import h3s_vram
    try:
        h3s_vram.acquire("gen", evict=True)
    except h3s_vram.VramBusy as e:
        raise RuntimeError(f"VRAM занята ассистентом ({e.holder}) — дождитесь ответа или остановите чат") from e
    assistant = core.normalize_project(project).get("assistant", {}).get("cfg", {})
    killed = False
    try:   # v6n: the model server Lab started for the assistant is closed (whole tree); servers it did not start stay
        from . import h3s_launcher
        killed = h3s_launcher.stop("generation start").get("stopped", False)
    except Exception as e:
        log(f"WARNING: closing the assistant model server failed: {e}")
    if killed:
        log("assistant model server closed before video generation")
    elif assistant.get("unload_on_generate") and assistant.get("api_model"):
        try:
            from . import h3s_llm
            result = h3s_llm.unload(assistant.get("api_base"), assistant.get("api_key"), assistant.get("api_model"),
                                    assistant.get("unload_endpoint"))
            log(f"LLM unloaded before video generation ({result['backend']}: {assistant['api_model']})")
        except Exception as e:
            log(f"WARNING: LLM unload before video generation failed: {e}")
    # Override applies only to this execution, not the saved editor project.
    if global_seed is not None and int(global_seed) >= 0:
        project = core.normalize_project(project)
        project["settings"]["_global_seed"] = int(global_seed)
    rec = _run_begin(project)
    try:
        CUSTOM.update(sampler=sampler, sigmas=None, model_pass2=model_pass2,
                      sampler_pass2=sampler_pass2, sigmas_pass2=None)
        try:
            gb = core.normalize_project(project)["settings"].get("vram_headroom_gb", 0.0)
        except Exception:
            gb = 0.0
        from . import h3s_chars
        with vram_headroom(gb), h3s_chars.LOCK, _reference_vae_scope():   # characters protected; reference latents reused only for this run
            out = _run_project(model, clip, vae, project, audio_vae, audio, node_id, preview_factory, stream_output=stream_output)
        _run_end(rec, "done", out[3] if isinstance(out, tuple) and len(out) > 3 and isinstance(out[3], dict) else None)
        return out
    except BaseException as e:   # interrupted / failed: the polling editor must see the run as ended
        _run_end(rec, "interrupted" if "Interrupt" in type(e).__name__ or isinstance(e, KeyboardInterrupt) else "error", err=str(e) or type(e).__name__)
        st = STATUS.get(str(node_id)) if node_id is not None else None
        if st and st.get("active"):
            st["active"], st["error"], st["t"] = False, (str(e) or type(e).__name__)[:300], time.time()
        raise
    finally:
        for _key in CUSTOM:
            CUSTOM[_key] = None   # reset all wired inputs
        try:
            from . import h3s_vram
            h3s_vram.release("gen")
        except Exception:
            pass


def piflow_adapter_name(settings, steps):
    """The DWD adapter file of a step count: the project's own binding, else the built-in name."""
    n = 4 if int(steps) == 4 else 2
    return (str((settings or {}).get(f"piflow_lora{n}") or "").strip()
            or f"pi_h3_{n}step_dwd_adapter_int8_convrot.safetensors")


def video_lock_weights(total, overlap_latent, ramp_latent=0):
    """Per-latent-step lock weight of the video arm: 1 = take the finished latent, 0 = sample freely.

    The overlap is normally locked hard (1) and everything after it is free (0). With a ramp the last
    `ramp_latent` steps of the overlap are released gradually (smootherstep 1 → 0): the model may
    re-synthesize the transition instead of butting the frozen tail against the new frames. The sampler
    gets the complement as its denoise mask, so the same weights drive both paths.
    """
    w = torch.zeros(int(total), dtype=torch.float32)
    ov = max(0, min(int(overlap_latent), int(total)))
    w[:ov] = 1.0
    k = max(0, min(int(ramp_latent), ov))
    for i in range(k):
        t = (i + 1) / (k + 1)
        w[ov - k + i] = 1.0 - (t * t * (3.0 - 2.0 * t))
    return w


def run_project(model, clip, vae, project, audio_vae=None, audio=None, node_id=None, preview_factory=None, sampler=None, model_pass2=None, sampler_pass2=None, global_seed=-1, stream_output=False):
    """Single-flight guard for shared generation state; never overlap two runs."""
    with _GENERATION_LOCK:
        return _run_project_serialized(model, clip, vae, project, audio_vae, audio, node_id, preview_factory,
                                       sampler=sampler, model_pass2=model_pass2,
                                       sampler_pass2=sampler_pass2,
                                       global_seed=global_seed, stream_output=stream_output)


def _run_project(model, clip, vae, project, audio_vae=None, audio=None, node_id=None, preview_factory=None, stream_output=False):
    proj = core.limited_project(core.normalize_project(project))
    PIFLOW_RUN["frames"].clear()
    core.validate_ref_flf_exclusive(proj)
    cu = custom_info(CUSTOM["sampler"], CUSTOM["sigmas"])   # wired SAMPLER / SIGMAS: steps + cache-key signature
    if cu:
        proj["settings"]["_custom"] = cu
        log("wired " + " + ".join(x for x in (
            "SAMPLER (" + type(CUSTOM["sampler"]).__name__ + ", " + cu["sig"]["sampler"] + ")" if CUSTOM["sampler"] is not None else "",
            f"SIGMAS ({cu['steps']} steps: {[round(x, 3) for x in cu['sig']['sigmas']]})" if CUSTOM["sigmas"] is not None else "") if x)
            + " — they win over the project's sampler / scheduler / steps")
    pass2_sig = {}
    if CUSTOM["model_pass2"] is not None:
        pass2_sig["model"] = model_signature(CUSTOM["model_pass2"], None, None, None)
    if CUSTOM["sampler_pass2"] is not None:
        pass2_sig["sampler"] = sampler_signature(CUSTOM["sampler_pass2"])
    if CUSTOM["sigmas_pass2"] is not None:
        pass2_sig["sigmas"] = [round(float(x), 6) for x in CUSTOM["sigmas_pass2"].tolist()]
    if pass2_sig:
        # The second-pass model/sampler must invalidate only stage-2 results,
        # never a completed draft from the same source project.
        proj["settings"]["_pass2_external"] = pass2_sig
    if proj["settings"].get("final_mode") == "luna":
        proj["settings"]["_luna_upscale_env"] = upscale.env_tag("learned", proj["settings"].get("upscale_model") or None)
    rk = proj["run"].get("kind")   # per-run override: ✎ draft / ✦ final from the draft of one clip, «✦ Чистовики»
    if rk == "draft":
        proj["settings"]["quality"] = "draft"
    elif rk in ("refine", "full"):
        proj["settings"]["quality"] = "final"
        proj["settings"]["final_mode"] = rk
    if not proj["segments"]:
        raise ValueError("H3ZeroStudio: на таймлайне нет отрезков. Откройте редактор и добавьте отрезок.")
    pi_n = int(proj["settings"].get("piflow_steps") or 0)
    if pi_n in (2, 4):
        if model is not None:
            raise ValueError("pi-H3 DWD: отключите вход MODEL у H3ZeroStudio и выберите pruned-модель через пресет моделей — иначе невозможно проверить фактически загруженную модель")
        if proj["settings"].get("quality") != "final" or proj["settings"].get("final_mode") != "full":
            raise ValueError("pi-H3 DWD: пока поддерживается только одноэтапная финальная генерация, без черновика/HiRes")
        if CUSTOM["sigmas"] is not None or CUSTOM["sampler"] is not None:
            raise ValueError("pi-H3 DWD: отключите внешние входы SAMPLER и SIGMAS — нужны Euler и расписание pi-Flow Scheduler")
        if proj.get("regions"):
            raise ValueError("pi-H3 DWD: режим экспериментальный; перегенерация участков пока не поддерживается")
        import folder_paths
        # The DWD adapter is bound to the step count (2 steps ↔ max_raw_t 0.930, 4 ↔ 0.960) and may live
        # in any registered loras folder, so the project names the file per step count; built-in names stay
        # the default.
        filename = piflow_adapter_name(proj["settings"], pi_n)
        adapter_file = folder_paths.get_full_path("loras", filename)
        if not adapter_file and os.path.isabs(filename) and os.path.isfile(filename):
            adapter_file = filename
        if not adapter_file or not os.path.isfile(adapter_file):
            raise FileNotFoundError(
                f"pi-H3 DWD: не найден адаптер «{filename}» для {pi_n} шагов — выберите файл в «Настройки → Генерация → pi-H3 · адаптер DWD»")
        stat = os.stat(adapter_file)
        proj["settings"]["_piflow_env"] = [filename, stat.st_size, stat.st_mtime_ns]
        for i, seg in enumerate(proj["segments"]):
            if core.is_footage(seg):
                continue
            pr = core.segment_preset(proj, i) or {}
            name = str(pr.get("model") or "")
            path = folder_paths.get_full_path("diffusion_models", name) if name else None
            if not path and name and os.path.isabs(name) and os.path.isfile(name):
                path = name
            # Не найденный путь разберёт Resolver; существующие веса проверяются строго
            # до запуска pi-H3, чтобы несовместимость не проявилась на GPU.
            if not path:
                continue
            if not piflow_has_pruned_layout(path):
                raise ValueError(
                    f"pi-H3 DWD: отрезок {i + 1}: модель «{name}» несовместима с pruned-структурой "
                    "(ожидаются 48 AdaLN блоков 96768×8); выберите pruned-модель перед запуском DWD")
        log(f"pi-H3 DWD: {pi_n}-step experimental, pruned layout verified, adapter {filename}")
    # model & LoRA presets: wired inputs win per part; the preset (project / clip override) gives the rest
    from . import h3s_models
    wired_sig = model_signature(model, clip, vae, audio_vae)
    MR = h3s_models.Resolver(proj, model, clip, vae, audio_vae, wired_sig=wired_sig)
    MR.check()
    if any((seg.get("source") or {}).get("swap_mask") for seg in proj["segments"]):
        from . import h3s_swap_mask
        h3s_swap_mask.require_model()
        for idx, sg in enumerate(proj["segments"]):
            src_mask = (sg.get("source") or {}).get("swap_mask")
            if src_mask and src_mask["at"] != 0:
                raise ValueError(f"Swap SAM 3.1, отрезок {idx + 1}: выбор человека должен быть на первом кадре исходного видео")
    if MR.any:
        vae, audio_vae = MR.vae(), MR.audio_vae()
        log("models: " + "; ".join(f"#{i + 1} «{(core.segment_preset(proj, i) or {}).get('name', 'провод')}»" for i in range(len(proj["segments"]))))
    _base_models = MR.models
    _swap_models = {}
    def MC(i):
        """Per-clip Character Swap LoRA; ordinary clips keep the original model."""
        m, c = _base_models(i)
        src = proj["segments"][i].get("source") or {}
        if not src.get("swap"):
            return m, c
        lora = src.get("swap_lora") or "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors"
        strength = round(max(0.5, min(1.5, float(src.get("swap_lora_strength", 1.0)))), 2)
        if not h3s_models.full_path("lora", lora):
            raise FileNotFoundError(f"H3ZeroStudio: Character Swap LoRA не найдена: {lora}")
        k = (id(m), lora, strength)
        if k not in _swap_models:
            model_swap, clip_swap, report = h3s_models.apply_loras(
                m, c, [{"file": lora, "sm": strength, "sc": 0.0, "on": True}])
            _swap_models[k] = (model_swap, clip_swap)
            log("character swap: " + "; ".join(report))
        return _swap_models[k]
    from . import h3s_chars
    h3s_chars.remember_vaes(vae, audio_vae)
    used_cards = {e["id"] for x in proj["segments"] + (proj.get("regions") or []) for e in x.get("cards") or [] if e.get("on", True)}
    if used_cards:   # «Персонажи»: the library as it is now (signatures in the keys, kinds for the numbering)
        cards_now = h3s_chars.scan()
        lib = {c["id"]: c for c in cards_now}
        moved = {i: h3s_chars.resolve_alias(i, cards_now) for i in used_cards if i not in lib}
        moved = {i: c["id"] for i, c in moved.items() if c}
        if moved:   # renamed / moved since this project saw it: follow the card (its old id is an alias)
            for x in proj["segments"] + (proj.get("regions") or []):
                for e in x.get("cards") or []:
                    e["id"] = moved.get(e["id"], e["id"])
            used_cards = {moved.get(i, i) for i in used_cards}
            log("characters: renamed cards followed: " + ", ".join(f"{a} → {b}" for a, b in moved.items()))
        gone = sorted(i for i in used_cards if i not in lib)
        if gone:
            raise ValueError("H3ZeroStudio: нет карточек персонажей: " + ", ".join((proj["cards"].get(i) or {}).get("name") or i for i in gone)
                             + " — уберите их из клипов или верните файлы в библиотеку")
        for i in used_cards:
            proj["cards"][i] = core.card_snap(lib[i])
    est = core.estimate(proj)
    for wmsg in est["warnings"]:
        log("⚠ " + wmsg)
    hard = [x for x in est["warnings"] if "максимум" in x]
    if hard:
        raise ValueError("H3ZeroStudio: " + "; ".join(hard))
    all_items = core.plan(proj)
    items = core.run_items(proj, all_items)
    # Bridge 10: an isolated region pass only needs clips through its rightmost
    # conditioning window. Later unfinished clips must neither block nor run.
    _region_id = (proj.get("run") or {}).get("region")
    if _region_id:
        _region = next((r for r in proj.get("regions") or [] if str(r.get("id")) == str(_region_id)), None)
        if _region is None:
            raise ValueError("H3ZeroStudio Bridge: выбранный участок не найден в проекте")
        _window = core.region_window(proj, _region, all_items)
        if _window.get("error"):
            raise ValueError("H3ZeroStudio Bridge: " + str(_window["error"]))
        _rightmost = max(_window.get("segs") or [-1])
        if _rightmost < 0 or _rightmost >= len(items):
            raise ValueError("H3ZeroStudio Bridge: соседние сегменты участка недоступны")
        if _rightmost + 1 < len(items):
            log(f"Bridge scope: processing segments 1-{_rightmost + 1}; "
                f"segments {_rightmost + 2}-{len(items)} remain untouched (outside bridge window)")
            items = items[:_rightmost + 1]
    s = proj["settings"]
    VERBOSE[0] = bool(s.get("verbose_log", True))
    UG = core.upscale_gen(s)   # «Настройки → Апскейл»: the refine's own model + LoRA (None = the presets)

    def MC_UP(i):
        return (CUSTOM["model_pass2"], (MR.upscale_models(UG, i) if UG else MC(i))[1]) if CUSTOM["model_pass2"] is not None else (MR.upscale_models(UG, i) if UG else MC(i))
    notify = Notifier(node_id)
    CTL_RUN.update(warn=lambda msg: notify("warn", msg=msg, kind="control"), info={})   # (early: audio sources may warn)
    # client_token (from the editor) → this node/run, so Ctrl+F5 can re-attach progress
    try:
        from . import h3s_inflight
        tok = (proj.get("run") or {}).get("client_token") or ""
        if tok:
            h3s_inflight.record(tok, node=node_id, run=notify.run_id, project=proj.get("id"))
    except Exception as e:
        vlog(f"inflight record skipped: {e}")

    by_id = {a["id"]: a for a in proj["assets"]}
    ref_sigs, fsigs = {}, {}
    from . import h3s_store as store
    for seg in proj["segments"]:
        kfa = [x for x in ((seg.get("kf") or {}).get("first"), (seg.get("kf") or {}).get("last")) if x]
        for rid in seg["refs"] + ([seg["source"]["asset"]] if seg.get("source") else []) + kfa:
            if rid in by_id and rid not in ref_sigs:
                # same CONTENT -> same signature (a copy / zip import / re-save no longer changes the cache keys)
                ref_sigs[rid], sha = store.content_sig(asset_path(by_id[rid]), by_id[rid])
                if sha:
                    fsigs[rid] = {"sha": sha, "sig": ref_sigs[rid]}
    audio_z = None
    d, sub = project_dir(proj)
    src_info = source_audio_info(d, sub, audio) if audio is not None else None
    sources = audio_sources(proj, audio)
    for aid, src in sources.items():
        ref_sigs[aid] = audio_signature(src)
    tl_audio, audio_cov = timeline_audio(sources, proj, est["frames"])
    if core.lock_clips(proj):
        if tl_audio is None or audio_cov.sum() == 0:
            log("audio track: no clip with a connected source on the timeline; ignored")
        elif audio_vae is None:
            log("audio track needs the audio_vae input to be locked; the sound is only passed to the output")
        else:
            audio_z = encode_audio(audio_vae, tl_audio).float().cpu()
    if audio_z is None:
        # nothing locked: drop the track from the keys so the segments do not depend on it
        proj["audio"]["clips"] = []
    env = [MR.env(i) for i in range(len(proj["segments"]))] if MR.any else wired_sig   # per clip with presets
    kind = core.run_kind(s)
    kparts = []
    wired_parts = model_signature_parts(model, clip, vae, audio_vae)
    env_parts = [MR.env_parts(i, wired_parts) for i in range(len(proj["segments"]))]

    def _with_env(parts_):
        for j_, pt_ in enumerate(parts_):
            for q_ in (pt_, pt_.get("_draft") if isinstance(pt_, dict) else None):
                if isinstance(q_, dict) and "env" in q_ and j_ < len(env_parts):
                    q_["_env"] = env_parts[j_]   # not hashed: only explains a changed "env"
        return parts_
    # v6l hotfix: a take the user chose is used as is (seg.pin, set by the editor and dropped by it on any edit): its
    # key replaces the computed one while its latent exists (restored from the take store if needed), else ignored
    for sg_ in proj["segments"]:
        if sg_.get("pin"):
            sg_["pin"]["key"] = store.base_of(d, sg_["pin"]["key"])

    def _pin_ok(k_):
        ok_ = bool(s.get("cache", True)) and store.restore(d, k_, seg_pt_path(d, k_))
        if not ok_:
            log(f"pinned take {k_}: its latent is gone — the clip is generated anew")
        return ok_
    keys = core.segment_keys(proj, ref_sigs, env, up_env=upscale.env_tag(s.get("upscale_method", "learned"), s.get("upscale_model") or None) if kind == "refine" else "", parts=kparts, pin_ok=_pin_ok)
    pinned = [bool(core.pin_key(proj["segments"][j_], kind)) and keys[j_] == proj["segments"][j_]["pin"]["key"] for j_ in range(len(keys))]
    use_cache = bool(s.get("cache", True))
    requested_operation = (proj.get("run") or {}).get("operation", "full")
    operation = requested_operation
    export_colour = (proj.get("run") or {}).get("export_colour")
    export_stream = (proj.get("run") or {}).get("export_stream")
    if operation in ("assemble", "full") and isinstance(export_stream, bool):
        stream_output = export_stream  # Save dialog wins over the legacy node widget
    # Save-only switch: override the RGB presentation layer, never the H3
    # continuation/sampling method or the immutable segment take masters.
    studio_mode = (export_colour if isinstance(export_colour, bool)
                   else s.get("continuation_method") == "h3studio")
    if operation == "generate" and (proj.get("regions") or any(
            x.get("upscale") or x.get("fr") or x.get("ar") for x in proj["segments"])):
        log("generation split: specialised region/upscale/face/audio pass uses the compatible full pipeline")
        operation = "full"
    if operation == "full" and any(
            (seg.get("source") or {}).get("swap_mask") for seg in proj["segments"]):
        raise ValueError("Swap SAM 3.1: сохранение исходного фона пока работает в раздельной генерации. "
                         "Отключите совместимый полный запуск и отдельные апскейл/рефайн-проходы.")
    if operation in ("generate", "colour", "assemble") and not use_cache:
        raise ValueError("H3ZeroStudio: раздельные операции требуют включённого кэша готовых отрезков")
    keys = keys[:len(items)]
    # v6k: a segment under a control clip while the patch model is missing is made (and cached) without control —
    # under its own key, so installing the model later regenerates it with control
    CTL_RUN.update(warn=lambda msg: notify("warn", msg=msg, kind="control"), info={})
    control._FALLBACK_WARNED.clear()
    _ctl_items = [bool(not core.is_footage(proj["segments"][it_["index"]]) and core.control_window(proj, it_)) for it_ in items]
    # v6m memory policy: only what this run needs stays on the GPU (same setup next run = nothing reloaded)
    control.release()   # preprocessor leftovers (an interrupted control job)
    if not any(_ctl_items):
        control.release_patch()
    from . import h3s_memory as _mem
    MEM_RUN.update(cfg=_mem.normalize(s.get("memsave")), said=False)
    if any(_ctl_items):
        _pi = control.patch_info()
        if not _pi["name"]:   # v6l: no usable patch → stop before anything is sampled (never a silent run without control)
            raise control.ControlPatchMissing(control.missing_message(_pi["bad"]))
        if _pi["v1"]:   # the v1 fallback: its own keys, so installing 2.0 later regenerates these segments with it
            keys = [k_ + ("1" if c_ and not (j_ < len(pinned) and pinned[j_]) else "") for j_, (k_, c_) in enumerate(zip(keys, _ctl_items))]
    # «Апскейл отрезка»: key of each segment's upscale (None = none); the base latents stay the generation chain
    up_env = {m: upscale.env_tag("learned", s.get("upscale_model") or None) for m in core.SEG_UPSCALE_METHODS
              if any((sg.get("upscale") or {}).get("method") == m for sg in proj["segments"] + (proj.get("regions") or []))}
    ug_env = h3s_models.upscale_gen_env(s)
    if s.get("_pass2_external"):
        ug_env += json.dumps(s["_pass2_external"], sort_keys=True)
    if ug_env:
        up_env = {m: e + ug_env for m, e in up_env.items()}   # a custom refine model / LoRA invalidates the cached upscales
    ukeys = core.upscale_keys(proj, keys, kind, up_env, pin_ok=_pin_ok)[:len(items)]
    if any(ukeys):
        caps = upscale.capabilities()
        backs = caps.get("backends") or {}
        back = ",".join(b for b in ("native", "pixaroma", "lbh") if backs.get(b)) or "none"
        log(f"segment upscale: {sum(1 for x in ukeys if x)} segment(s); learned latent upscaler "
            f"{'yes (' + caps['learned_models'][0] + ' via ' + (caps.get('backend') or back) + ')' if caps['learned'] else 'NO (' + ('model missing in models/latent_upscale_models' if caps['learned_node'] else 'no native/Pixaroma/LBH node') + '; nodes=' + back + ')'}")
    # final from the draft: every segment's draft (same key as a «Черновик» run) is the start of its refine pass
    dparts = []
    dkeys = core.segment_keys(proj, ref_sigs, env, "draft", parts=dparts, pin_ok=_pin_ok)[:len(items)] if kind == "refine" else None
    _with_env(kparts)
    _with_env(dparts)
    # take store: latents of finished takes come back from their sidecars when the cache was cleared,
    # and every cache latent becomes a take (sidecar + recipe) — also those of earlier, interrupted runs
    recipes = {}
    for i_, k_ in enumerate(keys):
        sid = proj["segments"][i_]["id"]
        recipes[k_] = {"seg_id": sid, "seg": i_, "kind": kind, "parts": kparts[i_] if i_ < len(kparts) else None,
                       "draft": dparts[i_] if kind == "refine" and i_ < len(dparts) else None}
        if dkeys:
            recipes.setdefault(dkeys[i_], {"seg_id": sid, "seg": i_, "kind": "draft", "parts": dparts[i_] if i_ < len(dparts) else None})

    def _restore(k_, frozen_=False):
        return (frozen_ and usable_cache_file(seg_pt_path(d, k_, True), frozen=True)) or store.restore(d, k_, seg_pt_path(d, k_))

    for k_ in list(keys) + list(dkeys or []):
        _restore(k_)
    run_w, run_h = core.work_resolution(s)
    frozen = [bool(proj["segments"][i].get("freeze")) for i in range(len(keys))]
    for i, k in enumerate(keys):
        if frozen[i] and not os.path.isfile(seg_pt_path(d, k, True)) and not os.path.isfile(seg_pt_path(d, k)):
            raise ValueError(f"H3ZeroStudio: отрезок {i + 1} зафиксирован, но его файл не найден "
                             f"(frozen/seg_{k}.pt). Разморозьте отрезок, чтобы сгенерировать заново.")
    for uk_ in ukeys:
        if uk_:
            _restore(uk_)
    # An H3 latent written before the optional SAM composite must never count as
    # a finished masked take after an interrupted/failed postprocessing pass.
    def _swap_mask_complete(index, key):
        src = (proj["segments"][index].get("source") or {})
        return not (src.get("swap") and src.get("swap_mask")) or os.path.isfile(
            os.path.join(d, "cache", f"swap_sam3_complete_{key}.ok"))
    cached = [(usable_cache_file(seg_pt_path(d, k, True), frozen=True) if frozen[i] and os.path.isfile(seg_pt_path(d, k, True))
           else (use_cache and usable_cache_file(seg_pt_path(d, k)))) and _swap_mask_complete(i, k)
              for i, k in enumerate(keys)]
    # Separate post-production operations are read-only with respect to diffusion.
    # Refuse an incomplete cache instead of silently sampling a missing segment.
    if operation in ("colour", "assemble"):
        if proj.get("regions") or any(x.get("upscale") or x.get("fr") or x.get("ar") for x in proj["segments"]):
            raise ValueError("H3ZeroStudio: для регионов, апскейла и отдельного рефайна пока используйте совместимый полный запуск")
        absent = [str(i + 1) for i, ok in enumerate(cached) if not ok]
        if absent:
            raise ValueError("H3ZeroStudio: для сборки/цветокоррекции не хватает AV-кэша отрезков "
                             + ", ".join(absent) + ". Сначала нажмите «Генерировать / Продлить».")
        if operation == "colour" and not studio_mode:
            raise ValueError("H3ZeroStudio: отдельная цветокоррекция выключена для этого сохранения")
        if studio_mode and any(frozen):
            raise ValueError("H3ZeroStudio: отдельная сборка Studio с зафиксированными дублями пока не поддерживается; "
                             "используйте «Полный запуск (совместимость)».")
        log(f"post-production {operation}: all {len(items)} AV checkpoints exist, diffusion disabled")
    # Bridge/span regeneration must never silently regenerate clips within its
    # required context. Clips after the bridge window were excluded above.
    requested_region = (proj.get("run") or {}).get("region")
    if requested_region:
        missing_for_span = [i + 1 for i, ok in enumerate(cached)
                            if not ok and not core.is_footage(proj["segments"][i])]
        if missing_for_span:
            raise ValueError(
                "H3ZeroStudio Bridge/Участок: отменено, чтобы не пересоздавать "
                "соседние сегменты. Не найден подходящий кеш для сегментов: "
                + ", ".join(map(str, missing_for_span))
                + ". Восстановите их исходные дубли/настройки или сгенерируйте "
                "отдельно перед запуском Bridge. Сохранённые файлы не удалены."
            )
        log(f"region-only guard: all {len(cached)} required base segments cached; no segment regeneration")
    for i_, k_ in enumerate(keys):   # [H3ZS] cache hit/miss: reason
        if i_ >= len(items):
            break
        if cached[i_]:
            log(f"cache hit: segment {i_ + 1} {k_}" + (" (frozen)" if frozen[i_] else ""))
        elif not use_cache:
            log(f"cache miss: segment {i_ + 1} {k_} — reason: кэш выключен в настройках")
        else:
            pr_ = dict(kparts[i_]) if i_ < len(kparts) and kparts[i_] else {}
            log(f"cache miss: segment {i_ + 1} {k_} — reason: {store.miss_reason(d, proj['segments'][i_]['id'], kind, pr_)}")
    # an upscale that will really run: without the learned upscaler the latent is stretched (UI warns)
    need_up = [i for i in range(len(keys)) if not frozen[i]
               and ((kind == "refine" and not cached[i] and not core.is_footage(proj["segments"][i]))
                    or (ukeys[i] and not os.path.isfile(seg_pt_path(d, ukeys[i]))))]
    stretch_warned = False
    if need_up:
        caps = upscale.capabilities()
        if not caps["learned"]:
            log("upscale: " + upscale.STRETCH_WARN + f" (отрезки {', '.join(str(i + 1) for i in need_up)})")
            stretch_warned = True
            notify("warn", msg=upscale.STRETCH_WARN, kind="upscale_stretch")
    # Generate/Extend must fill every missing predecessor before the selected clip.
    # Legacy selective full runs and specialised audio/face passes still use run.only.
    only = int((proj.get("run") or {}).get("only", -1))
    first = 0
    if requested_operation != "generate" and 0 <= only < len(items):
        for j in range(only):
            if not cached[j] and not (j == only - 1 and core.uses_continuity(proj, only)):
                first = j + 1
        if first:
            log(f"only segment {only + 1}: segments 1-{first} are not touched (out of date ones stay as they are)")
    # v27: fast AV checkpoint resume. The existing per-segment .pt is an exact
    # joint video/audio latent checkpoint; no RGB re-encoding or history replay.
    # Keep the immediately preceding cached segment as the continuity anchor.
    resume_only = (bool(s.get("resume_only", False)) and operation == "full"
                   and not (proj.get("run") or {}).get("export_full"))  # Save always assembles the whole timeline
    if resume_only:
        if not use_cache:
            raise ValueError("H3ZeroStudio Resume Only: включите кэш готовых отрезков")
        if (proj.get("run") or {}).get("region") or (proj.get("run") or {}).get("audio") or (proj.get("run") or {}).get("face"):
            raise ValueError("H3ZeroStudio Resume Only: Bridge/Audio/Face выполняйте в обычном режиме")
        if kind == "refine":
            raise ValueError("H3ZeroStudio Resume Only: Draft → Upscale → Refine пока не поддерживается; используйте 1 этап или Low Res → High Res")
        prefix = 0
        while prefix < len(items) and cached[prefix]:
            prefix += 1
        if prefix:
            anchor = min(prefix - 1, len(items) - 1)
            if only >= 0 and only < anchor:
                raise ValueError("H3ZeroStudio Resume Only: выбранный сегмент находится до checkpoint; выключите Resume Only")
            first = max(first, anchor)
            log(f"Latent Checkpoint Resume: cached AV prefix 1-{prefix}; load anchor #{anchor + 1}; skip 1-{anchor}; render suffix only")
        else:
            log("Latent Checkpoint Resume: no contiguous AV checkpoint found; start from first segment")
    if operation == "generate":
        prefix = 0
        while prefix < len(items) and cached[prefix]:
            prefix += 1
        if prefix:
            first = max(first, prefix - 1)
            log(f"generation-only AV checkpoint: skip clips 1-{first}; load only anchor #{first + 1}; "
                f"new clips start #{prefix + 1}" if prefix < len(items) else
                f"generation-only AV checkpoint: all {len(items)} clips cached; no sampling")
        else:
            log("generation-only: no cached AV prefix, start at clip 1")
    # Swap must have real motion guidance for every generated frame. The generic
    # video loader holds the final source frame past EOF, which otherwise makes
    # a later Swap clip appear frozen after a long (and expensive) H3 render.
    if operation in ("generate", "full"):
        for issue in core.swap_source_overruns(proj, items):
            j = issue["index"]
            if j < first or cached[j]:
                continue
            raise ValueError(
                f"H3ZeroStudio Swap: отрезок {j + 1} запрашивает {issue['need']} кадров "
                f"с позиции {issue['start']}, но в исходном видео осталось "
                f"{issue['remaining']} из {issue['total']} кадров. Последний кадр "
                f"иначе будет повторяться ({issue['missing']} кадр.). "
                f"Откройте отрезок → Футаж → «Синхронизировать с таймлайном» "
                f"или «Авторазделить видео»."
            )
    ar_run = (proj.get("run") or {}).get("audio") or None   # «Улучшить звук»: audio-only pass over cached segments
    ar_only = only
    if ar_run:
        if audio_vae is None:
            raise ValueError("H3ZeroStudio: «Улучшить звук» требует вход audio_vae (звук нужно декодировать после доработки).")
        miss = [j + 1 for j in range(len(items)) if (ar_only < 0 or ar_only == j) and j >= first and not cached[j]
                and not core.is_footage(proj["segments"][j])]
        if miss:
            raise ValueError(f"H3ZeroStudio: «Улучшить звук»: у отрезков {', '.join(map(str, miss))} нет готового результата "
                             f"в кэше. Сначала сгенерируйте их.")
    fr_run = (proj.get("run") or {}).get("face") or None   # v6k «Рефайн лица»: a face pass over one finished clip
    if fr_run:
        miss = [j + 1 for j in range(len(items)) if only == j and not cached[j] and not core.is_footage(proj["segments"][j])]
        if miss or only < 0:
            raise ValueError(f"H3ZeroStudio: «Рефайн лица»: у отрезка {only + 1} нет готового результата в кэше. Сначала сгенерируйте его.")

    def fr_for(j):
        """Face-refine params of segment j in this run: the «Рефайн лица» request (run.face, one clip) or the
        segment's own persisted ones (seg.fr — its active take is the face-refined copy). Footage / a clip with its
        own upscale: never (the upscale is made from the base take); frozen clips: only on request."""
        sj = proj["segments"][j]
        if core.is_footage(sj) or (j < len(ukeys) and ukeys[j]):
            return None
        if fr_run and only == j:
            return fr_run
        # the persisted pass belongs to the take it was made on: a clip sampled anew (other prompt / seed …) drops it
        return None if frozen[j] or not cached[j] else (sj.get("fr") or None)

    def ar_for(j):
        """Audio-refine params of segment j in this run: the «Улучшить звук» request (run.audio, its scope) or the
        segment's own persisted ones (seg.ar — its active take IS the refined copy; v6h fix: later runs used to fall
        back to the base take and its original sound). Footage: never; frozen clips: only on request."""
        sj = proj["segments"][j]
        if core.is_footage(sj):
            return None
        if ar_run and (ar_only < 0 or ar_only == j):
            return ar_run
        return None if frozen[j] else (sj.get("ar") or None)

    def _steps(i):
        if kind != "refine" or core.is_footage(proj["segments"][i]):
            base_steps = core.seg_steps(proj, i)
            return base_steps
        n = core.effective_params(proj, i)["steps"]
        have_draft = use_cache and usable_cache_file(seg_pt_path(d, dkeys[i]))
        return core.pass_steps(s, n, "refine") + (0 if have_draft else core.pass_steps(s, n, "draft"))
    todo_steps = sum(_steps(i) for i, c in enumerate(cached) if not c and i >= first)
    for j in range(first, len(items)):
        arj = ar_for(j)
        if arj and cached[j] and not (use_cache and os.path.isfile(seg_pt_path(d, audio_refine_key(
                keys[j], arj["steps"], arj["denoise"], arj["video_denoise"], core.effective_params(proj, j)["seed"])))):
            todo_steps += int(arj["steps"])
    for j in range(first, len(items)):
        frj = fr_for(j)
        if frj and cached[j] and not (use_cache and os.path.isfile(seg_pt_path(d, face_refine_key(keys[j], frj, core.effective_params(proj, j)["seed"])))):
            todo_steps += int(frj["steps"])
    # «✂ Участок»: regions generated (run.region) or applied (their chosen take) in this run
    from . import h3s_region as region
    reg_plans = region.plan_regions(proj, all_items, items, first, keys, dkeys or keys, ref_sigs, env, kind, (run_w, run_h),
                                    core.work_resolution(s, "draft"), upscale.env_tag(s.get("upscale_method", "learned"), s.get("upscale_model") or None) if kind == "refine" else "",
                                    d, use_cache) if proj.get("regions") else []
    todo_steps += sum(rp["steps"] for rp in reg_plans)
    for rp in reg_plans:   # «Апскейл участка»: the take's window latent upscaled + refined (cached like a clip upscale)
        rp["ukey"] = core.region_upscale_key(proj, rp["key"], rp["rg"], run_w, run_h, up_env, max(0, rp["win"]["seg"]))
        if rp["ukey"]:
            rp["upt"] = os.path.join(d, "cache", f"region_{rp['ukey']}.pt")
            store.restore(d, "r" + rp["ukey"], rp["upt"])
            rp["up_cached"] = use_cache and usable_cache_file(rp["upt"])
            if not rp["up_cached"]:
                um_ = rp["rg"]["upscale"]["method"]
                todo_steps += core.upscale_pass_params(proj, max(0, rp["win"]["seg"]), um_)["steps"] * core.upscale_chunking(s, rp["win"]["we"] - rp["win"]["ws"], um_)[0]

    def keep_takes():
        """Every finished latent of this run becomes a take (sidecar + recipe); cheap hard links."""
        for k_ in list(keys) + list(dkeys or []):
            store.keep(d, k_, seg_pt_path(d, k_), recipes.get(k_))
        for i_, uk_ in enumerate(ukeys):
            if uk_:
                store.keep(d, uk_, seg_pt_path(d, uk_), {"seg_id": proj["segments"][i_]["id"], "seg": i_, "kind": "upscale", "base": keys[i_]})
        for rp_ in reg_plans:
            store.keep(d, "r" + rp_["key"], rp_["pt"], {"region": rp_["rg"]["id"], "kind": "region:" + kind})
            if rp_.get("ukey"):
                store.keep(d, "r" + rp_["ukey"], rp_["upt"], {"region": rp_["rg"]["id"], "kind": "region:upscale", "base": rp_["key"]})
            if rp_.get("dkey"):
                store.keep(d, "r" + rp_["dkey"], os.path.join(d, "cache", f"region_{rp_['dkey']}.pt"), {"region": rp_["rg"]["id"], "kind": "region:draft"})

    try:
        keep_takes()
    except Exception as e:
        log(f"take store: {e}")
    up_cached = [bool(uk) and use_cache and usable_cache_file(seg_pt_path(d, uk)) for uk in ukeys]
    _um = lambda i: proj["segments"][items[i]["index"]]["upscale"]["method"]
    todo_steps += sum(core.upscale_pass_params(proj, items[i]["index"], _um(i))["steps"] * core.upscale_chunking(s, items[i]["frames"], _um(i))[0]
                      for i, uk in enumerate(ukeys) if uk and not up_cached[i] and i >= first)
    pbar = comfy.utils.ProgressBar(max(1, todo_steps))
    t0 = time.perf_counter()
    done_steps = [0]
    # Low/High steps have unequal cost. The tracker uses weighted sampler work
    # plus video postprocessing, then learns this machine's post rate per clip.
    # Other modes keep the existing ETA path unchanged.
    eta_clock = None
    if operation == "generate" and kind == "full" and s.get("final_mode") == "luna":
        from .h3s_eta import RunEta, step_weights
        pending = [j for j in range(first, len(items)) if not cached[j]]
        if pending:
            typical_frames = max(1, sorted(int(items[j]["frames"]) for j in pending)[len(pending) // 2])
            work_plan, post_frames = {}, {}
            for j in pending:
                scene = proj["segments"][j]
                post_frames[j] = int(items[j]["frames"])
                if core.is_footage(scene):
                    continue
                nsteps = _steps(j)
                low_n = None if scene.get("source") else core.lowhigh_params(s, nsteps)[0]
                work_plan[j] = step_weights(nsteps, low_n, int(items[j]["frames"]) / typical_frames)
            if work_plan:
                eta_clock = RunEta(work_plan, post_frames)
    notify("start", segments=len(items), keys=[uk or k for k, uk in zip(keys, ukeys)],
           cached=[(c and (not ukeys[i] or up_cached[i])) or i < first for i, c in enumerate(cached)], steps_total=todo_steps, estimate=est,
           upto=len(items) - 1, partial=len(items) < len(all_items), fsigs=fsigs)
    log(f"project {proj['id']}: {len(items)} segment(s), {est['frames']} frames ({est['seconds']} s), "
        f"{est['width']}x{est['height']}, cached {sum(cached)}/{len(items)}"
        + {"draft": f" · ЧЕРНОВИК ({s.get('draft_scale')}× size, {core.pass_steps(s, int(s.get('steps') or 20), 'draft')} steps)",
           "refine": f" · ФИНАЛ ИЗ ЧЕРНОВИКА (upscale {s.get('upscale_method')} -> {run_w}x{run_h}, refine from sigma "
                     f"{s.get('refine_sigma')}, {core.pass_steps(s, int(s.get('steps') or 20), 'refine')} steps)"}.get(kind, ""))
    fps = int(s.get("fps") or core.FPS)
    vlog(f"settings: steps {s.get('steps')} cfg {s.get('cfg')} {s.get('sampler')}/{s.get('scheduler')} denoise {s.get('denoise')} "
         f"shift v/a {s.get('shift_video')}/{s.get('shift_audio')} seed {s.get('seed')} · overlap {s.get('overlap_blocks')} blk "
         f"(lock {'on' if s.get('lock_overlap', True) else 'off'}) · audio: {len(core.lock_clips(proj))} lock clip(s), "
         f"audio_vae {'yes' if audio_vae is not None else 'no'}, seam lock {'on' if s.get('audio_seam_lock') else 'off'}, "
         f"xfade {s.get('audio_xfade_sec') if s.get('audio_xfade') else 'off'}, match {'on' if s.get('audio_match') else 'off'} · "
         f"end {proj.get('end') or 'auto'} · {todo_steps} step(s) to sample")
    for j, (itj, kj) in enumerate(zip(items, keys)):
        vlog(f"  #{j + 1}: {itj['frames']} fr {itj['start'] / core.FPS:.2f}-{itj['end'] / core.FPS:.2f}s {itj['link']}"
             f"{' ov ' + str(itj['overlap']) if j and itj['overlap'] else ''} · {'untouched' if j < first else 'cache' if cached[j] else 'generate'} {kj}")
    # Save-only scene streaming: prepared take masters/Studio RGB8 cache ->
    # FFmpeg stdin. Never allocate the full decoded-frame or stitch RGB chain.
        # A plain assembly (no colour layer to prepare) defaults to the piped encoder: it reads the
    # take masters segment by segment instead of decoding the whole film into one float32 tensor
    # (235 s of 768x1344 ≈ 70 GB of RAM and minutes of copies) and re-encoding it.
    requested_pipe = (proj.get("run") or {}).get("export_pipe")
    if requested_pipe is None:
        requested_pipe = operation == "assemble" and not studio_mode
    if operation == "assemble" and requested_pipe is True:
        reason = ""
        if first or len(items) != len(all_items) or any(ukeys) or any(frozen) or reg_plans:
            reason = "частичная сборка, апскейл или сложный монтаж"
        elif audio_vae is None:
            reason = "не подключён audio_vae для звука отрезков"
        else:
            from . import h3s_stream_export as pipe_export
            plan, reason = pipe_export.prepare(d, proj, keys, items, run_w, run_h, fps, studio_mode)
            if plan and plan.get("no_colour"):
                log("потоковый экспорт: цветокоррекция не подготовлена для отрезков "
                    + ", ".join(str(i + 1) for i in plan["no_colour"]) + " — они поедут без цветового слоя")
            if plan is not None:
                try:
                    notify("phase", seg=max(0, len(items) - 1), phase="audio_mix")
                    out_audio = pipe_export.mixed_audio(plan, proj, stitch_audio, normalize_level)
                    encoder = pipe_export.select_encoder()
                    log(f"FFmpeg pipe: automatic encoder {'NVIDIA NVENC' if encoder == 'nvenc' else 'CPU H.264'}")
                    seam_pipe = core.audio_seam_params(proj)
                    pipe_key = hashlib.sha256((plan["tag"] + "|" + encoder + "|"
                                               + json.dumps(seam_pipe, sort_keys=True)).encode()).hexdigest()[:16]
                    pipe_name = f"full_{pipe_key}.mp4"
                    pipe_path = os.path.join(d, pipe_name)
                    notify("phase", seg=max(0, len(items) - 1), phase="export_encode",
                           fd=0, fn=plan["frames"])
                    pipe_t0 = time.perf_counter()

                    def pipe_progress(done, total):
                        spent = time.perf_counter() - pipe_t0
                        notify("phase", seg=max(0, len(items) - 1), phase="export_encode",
                               fd=done, fn=total, eta=round(spent * (total - done) / max(1, done), 1))
                    if os.path.isfile(pipe_path):
                        import numpy as np
                        frame = media.sample_video_frames(pipe_path, [0], plan["width"], plan["height"])
                        images = torch.from_numpy(np.array(frame, copy=True)).float().div_(255.0)
                        log("FFmpeg pipe: using cached final MP4 without decoding full film")
                    else:
                        try:
                            images = pipe_export.render(plan, pipe_path, out_audio, encoder=encoder, progress=pipe_progress)
                        except Exception as gpu_error:
                            if encoder != "nvenc":
                                raise
                            log(f"FFmpeg pipe: NVENC failed ({gpu_error}); retrying CPU pipe encoder")
                            notify("warn", msg="NVENC недоступен при экспорте. Продолжаем потоковое сохранение через CPU.")
                            encoder = "cpu"
                            pipe_key = hashlib.sha256((plan["tag"] + "|cpu|" +
                                json.dumps(seam_pipe, sort_keys=True)).encode()).hexdigest()[:16]
                            pipe_name = f"full_{pipe_key}.mp4"
                            pipe_path = os.path.join(d, pipe_name)
                            if os.path.isfile(pipe_path):
                                import numpy as np
                                frame = media.sample_video_frames(pipe_path, [0], plan["width"], plan["height"])
                                images = torch.from_numpy(np.array(frame, copy=True)).float().div_(255.0)
                            else:
                                images = pipe_export.render(plan, pipe_path, out_audio, encoder=encoder, progress=pipe_progress)
                        log(f"FFmpeg pipe: encoded {plan['frames']} frames from {len(items)} cached takes "
                            f"without the decoded/stitch float32 disk chains in {time.perf_counter() - pipe_t0:.1f}s")
                    # Preserve the full ComfyUI LATENT output of classic assembly.
                    # Only RGB frames are streamed; latents need no RGB disk spool.
                    video_parts, audio_parts = [], []
                    previous_audio = None
                    for j, (clip_item, clip_key) in enumerate(zip(items, keys)):
                        saved = load_av_cache(seg_pt_path(d, clip_key, frozen[j]))
                        clip_v, clip_a = saved["v"], saved["a"]
                        overlap_frames = int(clip_item["overlap"]) if j else 0
                        if overlap_frames:
                            video_parts.append(clip_v[:, :, core.latent_t(overlap_frames):])
                            start_frame = int(items[j - 1]["frames"]) - overlap_frames
                            overlap_audio = previous_audio.shape[-1] - round(
                                start_frame / core.FPS * core.AUDIO_LATENT_FPS)
                            audio_parts.append(clip_a[..., max(0, overlap_audio):])
                        else:
                            video_parts.append(clip_v)
                            audio_parts.append(clip_a)
                        previous_audio = clip_a
                    lat_v = torch.cat(video_parts, dim=2)
                    lat_a = torch.cat(audio_parts, dim=-1)
                    latent = {"samples": comfy.nested_tensor.NestedTensor((lat_v, lat_a))}
                    results = [dict(proj["segments"][it["index"]].get("result") or {},
                                    index=it["index"], key=keys[i], cached=True, frames=it["frames"])
                               for i, it in enumerate(items)]
                    full = {"video": view_ref(sub, pipe_name), "frames": plan["frames"], "key": pipe_key,
                            "export_colour": bool(studio_mode), "export_encoder": encoder,
                            "export_pipe": True, "export_pipe_used": True,
                            "export_concat": bool((proj.get("run") or {}).get("export_concat")),
                            "export_concat_used": False, "count": len(items), "partial": False}
                    try:
                        from . import h3s_library
                        h3s_library.gallery_add(d, h3s_library.final_entry(
                            proj["id"], proj.get("name"), full,
                            results[0].get("poster") if results else None,
                            s.get("prompt") or ""))
                    except Exception as exc:
                        vlog(f"pipe gallery: {exc}")
                    elapsed = time.perf_counter() - t0
                    notify("done", elapsed=round(elapsed, 1), full=full, segments=results,
                           audio_source=src_info, regions=[], operation=operation)
                    return images, out_audio, latent, {"segments": results, "full": full, "keys": keys,
                        "estimate": est, "audio_source": src_info, "regions": [], "fsigs": fsigs,
                        "operation": operation, "resume_only": False, "resume_start": 0}
                except Exception as pipe_error:
                    log(f"FFmpeg pipe export failed: {pipe_error}; falling back to classic assembly")
                    notify("warn", msg=f"Потоковый экспорт v2: {pipe_error}. Используем совместимую сборку H3.")
        if reason:
            log(f"FFmpeg pipe unavailable: {reason}; falling back to classic assembly")
            notify("warn", msg=f"Потоковый экспорт v2 недоступен ({reason}). Используем обычную сборку.")
    from .h3s_disk_chain import DiskTensorList
    chain_dir = os.path.join(d, 'cache')
    seg_v, seg_a = DiskTensorList(chain_dir, 'video'), DiskTensorList(chain_dir, 'audio')
    # 8-bit temporary video matches the H.264 export while using 75% less
    # scratch disk than float32; latent/audio chains stay unmodified.
    seg_frames = DiskTensorList(chain_dir, 'decoded_frames', codec='rgb8')
    results = []
    last_generated_preview = None   # generate needs only one ComfyUI output frame, never the full decoded-frame disk chain
    run_wave_keys, wave_memo = [], {}

    def post_phase(i_, phase_):
        extra = {}
        if eta_clock is not None:
            seconds = eta_clock.remaining(time.perf_counter())
            if seconds is not None:
                extra["eta"] = seconds
        notify("phase", seg=i_, phase=phase_, **extra)

    def take_frames(key_, lat_, fresh_, i_, dec=None, save_master=True):
        """Frames of a finished take: from its saved master (no VAE call) unless it was sampled just now."""
        if s.get("piflow_steps") in (2, 4) and dec is None:
            if fresh_:
                fr_pi = PIFLOW_RUN["frames"].pop(i_, None)
                if fr_pi is None:
                    raise RuntimeError("pi-H3: DWD кадры не найдены после сэмплинга; нельзя подменять их VAE-декодированием")
                return fr_pi
            fr_pi = store.load_master(d, key_, lat_)
            if fr_pi is None:
                raise RuntimeError(f"pi-H3: отсутствует MP4-мастер отрезка {i_ + 1}. Повторите генерацию pi-H3; обычный видео-VAE не заменяет DWD.")
            return fr_pi
        fr_ = None if fresh_ else store.load_master(d, key_, lat_)
        if fr_ is not None:
            log(f"segment {i_ + 1}: frames from the take master {key_} (no VAE decode)")
            return fr_
        decode_t0 = time.perf_counter()
        fr_ = dec() if dec else decode_video(vae, lat_.to(comfy.model_management.intermediate_device()))
        decode_elapsed = time.perf_counter() - decode_t0
        if save_master:
            master_t0 = time.perf_counter()
            store.save_master(d, key_, lat_, fr_, fps)
            log(f"  frame timing clip {i_ + 1}: VAE decode {decode_elapsed:.1f}s; high-quality take master encode {time.perf_counter() - master_t0:.1f}s")
        else:
            log(f"  frame timing clip {i_ + 1}: VAE decode {decode_elapsed:.1f}s; master deferred until after editor preview")
        return fr_

    def take_wave(j_):
        """Raw (unnormalised) wave of run segment j_: saved take audio, else one audio-VAE decode (then saved)."""
        if j_ in wave_memo:
            return wave_memo[j_]
        key_, fresh_, ai_ = run_wave_keys[j_][:3]
        base_ = run_wave_keys[j_][3] if len(run_wave_keys[j_]) > 3 else None
        w_ = None if fresh_ else store.load_wave(d, key_)
        if w_ is None and base_:   # an upscaled take: the very wave of the take it was made from (bit-identical sound)
            w_ = store.load_wave(d, base_)
            if w_ is not None:
                store.save_wave(d, key_, *w_)
        if w_ is None and audio_vae is not None:
            au_ = decode_audio(audio_vae, seg_a[ai_].to(comfy.model_management.intermediate_device()), normalize=False)
            w_ = (au_["waveform"][0].cpu(), int(au_["sample_rate"]))
            store.save_wave(d, key_, *w_)
        wave_memo[j_] = w_
        return w_
    seg_up = DiskTensorList(chain_dir, 'upscaled_video')  # None for non-upscaled segments
    prev = None
    prev_up = None
    draft_mem = {}
    dev0 = comfy.model_management.intermediate_device()
    # Studio RGB continuity is a presentation layer: never write its colour-adjusted
    # pixels back to a take master or to the latent chain used by other modes.
    studio_ref_lab = None
    studio_prev_tail = None
    studio_tail_size = max((int(x["overlap"]) for x in items), default=0)
    # A separate chain fingerprint prevents stale post-colour frames when a
    # previous take, first-clip Lab reference, or transition changes.
    studio_cache_prev = None
    if studio_mode and first > 0 and operation != "generate":
        from . import h3s_studio_color as studio
        ref_pt = seg_pt_path(d, keys[0], frozen[0])
        if usable_cache_file(ref_pt, frozen=frozen[0]):
            ref_v = load_av_cache(ref_pt)["v"]
            ref_frames = store.load_master(d, keys[0], ref_v)
            if ref_frames is None:
                ref_frames = decode_video(vae, ref_v.to(dev0))
            studio_ref_lab = studio.stats(ref_frames, window=36)
            del ref_frames, ref_v
            log("studio: RGB reference restored from clip 1 for partial run")
        else:
            log("studio: clip 1 unavailable on partial run; RGB anchor uses first rendered clip")

    def fit_canvas(v, w_, h_, what):
        """A latent of another canvas (a clip frozen in another mode) is resized to the run's canvas."""
        if tuple(v.shape[-2:]) != (h_ // 16, w_ // 16):
            log(f"{what}: latent {tuple(v.shape[-2:])} resized to {w_}x{h_} ({s.get('upscale_method')})")
            return upscale_video_latent(vae, v, w_, h_, s.get("upscale_method", "learned"), model=s.get("upscale_model") or None)
        return v

    def get_draft(j, step_cb=None, pcb=None):
        """Draft of segment j for the refine pass: from the cache (a «Черновик» run made it) or sampled now; an
        extension's draft continues the previous draft, exactly like in a draft run."""
        if j in draft_mem:
            return draft_mem[j]
        seg_j, it_j, kd = proj["segments"][j], items[j], dkeys[j]
        dw, dh = core.work_resolution(s, "draft")
        ptd = seg_pt_path(d, kd, bool(seg_j.get("freeze")))
        if (frozen[j] or use_cache) and usable_cache_file(ptd, frozen=frozen[j]):
            dd = load_av_cache(ptd)
            dv, da = fit_canvas(dd["v"], dw, dh, f"segment {j + 1} draft"), dd["a"]
            log(f"segment {j + 1}: draft from cache {kd}")
        elif core.is_footage(seg_j):
            dv, da, _px = footage_latents(vae, audio_vae, by_id[seg_j["source"]["asset"]], seg_j["source"], it_j["frames"], dw, dh, it_j["audio_t"])
        else:
            pd = get_draft(j - 1) if j > 0 and it_j["link"] == "extend" else None
            refs_j = [load_asset_image(a) for a in core.ordered_refs(proj, seg_j)]
            ra_j = ref_audio_latents(audio_vae, proj, seg_j, sources)
            rv_j = [ref_video_frames(x, it_j["frames"]) for x in core.video_refs(proj, seg_j)[:core.MAX_REF_VIDEOS]]
            init_j = guide_j = None
            if seg_j.get("source"):
                src_j = seg_j["source"]
                asset_j = by_id[src_j["asset"]]
                fv, fa, _px = footage_latents(vae, audio_vae, asset_j, src_j, it_j["frames"], dw, dh, it_j["audio_t"])
                if src_j.get("swap"):
                    guide_j = {"v": fv, "a": fa if asset_j.get("has_audio") and src_j.get("keep_audio", True) else None,
                               "keep_audio": src_j.get("keep_audio", True)}
                else:
                    init_j = (fv, fa)
            notify("phase", seg=j, phase="draft")
            log(f"segment {j + 1}: sampling its draft first ({dw}x{dh})")
            dv, da = sample_segment(*MC(j), vae, proj, j, items, pd, refs_j, audio_z, step_cb, pcb, audio_cov, ra_j, rv_j, init_j, kind="draft", guide=guide_j)
            if use_cache:
                atomic.save_torch({"v": dv, "a": da}, ptd)
        fr = decode_video(vae, dv.to(dev0))
        draft_mem[j] = {"v": dv, "a": da, "last_frame": fr[-1:].clone(), "frames": fr}
        for old in [x for x in draft_mem if x < j - 1]:
            del draft_mem[old]
        return draft_mem[j]

    def next_handover(v, a, last_frame, previous, link):
        handover = {"v": v, "a": a, "last_frame": last_frame}
        if s.get("self_anchor_voice") and kind == "full":
            handover["voice_anchor"] = voice.carry_voice_anchor(previous, a, link)
        return handover

    from . import h3s_diagnostics as diagnostics
    drift_reference = None
    drift_reference_index = -1
    for i, it in enumerate(items):
        if i < first:
            continue
        k = keys[i]
        pt = seg_pt_path(d, k, frozen[i])
        hit = cached[i]
        fresh = not hit   # sampled now -> decode and (re)write its master; a hit reads the master, no VAE
        notify("seg_start", seg=i, key=k, cached=hit)
        vlog(f"── segment {i + 1}/{len(items)} · {it['frames']} fr · seed {core.effective_params(proj, i)['seed']} · "
             f"cache {'HIT' if hit else 'miss'} {k}")
        seg_i = proj["segments"][i]
        v_frozen = None
        ar_used = None
        if hit:
            data = load_av_cache(pt)
            v, a = data["v"], data["a"]
            log(f"segment {i + 1}: {'frozen' if frozen[i] else 'cache hit'} {k}")
            v_frozen = v if frozen[i] else None
            if frozen[i]:
                v = fit_canvas(v, run_w, run_h, f"segment {i + 1} (frozen)")
            if operation == "generate":
                # A cached clip is only the AV handover checkpoint. RGB processing,
                # Lab colour and stitching happen later, not on every continuation.
                handover_rgb = None
                if s.get("continuation_method") not in ("protected", "h3studio"):
                    anchor_frames = take_frames(k, v, False, i)
                    handover_rgb = anchor_frames[-1:].clone()
                    del anchor_frames
                prev = next_handover(v, a, handover_rgb, prev, it["link"])
                seg_v.append(v)
                seg_a.append(a)
                log(f"generation-only: clip {i + 1} AV checkpoint loaded (RGB skipped)")
                continue
            ar_i = ar_for(i)
            if ar_i:
                ak = audio_refine_key(k, ar_i["steps"], ar_i["denoise"], ar_i["video_denoise"], core.effective_params(proj, i)["seed"])
                apt = seg_pt_path(d, ak)
                store.restore(d, ak, apt)
                if use_cache and usable_cache_file(apt):
                    ar_data = load_av_cache(apt)
                    v, a = ar_data["v"], ar_data["a"]
                    log(f"segment {i + 1}: audio refine from cache {ak}")
                else:
                    notify("phase", seg=i, phase="audio_refine")
                    refs_ar = [load_asset_image(x) for x in core.ordered_refs(proj, seg_i)]
                    ra_ar = ref_audio_latents(audio_vae, proj, seg_i, sources)

                    def ar_step(step, total, _i=i):
                        done_steps[0] += 1
                        pbar.update_absolute(done_steps[0], max(1, todo_steps))
                        el = time.perf_counter() - t0
                        notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                               elapsed=round(el, 1), eta=round(el / max(1, done_steps[0]) * (todo_steps - done_steps[0]), 1))
                    t_ar = time.perf_counter()
                    v, a = refine_audio(*MC(i), vae, proj, i, items, v, a, ar_i, refs_ar, ra_ar, ar_step)
                    atomic.save_torch({"v": v, "a": a}, apt)
                    log(f"segment {i + 1}: audio refined in {time.perf_counter() - t_ar:.1f}s -> {ak}")
                    fresh = True
                store.keep(d, ak, apt, {"seg_id": seg_i["id"], "seg": i, "kind": "audio_refine", "base": keys[i]})
                k = ak
                v_frozen = None
                ar_used = ar_i
        elif core.is_footage(seg_i):
            w_, h_ = run_w, run_h
            asset = by_id[seg_i["source"]["asset"]]
            v, a, _px = footage_latents(vae, audio_vae, asset, seg_i["source"], it["frames"], w_, h_, it["audio_t"])
            atomic.save_torch({"v": v, "a": a}, pt)
            if resume_only:
                # .pt is the authoritative AV checkpoint; a marker is diagnostic only.
                marker = os.path.join(d, "cache", "resume_latest.json")
                import json as _json
                marker_tmp = marker + f".{os.getpid()}.tmp"
                with open(marker_tmp, "w", encoding="utf-8") as fh:
                    _json.dump({"version": 1, "segment_index": i, "segment_id": seg_i["id"],
                                "key": keys[i], "latent_file": os.path.basename(pt),
                                "video_shape": list(v.shape), "audio_shape": list(a.shape)}, fh)
                os.replace(marker_tmp, marker)

            log(f"segment {i + 1}: footage «{asset.get('name')}» from frame {seg_i['source']['in']}, {it['frames']} fr (as is)")
        else:
            refs = [load_asset_image(a) for a in core.ordered_refs(proj, proj["segments"][i])]
            steps_i = _steps(i)
            seg_t0 = time.perf_counter()
            live_box = []
            segment_start_steps = done_steps[0]

            def step_cb(step, total, _i=i, _t0=seg_t0, _live=live_box):
                done_steps[0] += 1
                segment_done = done_steps[0] - segment_start_steps
                pbar.update_absolute(done_steps[0], max(1, todo_steps))
                el = time.perf_counter() - t0
                rate = el / max(1, done_steps[0])
                clock_eta = (eta_clock.sample_step(_i, segment_done, time.perf_counter())
                             if eta_clock is not None and _i in eta_clock.plan else None)
                total_eta = clock_eta if clock_eta is not None else round(rate * (todo_steps - done_steps[0]), 1)
                notify("step", seg=_i, step=segment_done, steps=steps_i, done=done_steps[0], total=todo_steps,
                       elapsed=round(el, 1), eta=total_eta,
                       **(_live[0].dyn if _live else {}))
                if VERBOSE[0]:
                    dy = _live[0].dyn if _live else {}
                    seg_el = time.perf_counter() - _t0
                    if eta_clock is not None and _i in eta_clock.plan and segment_done > 0:
                        plan = eta_clock.plan[_i]
                        seg_eta = seg_el / max(0.01, sum(plan[:segment_done])) * sum(plan[segment_done:])
                    else:
                        seg_eta = seg_el / max(1, segment_done) * max(0, steps_i - segment_done)
                    sig = dy.get("sigma")
                    vr_ = vram()   # one CUDA query per step (it was two)
                    log(f"[{text_bar(segment_done, steps_i)}] seg {_i + 1}/{len(items)} step {segment_done}/{steps_i}"
                        + (f" σ={sig:.4f}" if sig is not None else "") + (f" Δ={dy['delta']:.4f}" if dy.get("delta") is not None else "")
                        + (f" {dy['ms']:.0f} ms" if dy.get("ms") is not None else "")
                        + f" · ETA seg {fmt_s(seg_eta)} total {fmt_s(total_eta)} · {done_steps[0]}/{todo_steps}"
                        + (" · " + vr_ if vr_ else ""))

            pcb = LivePreview(notify, MC(i)[0], i, settings=s, audio_vae=None, out_dir=d, sub=sub)   # no audio in the live preview (sounded awful mid-sampling)
            if preview_factory is not None and not s.get("preview_suppress", True):
                try:   # ComfyUI's own node preview on top (off by default: the editor shows its own)
                    pcb.extra = preview_factory(MC(i)[0], steps_i)
                except Exception:
                    pcb.extra = None
            live_box.append(pcb)
            refs_t0 = time.perf_counter()
            ra = ref_audio_latents(audio_vae, proj, proj["segments"][i], sources)
            rv = [] if kind == "refine" else [ref_video_frames(x, it["frames"]) for x in core.video_refs(proj, seg_i)[:core.MAX_REF_VIDEOS]]   # no video refs when upscaling a draft
            refs_sec = time.perf_counter() - refs_t0
            init = guide = None
            if kind == "refine":
                dr = get_draft(i, step_cb, pcb)
                um = s.get("upscale_method", "learned")
                notify("phase", seg=i, phase="up_input", input=upscale.effective_input(um) or um)
                t_in = time.perf_counter()
                log(f"segment {i + 1}: final from its draft — upscale input {upscale.effective_input(um) or um} {tuple(dr['v'].shape[-2:])} latent -> {run_w}x{run_h} …")
                up = upscale_video_latent(vae, dr["v"], run_w, run_h, um, frames=dr["frames"], model=s.get("upscale_model") or None)
                log(f"segment {i + 1}: upscale input done in {time.perf_counter() - t_in:.1f}s")
                notify("phase", seg=i, phase="refine")
                log(f"segment {i + 1}: final from its draft: {tuple(dr['v'].shape[-2:])} -> {tuple(up.shape[-2:])} latent ({um}), refine")
                v, a = sample_segment(CUSTOM["model_pass2"] or MC(i)[0], MC(i)[1], vae, proj, i, items, prev, refs, None, step_cb, pcb, audio_cov, ra, rv, None,
                                      kind="refine", refine=(up, dr["a"]))
            else:
                if seg_i.get("source"):
                    src_i = seg_i["source"]
                    asset_i = by_id[src_i["asset"]]
                    fv, fa, _px = footage_latents(vae, audio_vae, asset_i, src_i, it["frames"], run_w, run_h, it["audio_t"])
                    if src_i.get("swap"):
                        guide = {"v": fv, "a": fa if asset_i.get("has_audio") and src_i.get("keep_audio", True) else None,
                                 "keep_audio": src_i.get("keep_audio", True)}
                    else:
                        init = (fv, fa)  # ordinary vid2vid still starts from the source latent
                v, a = sample_segment(*MC(i), vae, proj, i, items, prev, refs, audio_z, step_cb, pcb, audio_cov, ra, rv, init, kind=kind,
                                      sampling_started=(lambda _i=i: eta_clock.begin_sample(_i, time.perf_counter()))
                                      if eta_clock is not None and i in eta_clock.plan else None, guide=guide)
            if s.get("continuation_method") == "h3studio" and i > 0 and it["link"] == "extend" and it["overlap"]:
                # Studio-only: post-sampling latent seam calibration and first-clip anchor.
                # The locked overlap is retained byte-for-byte; other continuation modes never enter here.
                from . import h3s_studio_color as studio
                anchor_v = seg_v[0] if first == 0 and len(seg_v) else None
                if anchor_v is None and first > 0:
                    anchor_pt = seg_pt_path(d, keys[0], frozen[0])
                    if usable_cache_file(anchor_pt, frozen=frozen[0]):
                        anchor_v = load_av_cache(anchor_pt)["v"]
                if prev is not None:
                    v = studio.calibrate({"samples": v}, {"samples": prev["v"]}, it["overlap"], i + 1)["samples"]
                if anchor_v is not None:
                    v = studio.latent_anchor({"samples": v}, {"samples": anchor_v}, it["overlap"], i + 1)["samples"]
                else:
                    log(f"segment {i + 1}: first-clip latent anchor unavailable (first take not cached)")
            anchor_strength = float(s.get("anchor") or 0.0)
            if anchor_strength > 0 and i > 0 and it["link"] == "extend" and it["overlap"] \
                    and s.get("continuation_method") != "h3studio":
                # Якорь низкого разрешения: латент продолжения возвращается к отрезку-основанию цепочки
                # (не к предыдущему!). Без него ошибка копится сорок отрезков подряд и картинка уезжает.
                from . import h3s_studio_color as studio
                base_i = anchor_base_index(items, i)
                base_v = None
                if first <= base_i < first + len(seg_v):
                    base_v = seg_v[base_i - first]
                else:
                    base_pt = seg_pt_path(d, keys[base_i], bool(frozen[base_i]) if base_i < len(frozen) else False)
                    if usable_cache_file(base_pt, frozen=bool(frozen[base_i]) if base_i < len(frozen) else False):
                        base_v = load_av_cache(base_pt)["v"]
                if base_v is not None:
                    v = studio.latent_anchor({"samples": v}, {"samples": base_v}, it["overlap"], i + 1,
                                             strength=anchor_strength)["samples"]
                    log(f"segment {i + 1}: anchor to segment {base_i + 1} (strength {anchor_strength:.2f})")
                else:
                    log(f"segment {i + 1}: anchor skipped — the base segment's latent is not available")
            checkpoint_t0 = time.perf_counter()
            atomic.save_torch({"v": v, "a": a}, pt)
            checkpoint_sec = time.perf_counter() - checkpoint_t0
            log(f"  segment preparation: audio/video refs {refs_sec:.1f}s; latent checkpoint {checkpoint_sec:.1f}s")
            el_i = time.perf_counter() - seg_t0
            log(f"segment {i + 1}/{len(items)}: done in {el_i:.1f}s ({el_i / max(1, steps_i):.2f} s/step)"
                + "".join(" · " + x_ for x_ in (vram(), ram()) if x_))
        if operation == "generate":
            # Only newly created clips are decoded for their own preview and
            # take-master. Older cached clips are never stitched or colour-graded.
            post_t0 = time.perf_counter()
            if eta_clock is not None:
                eta_clock.begin_post(i, post_t0)
            post_phase(i, "decode")
            store.keep(d, keys[i], pt, recipes.get(keys[i]))
            frames = take_frames(k, v, True, i, save_master=False)
            # Experimental person-only Swap: keep the guide video outside a tracked person silhouette.
            # Re-encode the composited pixels so the latent checkpoint, take master and later runs agree.
            mask_src = (seg_i.get("source") or {}) if seg_i.get("source") else {}
            if mask_src.get("swap") and mask_src.get("swap_mask"):
                from . import h3s_swap_mask
                notify("phase", seg=i, phase="swap_mask", fd=0,
                       fn=mask_src["in"] + int(frames.shape[0]), stage="track")
                t_mask = time.perf_counter()
                mask_cfg = dict(mask_src["swap_mask"])
                mask_cfg["cfg"] = {"expand": s.get("swap_expand", 16), "feather": s.get("swap_feather", 12),
                                   "fill_holes": s.get("swap_fill_holes", True),
                                   "temporal_expand": s.get("swap_temporal_expand", 2)}
                frames, mask_info = h3s_swap_mask.composite(
                    asset_path(by_id[mask_src["asset"]]), mask_src["in"], frames,
                    mask_cfg, d,
                    progress=lambda fd, fn, stage: notify(
                        "phase", seg=i, phase="swap_mask", fd=fd, fn=fn, stage=stage))
                v = vae.encode(frames).float().cpu()
                atomic.save_torch({"v": v, "a": a}, pt)
                # The take sidecar was created from the raw H3 latent above; refresh
                # it with the masked latent before the success marker is committed.
                if not store.keep(d, keys[i], pt, recipes.get(keys[i])):
                    raise OSError("Swap SAM 3.1: не удалось сохранить обновлённый латент в архив дублей")
                marker = os.path.join(d, "cache", f"swap_sam3_complete_{k}.ok")
                os.makedirs(os.path.dirname(marker), exist_ok=True)
                with open(marker + ".part", "w", encoding="ascii") as f_marker:
                    f_marker.write("sam3.1\n")
                os.replace(marker + ".part", marker)
                log(f"  Swap SAM 3.1: source background preserved; person in "
                    f"{mask_info['active']}/{mask_info['frames']} frames; masks cached; "
                    f"identity guard held {mask_info.get('guarded', 0)} frame(s); "
                    f"latent re-encoded in {time.perf_counter() - t_mask:.1f}s")
            decode_done_t = time.perf_counter()
            prev = next_handover(v, a,
                                 None if s.get("continuation_method") in ("protected", "h3studio")
                                 else frames[-1:].clone(), prev, it["link"])
            seg_v.append(v)
            seg_a.append(a)
            # No full export in generate mode: the full take is already
            # persisted as a master, so writing ~3 GiB of decoded frames
            # per segment to a temporary disk chain serves no purpose.
            last_generated_preview = frames[:1].clone()
            chain_done_t = time.perf_counter()
            run_wave_keys.append((k, True, len(seg_a) - 1, None))
            render_key = k + "_uncorrected" if studio_mode else k
            post_phase(i, "preview")
            res = segment_media(d, sub, render_key, frames, a, audio_vae, audio,
                                proj, it, fps, wave=lambda _j=len(run_wave_keys) - 1: take_wave(_j))
            media_done_t = time.perf_counter()
            res.update({"index": i, "key": k, "seg_key": keys[i], "cached": False,
                        "frames": int(frames.shape[0]), "kind": kind, "wh": [run_w, run_h],
                        "seed": core.effective_params(proj, i)["seed"], "created": int(time.time())})
            gm = core.gen_mode(proj, seg_i)
            if gm:
                res["gen"] = gm
            if MR.any and not core.is_footage(seg_i):
                res["models"] = MR.info(i)
            results.append(res)
            # The editor can play the low-res preview while the original-quality
            # master is still being encoded. Keep the master synchronous: no
            # extra frame copies or background RAM/VRAM growth on small PCs.
            notify("seg_preview", seg=i, result=res)
            post_phase(i, "master")
            master_t0 = time.perf_counter()
            store.save_master(d, k, v, frames, fps)
            master_done_t = time.perf_counter()
            if eta_clock is not None:
                eta_clock.finish_post(i, master_done_t - post_t0)
            log(f"  frame timing clip {i + 1}: high-quality take master encode {master_done_t - master_t0:.1f}s")
            try:
                from . import h3s_library
                h3s_library.gallery_add(d, h3s_library.segment_entry(
                    proj["id"], proj.get("name"), sub, res, seg_i, i, kind))
            except Exception as exc:
                vlog(f"gallery: {exc}")
            log(f"  post-sampling timing: VAE decode {decode_done_t - post_t0:.1f}s; "
                f"latent chain {chain_done_t - decode_done_t:.1f}s; preview/audio/MP4 {media_done_t - chain_done_t:.1f}s; "
                f"take master {master_done_t - master_t0:.1f}s; gallery {time.perf_counter() - master_done_t:.1f}s")
            notify("seg_done", seg=i, result=res)
            del frames
            if fresh:
                # The new take is safely committed. Release live-preview
                # callbacks and temporary sampler buffers before the next scene;
                # only prev's CPU AV tail is needed for latent continuation.
                if "live_box" in locals():
                    live_box.clear()
                pcb = None
                step_cb = None
                from . import h3s_memory as memory
                memory.cleanup_runtime(f"after segment {i + 1}")
            continue
        # The ordinary take master is always authoritative for sampling. In
        # full H3Studio playback a corrected RGB8 cache can replace its costly
        # decode + frame-by-frame Lab processing without altering the AV latent.
        # Partial/face/upscaled/frozen runs use the unmodified path.
        studio_cache_key, studio_cached = None, None
        if (studio_mode and use_cache and first == 0 and not frozen[i] and not ukeys[i]
                and not fr_for(i) and (i == 0 or studio_cache_prev is not None)):
            from . import h3s_studio_cache as studio_cache
            studio_cache_key = studio_cache.identity(
                k, keys[0], studio_cache_prev, it, run_w, run_h, fps)
            if hit:
                studio_cached = studio_cache.load(d, studio_cache_key, it["frames"])
                if i == 0 and studio_cached is not None and studio_cached[1] is None:
                    studio_cached = None  # clip 1 must restore its original Lab reference
        if operation == "assemble" and studio_mode and studio_cached is None:
            # неподготовленная цветокоррекция не должна блокировать сборку: собираем из мастер-копии
            # отрезка (её всё равно декодируем по одному отрезку, память не растёт), но говорим об этом
            log(f"studio: цветокоррекция отрезка {i + 1} не подготовлена — собираю из мастер-копии отрезка")
        if studio_cached is not None:
            frames = studio_cached[0]
            vlog(f"studio: colour-frame cache HIT clip {i + 1} {studio_cache_key[:12]} "
                 "(skip take-master decode and Lab processing)")
        else:
            frames = take_frames(k, v, fresh, i)
        fr_used = None
        fr_i = fr_for(i) if not core.is_footage(seg_i) else None
        if fr_i:   # v6k «Рефайн лица»: the face-refined copy of this take (cached under its own key, kept as a take)
            fk = face_refine_key(k, fr_i, core.effective_params(proj, i)["seed"])
            fpt = seg_pt_path(d, fk)
            store.restore(d, fk, fpt)
            if use_cache and usable_cache_file(fpt):
                v = load_av_cache(fpt)["v"]
                frames = take_frames(fk, v, False, i)
                log(f"segment {i + 1}: face refine from cache {fk}")
            else:
                from . import h3s_face
                notify("phase", seg=i, phase="face_refine")
                refs_fr = [load_asset_image(x) for x in core.ordered_refs(proj, seg_i)]
                for x in core.kf_assets(proj, seg_i):   # «Кадры»: the frame pictures carry the character too
                    if x and x.get("category") != "audio" and not any(x["id"] == r["id"] for r in core.ordered_refs(proj, seg_i)):
                        refs_fr.append(load_asset_image(x))

                def fr_step(step, total, dyn=None, _i=i):
                    done_steps[0] += 1
                    pbar.update_absolute(done_steps[0], max(1, todo_steps))
                    el = time.perf_counter() - t0
                    notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                           elapsed=round(el, 1), eta=round(el / max(1, done_steps[0]) * (todo_steps - done_steps[0]), 1),
                           **(dyn or {}))

                fr_last = [0.0]

                def fr_stage(name, _i=i, **kw):   # v6l: detect (frames done) → refine → paste, as "phase" events
                    now = time.perf_counter()
                    if name == "detect" and 0 < kw.get("fd", 0) < kw.get("fn", 0) and now - fr_last[0] < 0.25:
                        return   # at most 4 detect updates a second
                    fr_last[0] = now
                    notify("phase", seg=_i, phase="face_" + name, **kw)
                t_fr = time.perf_counter()
                try:
                    fr_frames, fr_info = h3s_face.refine_clip(*MC(i), vae, proj, i, frames, a, fr_i, refs_fr, fr_step, log, stage=fr_stage,
                                                              live_factory=lambda m, _i=i: LivePreview(notify, m, _i, settings=s, audio_vae=None, out_dir=d, sub=sub))
                except ValueError as e:
                    if fr_run and only == i:
                        raise
                    fr_frames = None   # a kept pass that cannot run now (no cv2 / model / face): the base take, a warning
                    log(f"segment {i + 1}: face refine skipped — {e}")
                    notify("warn", msg=str(e), kind="face_refine")
                if fr_frames is not None:
                    frames = fr_frames
                    v = vae.encode(frames).float().cpu()   # the take's latent (chain / later runs); its master keeps the pixels
                    atomic.save_torch({"v": v, "a": a, "fr": fr_info}, fpt)
                    store.save_master(d, fk, v, frames, fps)
                    log(f"segment {i + 1}: face refined in {time.perf_counter() - t_fr:.1f}s -> {fk}")
                    fresh = True
            if os.path.isfile(fpt):
                store.keep(d, fk, fpt, {"seg_id": seg_i["id"], "seg": i, "kind": "face_refine", "base": k, "fr": fr_i})
                k = fk
                fr_used = fr_i
        # PROTECTED continues exclusively through the latent tail, never an RGB last-frame handover.
        prev = next_handover(v, a,
                             None if s.get("continuation_method") in ("protected", "h3studio")
                             else frames[-1:].clone(), prev, it["link"])
        seg_v.append(v)
        seg_a.append(a)
        uk, rk, rwh, uinfo = ukeys[i], k, [run_w, run_h], None
        if uk:   # «Апскейл отрезка»: upscale + refine of the finished clip (cached = resume); footage: its encoded frames
            upt = seg_pt_path(d, uk)
            if up_cached[i]:
                uv = load_av_cache(upt)["v"]
                log(f"segment {i + 1}: upscale from cache {uk}")
                hit_up = True
            else:
                hit_up = False
                t_up = time.perf_counter()
                notify("phase", seg=i, phase="upscale")

                def up_step(step, total, _i=i):
                    done_steps[0] += 1
                    pbar.update_absolute(done_steps[0], max(1, todo_steps))
                    el = time.perf_counter() - t0
                    rate = el / max(1, done_steps[0])
                    notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                           elapsed=round(el, 1), eta=round(rate * (todo_steps - done_steps[0]), 1))
                    vlog(f"[{text_bar(step + 1, total)}] seg {_i + 1} upscale step {step + 1}/{total} · {done_steps[0]}/{todo_steps}")
                refs_u = [load_asset_image(x) for x in core.ordered_refs(proj, seg_i)]
                ra_u = ref_audio_latents(audio_vae, proj, seg_i, sources)
                def up_prog(_i=i, **kw):
                    if kw.get("phase"):
                        notify("phase", seg=_i, phase="up_input", input=kw.get("input"), chunk=kw.get("chunk", 1), chunks=kw.get("chunks", 1))
                        return
                    el = time.perf_counter() - t0
                    notify("uptile", seg=_i, done=done_steps[0], total=todo_steps, elapsed=round(el, 1), **kw)
                uv, _a, uinfo = upscale.run_upscale(None, None, vae, proj, i, items, v, a, frames, prev_up, refs_u, ra_u, up_step, None, up_prog,
                                                    models=lambda _i=i: MC_UP(_i),   # H3 (+ LoRAs / the upscale's own model) resolved after the upscaler
                                                    preview_factory=lambda m, _i=i: LivePreview(notify, m, _i, settings=s, audio_vae=None, out_dir=d, sub=sub))
                notify("phase", seg=i, phase="upscale")
                atomic.save_torch({"v": uv, "a": a, "info": uinfo}, upt)
                log(f"segment {i + 1}: upscale done in {time.perf_counter() - t_up:.1f}s -> {uinfo['wh'][0]}x{uinfo['wh'][1]} ({uinfo['input']})")
                if uinfo.get("input") == "stretch" and not stretch_warned:
                    stretch_warned = True
                    notify("warn", msg=upscale.STRETCH_WARN, kind="upscale_stretch")
            notify("phase", seg=i, phase="decode")
            t_dec = time.perf_counter()
            frames = take_frames(uk + k[len(keys[i]):], uv, fresh or not hit_up, i,   # chunk by chunk when chunked
                                 lambda: upscale.decode_chunks(vae, uv, upscale.chunk_plan(s, uv.shape[2], a.shape[-1], seg_i["upscale"]["method"])))
            log(f"segment {i + 1}: upscaled clip decoded in {time.perf_counter() - t_dec:.1f}s ({frames.shape[2]}x{frames.shape[1]}, {frames.shape[0]} fr)")
            prev_up = {"v": uv}
            rk, rwh = uk + k[len(keys[i]):], [int(uv.shape[-1]) * 16, int(uv.shape[-2]) * 16]   # + audio-refine suffix
            hit = hit and hit_up
            seg_up.append(uv)
        elif frozen[i] and hit and v_frozen is not None and tuple(v_frozen.shape[-2:]) != tuple(v.shape[-2:]) \
                and v_frozen.shape[-1] > v.shape[-1]:
            # a take frozen after its upscale: shown at its own (larger) canvas, the run canvas copy is the chain
            frames = take_frames(k, v_frozen, False, i)
            prev_up = {"v": v_frozen}
            rwh = [int(v_frozen.shape[-1]) * 16, int(v_frozen.shape[-2]) * 16]
            seg_up.append(v_frozen)
        else:
            prev_up = None
            seg_up.append(None)
        if studio_mode:
            studio_cache_ready = studio_cached is not None
            if studio_cached is not None:
                if studio_ref_lab is None:
                    studio_ref_lab = torch.tensor(studio_cached[1], dtype=torch.float32)
                # Already colour-corrected and RGB8-normalized on its original run.
            else:
                from . import h3s_studio_color as studio
                if studio_ref_lab is None:
                    studio_ref_lab = studio.stats(frames, window=36)
                    if studio_ref_lab is not None and len(frames) > 48:
                        frames = studio.pull(frames, studio_ref_lab, 36, i + 1)
                    vlog(f"studio: clip {i + 1} set the Lab colour reference (first 36 frames)")
                elif studio_ref_lab is not None:
                    if it["link"] == "extend" and it["overlap"] and studio_prev_tail is not None:
                        frames = studio.tone_shift(studio_prev_tail, frames, it["overlap"], i + 1)
                    start_rgb = int(it["overlap"]) if it["link"] == "extend" else 0
                    frames = studio.pull(frames, studio_ref_lab, start_rgb, i + 1)
                if studio_cache_key is not None and studio_cache.save(
                        d, studio_cache_key, frames, studio_ref_lab if i == 0 else None):
                    # Quantize on both paths, otherwise a fresh run and a warm
                    # one could differ in the final bridge by subpixel rounding.
                    frames = studio_cache.quantize(frames)
                    studio_cache_ready = True
                    vlog(f"studio: colour-frame cache saved clip {i + 1} {studio_cache_key[:12]}")
            studio_prev_tail = frames[-max(1, studio_tail_size):].clone()
            studio_cache_prev = studio_cache_key if studio_cache_ready else None
        seg_frames.append(frames)
        run_wave_keys.append((rk, fresh, len(seg_a) - 1, k if rk != k else None))
        # Rendered studio clips have their own media namespace; do not overwrite an
        # existing overlap/protected preview of the same underlying take key.
        render_key = rk + "_studio_c3" if studio_mode else rk
        # Save-only colour preparation and assembly do not need another editor MP4
        # per cached take. The final movie below receives the requested colour grade.
        export_preparation = (operation == "colour" and (proj.get("run") or {}).get("export_colour") is True)
        previous_video = (seg_i.get("result") or {}).get("video")
        reuse_preview = ((operation == "assemble" or export_preparation) and isinstance(previous_video, dict)
                         and bool(previous_video.get("filename"))
                         and os.path.isfile(os.path.join(d, os.path.basename(previous_video["filename"]))))
        post_phase(i, "preview")
        res = segment_media(d, sub, render_key, frames, a, audio_vae, audio, proj, it, fps,
                            wave=lambda _j=len(run_wave_keys) - 1: take_wave(_j), skip_mp4=reuse_preview)
        if reuse_preview:
            res["video"] = previous_video
            vlog(f"segment {i + 1}: export preparation reused editor preview (skip redundant MP4 encode)")
        # Read-only measurements, computed on the delivered frames (not the carried overlap).
        # The baseline resets after a cut; no samples or cache keys are modified.
        # Colour comparison feeds the colour layer only: with it switched off (assemble without
        # цветокоррекция) the measurement is pointless — and it is expensive, every segment scans
        # all of its frames on the CPU.
        if studio_mode:
            try:
                skip = int(it["overlap"]) if i > 0 and it["link"] == "extend" else 0
                sig = diagnostics.clip_signature(frames, skip=skip)
                if sig is not None:
                    if drift_reference is None or it["link"] != "extend":
                        drift_reference, drift_reference_index = sig, i
                    relative = diagnostics.compare_signatures(drift_reference, sig)
                    res["drift"] = {"baseline_segment": drift_reference_index, "signature": sig, "relative": relative}
                    vlog(f"visual drift seg {i + 1} vs seg {drift_reference_index + 1}: "
                         f"brightness {relative['luma_delta']:+.3f}, contrast x{relative['contrast_ratio']}, "
                         f"detail x{relative['detail_ratio']} (diagnostic only)")
            except Exception as exc:
                vlog(f"visual drift diagnostics skipped for segment {i + 1}: {exc}")
        if i > first and it["link"] == "extend" and len(seg_frames) > 1:   # seam rating of the join on the left
            try:
                from . import h3s_seams
                sr_ = h3s_seams.rate_video(seg_frames[-2], frames[it["overlap"]:])
                if sr_:
                    res["seam"] = sr_
                    if sr_["verdict"] != "ok":
                        log(f"seam {i}->{i + 1}: {h3s_seams.VERDICTS[sr_['verdict']]} (×{sr_['ratio']}) — «Ещё дубль» may give a smoother join")
            except Exception as e:
                vlog(f"seam rating failed: {e}")
        res.update({"index": i, "key": rk, "seg_key": keys[i], "cached": hit, "frames": int(frames.shape[0]), "kind": kind, "wh": rwh,
                    "seed": core.effective_params(proj, i)["seed"], "created": int(time.time())})
        ci = None if core.is_footage(seg_i) else (CTL_RUN["info"].get(i) if not hit else None)
        if ci is None and hit and not core.is_footage(seg_i) and core.control_window(proj, it):
            ci = {"ok": not keys[i].endswith("n"), "mode": core.control_window(proj, it)["mode"], "cached": True}
        if ci:
            res["ctl"] = ci   # v6k: the take was guided by the control track (ok False: made without — model missing)
        gm = core.gen_mode(proj, seg_i)
        if gm:
            res["gen"] = gm   # the mode this take was generated with (timeline badge REF / T2V / I2V / FLF / L2V / V2V)
        if MR.any and not core.is_footage(seg_i):
            res["models"] = MR.info(i)   # preset / base / LoRAs of this take (gallery, takes)
        if fr_used:
            res["fr"] = dict(fr_used)   # v6k: the editor keeps it on the segment / take (seg.fr) so later runs keep the refined face
        if ar_used:
            res["ar"] = dict(ar_used)   # the editor keeps it on the segment / take (seg.ar) so later runs stay enhanced
        if kind == "refine" and dkeys and i < len(dkeys):
            res["draft_key"] = dkeys[i]   # gallery lineage: this final was made from that draft
        if uk:
            res.update({"base_key": k, "upscale": dict(seg_i["upscale"]), "base_wh": [run_w, run_h]})
            if uinfo:
                res["up_input"] = uinfo["input"]
        results.append(res)
        try:
            from . import h3s_library
            h3s_library.gallery_add(d, h3s_library.segment_entry(proj["id"], proj.get("name"), sub, res, seg_i, i, kind))
        except Exception as e:
            log(f"gallery: {e}")
        if torch.cuda.is_available():
            try:
                allocated = torch.cuda.memory_allocated() / 2**30
                reserved = torch.cuda.memory_reserved() / 2**30
                log(f"memory after segment {i + 1}: CUDA allocated {allocated:.2f} GiB, reserved {reserved:.2f} GiB; {ram()}")
            except Exception as e:
                vlog(f"memory probe skipped: {e}")
        notify("seg_done", seg=i, result=res)
    if operation in ("generate", "colour"):
        # No full movie in these actions. Downstream ComfyUI outputs remain valid,
        # but intentionally represent just the last clip (one preview frame),
        # never an incorrectly truncated assembled timeline.
        if len(seg_v):
            tail_index = run_wave_keys[-1][2] if run_wave_keys else len(seg_v) - 1
            tail_v = seg_v[tail_index]
            tail_a = seg_a[tail_index]
        else:
            tail_data = load_av_cache(seg_pt_path(d, keys[-1], frozen[-1]))
            tail_v, tail_a = tail_data["v"], tail_data["a"]
        if operation == "generate":
            images = (last_generated_preview if last_generated_preview is not None
                      else torch.zeros((1, run_h, run_w, 3), dtype=torch.float32))
        else:
            images = (seg_frames[len(seg_frames) - 1][:1].clone() if len(seg_frames)
                      else torch.zeros((1, run_h, run_w, 3), dtype=torch.float32))
        waveform = take_wave(len(run_wave_keys) - 1) if run_wave_keys else store.load_wave(d, keys[-1])
        if waveform is not None:
            out_audio = {"waveform": waveform[0].unsqueeze(0), "sample_rate": int(waveform[1])}
        else:
            out_audio = {"waveform": torch.zeros((1, 2, 4410)), "sample_rate": 44100}
        latent = {"samples": comfy.nested_tensor.NestedTensor((tail_v, tail_a))}
        elapsed = round(time.perf_counter() - t0, 1)
        notify("done", elapsed=elapsed, full=None, segments=results, audio_source=src_info,
               regions=[], operation=operation)
        log(f"{operation}: done in {elapsed:.1f}s, {len(results)} clip(s) processed; "
            "no full timeline decode/stitch/export")
        for chain in (seg_frames, seg_v, seg_a, seg_up):
            chain.close()  # immediately free temporary frame/latent files on success
        return images, out_audio, latent, {"segments": results, "full": None,
                                           "keys": keys, "estimate": est, "operation": operation,
                                           "audio_source": src_info, "regions": [], "fsigs": fsigs}
    # ---- stitch (rebased when the run starts after untouched segments)
    notify("phase", seg=max(0, len(items) - 1), phase="stitch")
    run_items = items[first:]
    if first:
        base = run_items[0]["start"]
        run_items = [dict(x, start=x["start"] - base, end=x["end"] - base) for x in run_items]
        run_items[0] = dict(run_items[0], overlap=0, link="start")
    # mixed canvases (some clips upscaled): frames are stitched at the largest canvas, the latent output uses the
    # upscaled latents only when every clip has them on one canvas (else the base latents)
    span_wh = [core.upscale_canvas(run_w, run_h, rp["rg"]["upscale"]) for rp in reg_plans if rp.get("ukey")]   # upscaled spans
    cw_ = max([int(seg_frames.shape(j)[2]) for j in range(len(seg_frames))] + [w_ for w_, _h in span_wh])
    ch_ = max([int(seg_frames.shape(j)[1]) for j in range(len(seg_frames))] + [h_ for _w, h_ in span_wh])
    base_v = seg_v   # disk-backed generation chain; regions load only their needed scenes
    if len(seg_up) and all(seg_up.shape(j) is not None for j in range(len(seg_up))) and len({tuple(seg_up.shape(j)[-2:]) for j in range(len(seg_up))}) == 1:
        seg_v = seg_up
    elif any(seg_up.shape(j) is not None for j in range(len(seg_up))) or span_wh:
        log(f"stitch: mixed canvases -> frames resized to {cw_}x{ch_}; the latent output keeps the base latents ({run_w}x{run_h})")
    out_frames = DiskTensorList(chain_dir, 'stitch_frames')
    out_v = DiskTensorList(chain_dir, 'stitch_video_latents')
    out_a = DiskTensorList(chain_dir, 'stitch_audio_latents')
    gap_parts = []   # (index into out_frames) of the black gap fillers: not clips (level lock / seam rating skip them)
    for i, it in enumerate(run_items):
        ovf = it["overlap"] if i > 0 else 0
        fr_i = seg_frames[i][ovf:]
        if (int(fr_i.shape[2]), int(fr_i.shape[1])) != (cw_, ch_):
            fr_i = _resize(fr_i, cw_, ch_)
        seg_frames[i] = None   # the view in out_frames is all that is needed now; cat_release frees it part by part
        g_i = int(it.get("gap") or 0) if (i > 0 or not first) else 0
        if g_i:   # an empty stretch of the timeline: black frames (the sound is silence: stitched by start frame)
            gap_parts.append(len(out_frames))
            out_frames.append(torch.zeros((g_i, ch_, cw_, int(fr_i.shape[3])), dtype=fr_i.dtype))
        out_frames.append(fr_i)
        if ovf:
            out_v.append(seg_v[i][:, :, core.latent_t(ovf):])
            f_start = run_items[i - 1]["frames"] - ovf
            a_ov = seg_a[i - 1].shape[-1] - round(f_start / core.FPS * core.AUDIO_LATENT_FPS)
            out_a.append(seg_a[i][..., max(0, a_ov):])
        else:
            out_v.append(seg_v[i])
            out_a.append(seg_a[i])
    frames = direct = None   # the last clip's frames from the loop above are no longer needed (they would stay alive to the end)
    stream_file = os.path.join(d, f".stream_{os.getpid()}_{threading.get_ident()}.frames") if stream_output else None
    if stream_output:
        swept = sweep_stream_files(d, keep=stream_file)
        if swept["freed"]:
            log(f"streaming: освобождено {swept['freed'] / 1e9:.2f} ГБ брошенных файлов кадров")
        images, out_lens = cat_to_disk(out_frames, stream_file)
        log(f"streaming: disk-backed video frames ({images.shape[0]} frames), full IMAGE output disabled")
    else:
        images, out_lens = cat_release(out_frames)
    level_n = 0 if export_colour is False else core.level_lock_frames(proj)
    if studio_mode:
        # Studio has its own RGB tone + Lab anchor + bridge. Do not stack the
        # general level-lock filter on top of it (it would undo the Lab match).
        from . import h3s_studio_color as studio
        at, clip_no = 0, 0
        gap_set = set(gap_parts)
        for part_no, part_len in enumerate(out_lens):
            if part_no in gap_set:
                at += part_len
                continue
            if clip_no and part_no - 1 not in gap_set and run_items[clip_no]["link"] == "extend" and run_items[clip_no]["overlap"]:
                studio.bridge(images, at, part_len)
                log(f"studio: RGB bridge at segment {clip_no}->{clip_no + 1} (16 frames before, 28 after)")
                try:
                    from . import h3s_seams
                    after = h3s_seams.rate_video(images[max(0, at - 12):at], images[at:at + 12])
                    raw = results[clip_no].get("seam") if clip_no < len(results) else None
                    if after and raw:
                        results[clip_no]["seam"] = dict(after, raw={"ratio": raw["ratio"], "verdict": raw["verdict"]},
                                                        studio_bridge=True)
                except Exception as exc:
                    vlog(f"studio: bridge rating skipped ({exc})")
            at += part_len
            clip_no += 1
    elif level_n:   # generic level lock remains unchanged in overlap/protected
        level_lock_joins(images, [n_ for k, n_ in enumerate(out_lens) if k not in gap_parts], run_items, results, level_n,
                         gaps=[out_lens[k] for k in gap_parts], gap_at=gap_parts)
    # Allocate only the final tensors; intermediate scene slices stay on disk.
    lat_v = cat_disk_latents(out_v, 2)
    lat_a = cat_disk_latents(out_a, -1)
    out_v.close()
    out_a.close()
    latent = {"samples": comfy.nested_tensor.NestedTensor((lat_v, lat_a))}
    seam = core.audio_seam_params(proj)
    if audio_cov is not None and audio_z is not None:   # seams covered by the locked track are left as they are
        seam["skip"] = [bool(i and it["overlap"] and audio_cov[round(it["start"] / fps * core.AUDIO_LATENT_FPS):
                                                          round((it["start"] + it["overlap"]) / fps * core.AUDIO_LATENT_FPS)].sum() > 0)
                        for i, it in enumerate(items)][first:]
    vlog(f"stitch: {len(run_items)} segment(s) -> {images.shape[0]} frames; audio seams: crossfade "
         f"{seam.get('xfade') or 'hard cut'} s, loudness match {'on' if seam.get('match') else 'off'}"
         + (f", skipped under track: {[i for i, x in enumerate(seam['skip']) if x]}" if seam.get("skip") else ""))
    if first and tl_audio is not None:   # the node/track audio from the run's start
        sr_ = tl_audio["sample_rate"]
        tl_audio = {"waveform": tl_audio["waveform"][..., int(round(items[first]["start"] / fps * sr_)):], "sample_rate": sr_}
    notify("phase", seg=max(0, len(items) - 1), phase="audio_mix")
    out_audio = full_audio(audio_vae, tl_audio, lat_a, images.shape[0], fps, seg_a, run_items, seam,
                           wave=take_wave if len(run_wave_keys) == len(seg_a) else None)
    if out_audio is not None:   # audio part of the seam rating (the stitched sound at each rated join)
        try:
            from . import h3s_seams
            wf_, sr_ = out_audio["waveform"][0], int(out_audio["sample_rate"])
            for k, r in enumerate(results):
                if r.get("seam") and k < len(run_items):
                    at = int(round((run_items[k]["start"] + run_items[k]["overlap"]) / fps * sr_))
                    ra = h3s_seams.rate_audio(wf_, sr_, at)
                    if ra:
                        r["seam"]["audio"] = ra
        except Exception as e:
            vlog(f"audio seam rating failed: {e}")
    reg_results = []
    images0, audio0 = images, out_audio   # spans over joins encode the stitched result before any region splice
    for rp in reg_plans:
        rg, win = rp["rg"], rp["win"]
        name = rg.get("name") or rg["id"]
        si = max(0, win["seg"])
        t_r = time.perf_counter()
        hit_r = rp["cached"]
        if hit_r:
            rd = load_av_cache(rp["pt"])
            rv, ra = rd["v"], rd["a"]
            log(f"region «{name}»: from cache {rp['key']}")
        else:
            notify("phase", seg=si, phase="region", region=rg["id"])

            def r_step(step, total, _si=si):
                done_steps[0] += 1
                pbar.update_absolute(done_steps[0], max(1, todo_steps))
                el = time.perf_counter() - t0
                rate = el / max(1, done_steps[0])
                notify("step", seg=_si, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                       elapsed=round(el, 1), eta=round(rate * (todo_steps - done_steps[0]), 1), region=rg["id"])
                vlog(f"[{text_bar(step + 1, total)}] region «{name}» step {step + 1}/{total} · {done_steps[0]}/{todo_steps}")
            pcb_r = LivePreview(notify, MC(si)[0], si, settings=s, audio_vae=None, out_dir=d, sub=sub)
            refs_r = [load_asset_image(x) for x in core.region_refs(proj, rg)]
            if win.get("mode") == "bridge":
                sv, sa = region.bridge_source(vae, audio_vae, images0, audio0, win, run_w, run_h)
                rk_ = "full" if kind == "refine" else kind
                log(f"region «{name}»: span over a join ({win['ws']}-{win['we']}, regenerate {win['a']}-{win['b']}"
                    + (f", gaps {win['gaps']}" if win.get("gaps") else "") + f") — source encoded from the stitched video" + (" · one final pass" if rk_ != kind else ""))
                rv, ra = region.sample_region(*MC(si), vae, proj, rg, win, sv, sa, rk_, refs_r, None, audio_z, audio_cov, r_step, pcb_r)
                atomic.save_torch({"v": rv, "a": ra, "win": {k: win[k] for k in ("ws", "a", "b", "we", "to_end")}}, rp["pt"])
                log(f"region «{name}»: done in {time.perf_counter() - t_r:.1f}s")
            cv = ca = None
        if not hit_r and win.get("mode") != "bridge":
            cv, ca = region.chain_latents(items, base_v, seg_a, win["i0"], max(win["segs"]))
            sv, sa, a0 = region.window_latents(win, cv, ca)
            ha = round(win["head"] / core.FPS * core.AUDIO_LATENT_FPS)
            ext = core.audio_context_extra(proj, ha, a0) if ha else 0
            ctx = (ca[..., a0 - ext:a0 + ha], ext) if ext else None
            if kind == "refine":
                dpt = os.path.join(d, "cache", f"region_{rp['dkey']}.pt")
                if use_cache and usable_cache_file(dpt):
                    dd = load_av_cache(dpt)
                    rdv, rda = dd["v"], dd["a"]
                    log(f"region «{name}»: draft from cache {rp['dkey']}")
                else:
                    dv_l = [get_draft(j)["v"] for j in range(win["i0"], max(win["segs"]) + 1)]
                    da_l = [get_draft(j)["a"] for j in range(win["i0"], max(win["segs"]) + 1)]
                    dcv, dca = region.chain_latents(items, dv_l, da_l, win["i0"], max(win["segs"]), base=win["i0"])
                    dsv, dsa, da0 = region.window_latents(win, dcv, dca)
                    dctx = (dca[..., da0 - ext:da0 + ha], ext) if ext else None
                    notify("phase", seg=si, phase="region_draft", region=rg["id"])
                    rdv, rda = region.sample_region(*MC(si), vae, proj, rg, win, dsv, dsa, "draft", refs_r, dctx, audio_z, audio_cov, r_step, pcb_r)
                    atomic.save_torch({"v": rdv, "a": rda}, dpt)
                um = s.get("upscale_method", "learned")
                notify("phase", seg=si, phase="up_input", input=upscale.effective_input(um) or um, region=rg["id"])
                dfr = decode_video(vae, rdv.to(dev0))
                up = upscale_video_latent(vae, rdv, run_w, run_h, um, frames=dfr, model=s.get("upscale_model") or None)
                notify("phase", seg=si, phase="region", region=rg["id"])
                rv, ra = region.sample_region(*MC(si), vae, proj, rg, win, sv, sa, "refine", refs_r, None, None, None, r_step, pcb_r, refine=(up, rda))
            else:
                rv, ra = region.sample_region(*MC(si), vae, proj, rg, win, sv, sa, kind, refs_r, ctx, audio_z, audio_cov, r_step, pcb_r)
            atomic.save_torch({"v": rv, "a": ra, "win": {k: win[k] for k in ("ws", "a", "b", "we", "to_end")}}, rp["pt"])
            log(f"region «{name}»: done in {time.perf_counter() - t_r:.1f}s")
        rup, rinfo = rp.get("ukey"), None
        if rup:   # «Апскейл участка»
            if rp["up_cached"]:
                rdu = load_av_cache(rp["upt"])
                uvr, rinfo = rdu["v"], rdu.get("info")
                log(f"region «{name}»: upscale from cache {rup}")
            else:
                t_u = time.perf_counter()
                notify("phase", seg=si, phase="upscale", region=rg["id"])

                def ru_step(step, total, _si=si):
                    done_steps[0] += 1
                    pbar.update_absolute(done_steps[0], max(1, todo_steps))
                    el = time.perf_counter() - t0
                    notify("step", seg=_si, step=step + 1, steps=total, done=done_steps[0], total=todo_steps, elapsed=round(el, 1),
                           eta=round(el / max(1, done_steps[0]) * (todo_steps - done_steps[0]), 1), region=rg["id"])
                refs_u = [load_asset_image(x) for x in core.region_refs(proj, rg)]
                uvr, _ra, rinfo = upscale.run_upscale(None, None, vae, proj, si, all_items, rv, ra, None, None, refs_u, None, ru_step, None, None,
                                                      up=rg["upscale"], holder=rg, prompt=core.region_prompt(proj, rg), label=f"region «{name}»",
                                                      models=lambda _si=si: MC_UP(_si))   # H3 resolved after the upscaler
                atomic.save_torch({"v": uvr, "a": ra, "info": rinfo}, rp["upt"])
                log(f"region «{name}»: upscale done in {time.perf_counter() - t_u:.1f}s -> {rinfo['wh'][0]}x{rinfo['wh'][1]} ({rinfo['input']})")
            fr_w = upscale.decode_chunks(vae, uvr, upscale.chunk_plan(s, uvr.shape[2], ra.shape[-1], rg["upscale"]["method"]))
        else:
            fr_w = decode_video(vae, rv.to(dev0))
        images, n_rep = region.splice_frames(images, fr_w, win, in_place=stream_output)
        sinfo = {}
        if out_audio is not None and audio_vae is not None:
            try:
                wr = decode_audio(audio_vae, ra.to(dev0), normalize=False)["waveform"][0].cpu()
                out_audio = {"waveform": region.splice_audio(out_audio["waveform"][0].float(), out_audio["sample_rate"], wr, win, fps, sinfo)[None],
                             "sample_rate": out_audio["sample_rate"]}
            except Exception as e:
                log(f"region «{name}»: audio splice failed ({e}); the video part is replaced, the sound stays")
        log(f"region «{name}»: frames {win['a']}-{win['a'] + n_rep} replaced (frame-exact)"
            + (f"; audio spliced sample-exactly: offset {sinfo['lag_ms']} ms, corr head {sinfo['corr_head']} / tail {sinfo['corr_tail']}, "
               f"gain {sinfo['gain']}, seams at {sinfo['head_at_s']}s / {sinfo['tail_at_s']}s" if sinfo else ""))
        try:   # both seams of the span: level lock (decoded frames only) + rating, like the clip joins
            from . import h3s_seams
            r_end = win["a"] + n_rep
            seams_r = h3s_seams.span_seams(images, win["a"], r_end, level_n, out_audio["waveform"][0] if out_audio else None,
                                           out_audio["sample_rate"] if out_audio else None, fps, head=win["a"] > win["ws"], tail=r_end < min(win["we"], images.shape[0]))
            for sd_, sq_ in seams_r.items():
                log(f"region «{name}»: {'start' if sd_ == 'head' else 'end'} seam {h3s_seams.VERDICTS[sq_['verdict']]} ×{sq_['ratio']}"
                    + (f" (before level lock ×{sq_['raw']['ratio']})" if sq_.get("raw") else "") + (f", sound jump {sq_['audio']['db']} dB" if sq_.get("audio", {}).get("warn") else ""))
        except Exception as e:
            seams_r = {}
            vlog(f"region «{name}»: seam rating failed: {e}")
        rres = segment_media(d, sub, "r" + (rup or rp["key"]), fr_w, ra, audio_vae, audio, proj, {"frames": int(fr_w.shape[0])}, fps)
        rres.update({"region": rg["id"], "key": rp["key"], "cached": hit_r, "frames": int(fr_w.shape[0]), "kind": kind,
                     "ws": win["ws"], "a": win["a"], "b": win["b"], "we": win["we"], "seed": int(rg.get("seed") or 0),
                     "wh": [int(fr_w.shape[2]), int(fr_w.shape[1])], "created": int(time.time()), "generated": rp["gen"],
                     "mode": core.span_kind(win), "seams": seams_r,
                     "up": {"key": rup, "wh": [int(fr_w.shape[2]), int(fr_w.shape[1])], "input": (rinfo or {}).get("input"),
                            "method": rg["upscale"]["method"]} if rup else None})
        if MR.any:
            rres["models"] = MR.info(max(0, win["seg"]))
        reg_results.append(rres)
        try:   # gallery: the region's take, stacked with the segment it was cut from
            from . import h3s_library
            host = next((it for it in items if it["start"] <= win["a"] < it["end"]), None) or next((it for it in items if it["index"] in win["segs"]), None)
            if host is not None:
                h3s_library.gallery_add(d, h3s_library.region_entry(proj["id"], proj.get("name"), rres, rg, proj["segments"][host["index"]], host["index"],
                                                                    host.get("key") if isinstance(host.get("key"), str) else None))
        except Exception as e:
            log(f"gallery: {e}")
        if rp["gen"]:
            notify("region_done", region=rg["id"], result=rres)
    end = int(proj.get("end") or 0)
    if 0 < end < images.shape[0] and len(items) == len(all_items):   # video end marker: exact cut
        images = images[:end]
        if out_audio is not None:
            out_audio = {"waveform": out_audio["waveform"][..., :int(round(end / fps * out_audio["sample_rate"]))],
                         "sample_rate": out_audio["sample_rate"]}
    if (proj.get("run") or {}).get("no_audio"):
        log("export: run.no_audio — the MP4 is written without an audio track")
        out_audio = None
    # Export codec does not affect any cached H3 latents, takes or colour frames.
    export_encoder = (proj.get("run") or {}).get("export_encoder") or ""
    if export_encoder not in ("cpu", "nvenc"):
        export_encoder = ""
    if not export_encoder:      # auto: NVENC is ~10x faster than libx264 and falls back on failure
        export_encoder = "nvenc" if media.nvenc_available() else "cpu"
    # FFmpeg's concat demuxer can copy original compressed takes only for
    # hard-cut, unfiltered, same-canvas timelines. In every other case use the
    # frame-exact H3 compositor (overlap, grading, gaps and regions are material).
    export_concat_requested = (proj.get("run") or {}).get("export_concat") is True
    concat_eligible = bool(export_concat_requested
                           and operation == "assemble" and first == 0
                           and len(items) == len(all_items)
                           and not studio_mode and not level_n and not reg_results and not reg_plans
                           and not any(ukeys) and not any(frozen)
                           and not any(it.get("overlap") or it.get("gap") for it in run_items)
                           and not any(sg.get("upscale") or sg.get("fr") or sg.get("ar")
                                       or core.is_footage(sg) for sg in proj["segments"][:len(items)])
                           and not (0 < end < sum(it["frames"] for it in run_items)))
    concat_paths = ([store.master_path(d, keys[it["index"]], run_w, run_h) for it in run_items]
                    if concat_eligible else [])
    if concat_eligible and not all(os.path.isfile(p) for p in concat_paths):
        concat_eligible = False
    if export_concat_requested and not concat_eligible:
        log("FFmpeg concat: timeline is not stream-copy safe; using frame-exact H3 assembly")
        notify("warn", msg="FFmpeg concat: есть перекрытия, обработка или несовместимые мастера. Используем точную склейку H3.")
    full_key = hashlib.sha256(("|".join((uk or k) for k, uk in zip(keys[first:], ukeys[first:])) + f"|{images.shape[0]}|{json.dumps(seam, sort_keys=True)}" + (f"|L{level_n}" if level_n else "")
                                + (f"|studio-colour-v3:{studio_cache_prev or 'uncached'}" if studio_mode else "")
                               + "".join(f"|R{r['key']}" + (f"^{r['up']['key']}" if r.get("up") else "") for r in reg_results)
                                + ("|ffmpeg-h264-nvenc-p4-v1" if export_encoder == "nvenc" else "")
                                + ("|noaudio-v1" if (proj.get("run") or {}).get("no_audio") else "")
                                + ("|ffconcat-v1" if concat_eligible else "")).encode()).hexdigest()[:16]
    full_name = f"full_{full_key}.mp4"
    full_path = os.path.join(d, full_name)
    concat_used = bool(concat_eligible and os.path.isfile(full_path))
    if not os.path.isfile(full_path):
        try:
            # Full-resolution export: report actual encoded frames, including on cached-only saves.
            encode_t0 = time.perf_counter()
            notify("phase", seg=max(0, len(items) - 1), phase="export_encode", fd=0, fn=int(images.shape[0]))
            def export_progress(done, total):
                spent = time.perf_counter() - encode_t0
                notify("phase", seg=max(0, len(items) - 1), phase="export_encode", fd=done, fn=total,
                       eta=round(spent * (total - done) / max(1, done), 1))
            log(f"final MP4 encoder: {'FFmpeg h264_nvenc (RTX)' if export_encoder == 'nvenc' else 'CPU libx264'}")
            concat_done = False
            if concat_eligible:
                try:
                    log(f"FFmpeg concat: joining {len(concat_paths)} compatible take masters ({export_encoder})")
                    media.ffmpeg_concat_masters(concat_paths, full_path, fps, int(images.shape[0]),
                                                out_audio["waveform"][0] if out_audio else None,
                                                out_audio["sample_rate"] if out_audio else None,
                                                encoder=export_encoder, progress=export_progress)
                    concat_done = True
                    concat_used = True
                    log("FFmpeg concat: finished; final mixed sound was muxed separately")
                except Exception as concat_error:
                    log(f"FFmpeg concat failed ({concat_error}); falling back to frame-exact H3 MP4 writer")
                    notify("warn", msg=f"FFmpeg concat не сработал ({concat_error}). Используем точную сборку H3.")
            try:
                if not concat_done:
                    # export-only polish: film grain (masks H3 banding at 24 fps) and the CPU x264 preset
                    grain = max(0.0, min(0.02, float(s.get("export_grain") or 0)))
                    preset = s.get("export_preset") if s.get("export_preset") in (
                        "ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow") else "medium"
                    out_images = images
                    if grain > 0:
                        out_images = (images + torch.randn_like(images) * grain).clamp(0, 1)
                        log(f"export: film grain {grain:g}")
                    media.write_mp4(full_path, out_images, fps, out_audio["waveform"][0] if out_audio else None,
                                    out_audio["sample_rate"] if out_audio else None, crf=16, preset=preset,
                                    progress=export_progress, encoder=export_encoder)
            except Exception as nv_error:
                if export_encoder != "nvenc":
                    raise
                log(f"NVENC failed ({nv_error}); falling back to CPU libx264 for a complete file")
                notify("warn", msg=f"NVIDIA NVENC недоступен ({nv_error}). Продолжаем экспорт через CPU.")
                try:
                    os.remove(full_path + ".part")
                except OSError:
                    pass
                notify("phase", seg=max(0, len(items) - 1), phase="export_encode", fd=0, fn=int(images.shape[0]))
                media.write_mp4(full_path, out_images, fps, out_audio["waveform"][0] if out_audio else None,
                                out_audio["sample_rate"] if out_audio else None, crf=16, preset=preset,
                                progress=export_progress, encoder="cpu")
        except Exception as e:
            log(f"full preview mp4 failed: {e}")
            if stream_output:
                raise RuntimeError("Потоковая сборка: не удалось сохранить MP4") from e
    full = {"video": view_ref(sub, full_name), "frames": int(images.shape[0]), "key": full_key,
            "export_colour": bool(studio_mode), "export_encoder": export_encoder,
            "export_concat": bool(export_concat_requested), "export_concat_used": bool(concat_used),
            "export_pipe": bool((proj.get("run") or {}).get("export_pipe")),
            "export_pipe_used": False,
            "count": len(items), "partial": len(items) < len(all_items) or first > 0}
    if os.path.isfile(full_path):
        try:
            from . import h3s_library
            h3s_library.gallery_add(d, h3s_library.final_entry(proj["id"], proj.get("name"), full, results[0].get("poster") if results else None,
                                                               s.get("prompt") or " · ".join(str(sg.get("prompt") or "") for sg in proj["segments"][:len(items)])))
        except Exception as e:
            log(f"gallery: {e}")
    total = time.perf_counter() - t0
    notify("done", elapsed=round(total, 1), full=full, segments=results, audio_source=src_info, regions=reg_results, operation=operation)
    n_gen = len(run_items) - sum(cached[first:])
    log(f"finished in {total:.1f}s: {images.shape[0]} frames ({images.shape[0] / fps:.2f}s) · generated {n_gen}, cached {sum(cached[first:])}"
        + (f", untouched {first}" if first else "")
        + (f" · {total / max(1, todo_steps):.2f} s/step" if todo_steps else "") + (f" · cut at end marker {end}" if 0 < end < sum(x['frames'] for x in items) else "")
        + (" · " + ram() if ram() else ""))
    if out_audio is None:
        out_audio = {"waveform": torch.zeros(1, 2, int(images.shape[0] / fps * 44100)), "sample_rate": 44100}
    try:
        keep_takes()
    except Exception as e:
        log(f"take store: {e}")
    for chain in (seg_frames, seg_v, seg_a, seg_up, out_frames):
        chain.close()  # no need to leave GB-sized temporary frame lists to GC
    if stream_output:
        # Return a valid one-frame IMAGE for ComfyUI output compatibility. The
        # complete video is in full_path / gallery. Drop the mapped full frame
        # tensor before returning; on Windows deletion may wait for GC.
        preview_frame = images[:1].clone()
        del images
        import gc
        gc.collect()
        if not remove_stream_file(stream_file):
            log(f"streaming: временный файл кадров занят — уберём при следующем запуске ({stream_file})")
        images = preview_frame
    return images, out_audio, latent, {"segments": results, "full": full, "keys": keys, "estimate": est,
                                       "audio_source": src_info, "regions": reg_results, "fsigs": fsigs,
                                       "operation": operation, "resume_only": resume_only, "resume_start": first}


def segment_media(d, sub, key, frames, a, audio_vae, audio, proj, it, fps, wave=None, skip_mp4=False):
    name, strip, poster = f"seg_{key}.mp4", f"seg_{key}_tiles.jpg", f"seg_{key}_poster.jpg"
    t_strip = t_poster = t_audio = t_mp4 = 0.0
    try:
        if not os.path.isfile(os.path.join(d, strip)):
            t = time.perf_counter()
            media.write_strip(os.path.join(d, strip), frames)
            t_strip = time.perf_counter() - t
        if not os.path.isfile(os.path.join(d, poster)):
            t = time.perf_counter()
            media.write_poster(os.path.join(d, poster), frames[0])
            t_poster = time.perf_counter() - t
        if not skip_mp4 and not os.path.isfile(os.path.join(d, name)):
            wf = sr = None
            t = time.perf_counter()
            w = wave() if wave is not None else None   # the take's saved wave (no audio-VAE call)
            if w is not None:
                wf, sr = normalize_level(w[0][None])[0], w[1]
            elif audio_vae is not None:
                au = decode_audio(audio_vae, a.to(comfy.model_management.intermediate_device()))
                wf, sr = au["waveform"][0], au["sample_rate"]
            t_audio = time.perf_counter() - t
            t = time.perf_counter()
            # Editor MP4. It used to cap the long edge at 960, so a 768x1344 project played
            # back as 548x960 and looked like a downgrade next to the 4:4:4 take master.
            # write_mp4 only scales down above max_edge, so the project size is kept as is and
            # only oversized projects (long edge > 1344) shrink for the browser player.
            media.write_mp4(os.path.join(d, name), frames, fps, wf, sr, max_edge=1344, crf=22, preset="superfast")
            t_mp4 = time.perf_counter() - t
    except Exception as e:
        log(f"preview media for {key} failed: {e}")
    if t_strip or t_poster or t_audio or t_mp4:
        log(f"  preview breakdown: strip {t_strip:.1f}s; poster {t_poster:.1f}s; "
            f"audio decode/level {t_audio:.1f}s; MP4 encode {t_mp4:.1f}s")
    return {"video": view_ref(sub, name), "strip": view_ref(sub, strip), "poster": view_ref(sub, poster),
            "strip_n": min(media.STRIP_COUNT, int(frames.shape[0])), "strip_v": 2}


def source_audio_info(d, sub, audio):
    """Write a small mono WAV of the connected audio input so the editor can draw its waveform."""
    try:
        sig = audio_signature(audio)
        name = f"source_{sig}.wav"
        path = os.path.join(d, name)
        if not os.path.isfile(path):
            media.write_wav(path, audio["waveform"][0], int(audio["sample_rate"]))
        return {"filename": name, "subfolder": sub, "type": "output",
                "duration": round(audio["waveform"].shape[-1] / audio["sample_rate"], 4)}
    except Exception as e:
        log(f"source audio preview failed: {e}")
        return None


def full_audio(audio_vae, tl_audio, lat_a, n_frames, fps, seg_a=None, items=None, seam=None, wave=None):
    """Audio of the stitched video. With `seam` (not the locked soundtrack mode) every segment is decoded on its own
    and joined by stitch_audio (crossfade + loudness match); otherwise the concatenated latent is decoded."""
    if audio_vae is not None and seam is not None and seg_a and len(seg_a) > 1:
        try:
            dev = comfy.model_management.intermediate_device()
            ws = [wave(j) for j in range(len(seg_a))] if wave is not None else []
            if ws and all(w is not None for w in ws) and len({w[1] for w in ws}) == 1:
                waves, sr = [w[0] for w in ws], ws[0][1]   # saved take audio: no audio-VAE decode
            else:
                waves = [decode_audio(audio_vae, a.to(dev), normalize=False)["waveform"][0].cpu() for a in seg_a]
                sr = audio_out_rate(audio_vae)
            sinfo = []
            wf, gains = stitch_audio(waves, sr, items, fps, seam["xfade"], seam["match"], skip=seam.get("skip"), info=sinfo,
                                     declick=seam.get("declick", True))
            for si in sinfo:
                if si["mode"] == "declick":
                    vlog(f"  audio de-click (5 ms taper) at hard cuts: {si['at_s']} s")
                    continue
                vlog(f"  audio seam {si['seam']}->{si['seam'] + 1}: " + (f"kept sound, sample-exact splice at {si['at_s']}s, grid offset {si['lag_ms']} ms"
                     + (f" removed at {si['drift_fix_s']}s" if si.get('drift_fix_s') else "") + f" (corr {si['corr']})" if si["mode"] == "splice"
                     else f"different sound (corr {si['corr']}), crossfade {si['xfade_s']}s"))
            if any(abs(g - 1.0) > 1e-3 for g in gains):
                log("audio seams: loudness match gains " + ", ".join(f"{g:.2f}" for g in gains[1:]))
            for dp in seam_dips(wf, sr, items, fps):
                log(f"  WARNING: audio level hole of {dp['len_ms']} ms at {dp['at_s']}s near seam {dp['seam']}->{dp['seam'] + 1} "
                    f"(in the generated segment audio; segments made before this fix keep it — «Ещё дубль» regenerates)")
            return {"waveform": normalize_level(wf[None]), "sample_rate": sr}
        except Exception as e:
            log(f"audio seam stitch failed ({e}); plain decode")
    if audio_vae is not None and seam is not None and wave is not None and seg_a and len(seg_a) == 1:
        w = wave(0)
        if w is not None:
            return {"waveform": normalize_level(w[0][None]), "sample_rate": w[1]}
    if audio_vae is not None:
        try:
            return decode_audio(audio_vae, lat_a.to(comfy.model_management.intermediate_device()))
        except Exception as e:
            log(f"audio decode failed: {e}")
    if tl_audio is not None:
        sr = tl_audio["sample_rate"]
        n = int(n_frames / fps * sr)
        wf = tl_audio["waveform"][:1, :, :n]
        if wf.shape[-1] < n:
            wf = torch.nn.functional.pad(wf, (0, n - wf.shape[-1]))
        return {"waveform": wf, "sample_rate": sr}
    return None

