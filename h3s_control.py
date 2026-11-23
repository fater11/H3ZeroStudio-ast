"""H3ZeroStudio Lab v6k — ControlNet track (MiniMax H3 Fun ControlNet Union 2.0) and its preprocessors.

The Lab samples directly (no ComfyUI graph), so the native ComfyUI core pieces are called as Python classes:
  * patch      — comfy_extras.nodes_model_patch.ModelPatchLoader + nodes_minimax_h3.MiniMaxH3FunControlNetApply
  * «Поза»     — RT-DETR (nodes_rtdetr.RTDETR_detect) → SDPose (nodes_sdpose.SDPoseKeypointExtractor / DrawKeypoints)
  * «Глубина»  — Depth Anything 3 (nodes_depth_anything_3: LoadDA3Model / DA3Inference mono / DA3Render v2_style)
  * «Canny»    — nodes_canny.Canny (kornia)
  * «Серый»    — luminance (BT.709), «Готовый контроль» — the clip as it is (already a pose / depth / edge video)
A processed control video is cached per (source file, mode, mode params) as a 24 fps mp4 beside the project's
thumbnails; the original file is never touched. The timeline / player show the processed file.
"""
import hashlib
import os
import threading
import time
import traceback

import numpy as np
import torch

from . import h3s_core as core
from . import h3s_media as media

VER = "ctl1"
PATCH_NAMES = ("minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors",
               "minimax_h3_fun_controlnet_union_2.0_pruned_bf16.safetensors",
               "minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors")   # v1 (also native) as a last resort
DA3_NAMES = {"small": "depth_anything_3_small.safetensors", "base": "depth_anything_3_base.safetensors"}
SDPOSE_NAME = "sdpose_wholebody_fp16.safetensors"
RTDETR_NAME = "rt_detr_v4-x-hgnet_fp16.safetensors"
MAX_SIDE = 1024        # processing / preview size (the patch resizes to the canvas itself)
CHUNK = 16


def _find(folder, name):
    try:
        from . import h3s_models_dl as dl
        return dl.find_installed(folder, [name])
    except Exception:
        return None


_CHECKED = {}   # (path, size, mtime) -> "" (ok) / why


def _catalog_size(name):
    try:
        from . import h3s_models_dl as dl
        for e in getattr(dl, "MANIFEST", None) or []:
            if str(e.get("filename", "")).lower() == name.lower():
                return int(e.get("size_bytes") or 0) or None
    except Exception:
        pass
    return None


def check_patch(path):
    """"" when the file is a complete safetensors file, else why not: "part" (a .part / .tmp beside it: still
    downloading), "size" (smaller than the catalog size), "header" (header unreadable / truncated data).
    A partial file is never loaded."""
    try:
        st = os.stat(path)
    except OSError:
        return "missing"
    key = (path, st.st_size, int(st.st_mtime))
    if key in _CHECKED:
        return _CHECKED[key]
    why = ""
    if any(os.path.exists(path + suf) for suf in (".part", ".tmp", ".download", ".crdownload")) or path.lower().endswith((".part", ".tmp")):
        why = "part"
    if not why:
        exp = _catalog_size(os.path.basename(path))
        if exp and st.st_size < exp:
            why = "size"
    if not why:
        try:
            import json
            import struct
            with open(path, "rb") as f:
                n = struct.unpack("<Q", f.read(8))[0]
                if n <= 2 or n > 200 * 1024 * 1024 or 8 + n > st.st_size:
                    raise ValueError("header length")
                hdr = json.loads(f.read(n).decode("utf-8"))
            end = max([int(v["data_offsets"][1]) for k, v in hdr.items() if k != "__metadata__" and isinstance(v, dict)] or [0])
            if not end or 8 + n + end > st.st_size:
                raise ValueError("truncated")
        except Exception:
            why = "header"
    _CHECKED[key] = why
    return why


def patch_info():
    """The control patch to use: {"name", "path", "v1", "fallback": bool (a 2.0 patch is wanted but missing / broken),
    "bad": [{"file", "why"}] (installed but incomplete - skipped)}. name None = no usable patch."""
    out = {"name": None, "path": None, "v1": False, "fallback": False, "bad": []}
    for n in PATCH_NAMES:
        p = _find("model_patches", n)
        if not p:
            continue
        why = check_patch(p)
        if why:
            out["bad"].append({"file": os.path.basename(p), "why": why})
            continue
        out["name"], out["path"] = os.path.basename(p), p
        break
    out["v1"] = bool(out["name"] and "2.0" not in out["name"])
    out["fallback"] = out["v1"]
    return out


def patch_file():
    """(file name under model_patches, full path) of the first installed, complete control patch, or (None, None)."""
    i = patch_info()
    return i["name"], i["path"]


def need_models(mode, params=None):
    """[(folder, file)] a mode's preprocessor needs."""
    params = core.normalize_control_params(params)
    if mode == "depth":
        return [("geometry_estimation", DA3_NAMES[params["depth_model"]])]
    if mode == "pose":
        return [("checkpoints", SDPOSE_NAME), ("diffusion_models", RTDETR_NAME)]
    return []


def status():
    """What is installed (Settings / track head / preflight)."""
    pi = patch_info()
    pn = pi["name"]
    out = {"patch": pn, "patch_v1": pi["v1"], "patch_fallback": pi["fallback"], "patch_bad": pi["bad"], "modes": {}}
    for m in core.CONTROL_MODES:
        miss = [f for (fo, f) in need_models(m) if not _find(fo, f)]
        out["modes"][m] = {"ok": not miss, "missing": miss}
    out["modes"]["depth_base"] = {"ok": bool(_find("geometry_estimation", DA3_NAMES["base"])), "missing": []}
    return out


# ---------------------------------------------------------------- preprocessors (native ComfyUI classes)
_LOCK = threading.RLock()   # preprocessor models live in h3s_memory.HOT ("pre:…") only while a video is processed


def _out(r):
    """io.NodeOutput / tuple → first value."""
    if hasattr(r, "result"):
        r = r.result
    return r[0] if isinstance(r, (tuple, list)) else r


def _da3(name):
    from . import h3s_memory as mem
    with _LOCK:
        key = "pre:da3:" + name
        if mem.get(key) is None:
            from comfy_extras.nodes_depth_anything_3 import LoadDA3Model
            mem.hold(key, _out(LoadDA3Model.execute(name, "default")), f"Depth Anything 3 ({name})")
        return mem.get(key)


def _pose_models():
    from . import h3s_memory as mem
    with _LOCK:
        if mem.get("pre:pose") is None:
            import comfy.sd
            import folder_paths
            ck = comfy.sd.load_checkpoint_guess_config(folder_paths.get_full_path_or_raise("checkpoints", SDPOSE_NAME),
                                                       output_vae=True, output_clip=False,
                                                       embedding_directory=folder_paths.get_folder_paths("embeddings"))
            det = comfy.sd.load_diffusion_model(folder_paths.get_full_path_or_raise("diffusion_models", RTDETR_NAME))
            mem.hold("pre:pose", (ck[0], ck[2], det), "SDPose + RT-DETR")
        return mem.get("pre:pose")


def release():
    """v6m: preprocessors off the GPU (right after a control video is written; the video stays on disk)."""
    from . import h3s_memory as mem
    with _LOCK:
        for k in [k for k in list(mem.HOT) if k.startswith("pre:")]:
            mem.release(k, {"pre:pose": "SDPose + RT-DETR"}.get(k, "Depth Anything 3" if k.startswith("pre:da3") else k))


def release_patch():
    """v6m: the ControlNet patch off the GPU (a run without control clips)."""
    from . import h3s_memory as mem
    with _LOCK:
        for k in [k for k in list(mem.HOT) if k.startswith("cn_patch:")]:
            mem.release(k, "ControlNet patch " + k.split(":", 1)[1])


def gray(frames):
    y = frames[..., 0] * 0.2126 + frames[..., 1] * 0.7152 + frames[..., 2] * 0.0722
    return y.unsqueeze(-1).expand(*y.shape, 3).contiguous()


def preprocess(frames, mode, params=None):
    """IMAGE [F,H,W,3] 0..1 → control frames of the same size."""
    params = core.normalize_control_params(params)
    if mode == "ready":
        return frames
    if mode == "gray":
        return gray(frames)
    if mode == "canny":
        from comfy_extras.nodes_canny import Canny
        return _out(Canny.execute(frames, params["canny_lo"], params["canny_hi"])).float().cpu()
    if mode == "depth":
        from comfy_extras.nodes_depth_anything_3 import DA3Inference, DA3Render
        geo = _out(DA3Inference.execute(_da3(DA3_NAMES[params["depth_model"]]), frames, 504, "upper_bound_resize", {"mode": "mono"}))
        return _out(DA3Render.execute(geo, {"output": "depth", "normalization": "v2_style", "apply_sky_clip": False})).float().cpu()
    if mode == "pose":
        from comfy_extras.nodes_rtdetr import RTDETR_detect
        from comfy_extras.nodes_sdpose import SDPoseKeypointExtractor, SDPoseDrawKeypoints
        model, vae, det = _pose_models()
        boxes = _out(RTDETR_detect.execute(det, frames, 0.4, "person", 8))
        kp = _out(SDPoseKeypointExtractor.execute(model, vae, frames, 16, boxes))
        return _out(SDPoseDrawKeypoints.execute(kp, True, params["pose_hands"], params["pose_face"], False, 4, 3, 0.3, True)).float().cpu()
    raise ValueError(f"unknown control mode {mode!r}")


# ---------------------------------------------------------------- processed control video (cache + jobs)
def processed_name(src_path, mode, params):
    from . import h3s_gen as gen
    pk = core.control_params_key(mode, core.normalize_control_params(params))
    tag = hashlib.sha256(f"{VER}|{os.path.abspath(src_path)}|{gen.file_sig(src_path)}|{mode}|{pk}".encode()).hexdigest()[:16]
    return f"ctl_{mode}_{tag}.mp4"


def processed_dir(src_path):
    import folder_paths
    from . import h3s_projfiles as pf
    pid = pf.project_of(src_path)
    sub = pf.sub_of(pid, "control") if pid else pf.ROOT + "/_control"
    return sub, os.path.join(folder_paths.get_output_directory(), *sub.split("/"))


def processed_ref(src_path, mode, params):
    """(view ref, path, exists) of the processed control video."""
    if mode == "ready":
        return None, src_path, True
    sub, d = processed_dir(src_path)
    name = processed_name(src_path, mode, params)
    p = os.path.join(d, name)
    return {"filename": name, "subfolder": sub, "type": "output"}, p, os.path.isfile(p)


def _iter_frames(path, fps=core.FPS, max_side=MAX_SIDE):
    """The file on the 24 fps timeline (nearest earlier source frame), downsized to max_side, uint8 chunks."""
    import av
    with av.open(path) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        dur = float(st.duration * st.time_base) if st.duration else float(c.duration or 0) / 1e6
        n = max(1, int(round(dur * fps))) if dur > 0 else None
        want, last, buf = 0, None, []
        for fr in c.decode(st):
            t = float(fr.pts * st.time_base) if fr.pts is not None else want / fps
            while last is not None and want / fps < t - 1e-6 and (n is None or want < n):
                buf.append(last); want += 1
                if len(buf) >= CHUNK:
                    yield np.stack(buf), n; buf = []
            arr = fr.to_ndarray(format="rgb24")
            h, w = arr.shape[:2]
            s = min(1.0, max_side / max(h, w))
            if s < 1.0:
                from PIL import Image
                arr = np.asarray(Image.fromarray(arr).resize((max(2, int(w * s) // 2 * 2), max(2, int(h * s) // 2 * 2)), Image.BILINEAR))
            last = arr
        while last is not None and (n is None or want < n):
            buf.append(last); want += 1
            if n is None:
                break
            if len(buf) >= CHUNK:
                yield np.stack(buf), n; buf = []
        if buf:
            yield np.stack(buf), n


def build_processed(src_path, mode, params, progress=None, cancel=None):
    """Write the processed 24 fps control video; returns its path (cached: an existing file is reused)."""
    ref, out, ok = processed_ref(src_path, mode, params)
    if ok:
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        return _write_processed(src_path, mode, params, out, progress, cancel)
    finally:
        release()   # v6m memory policy: preprocessors only while a video is made


def _write_processed(src_path, mode, params, out, progress=None, cancel=None):
    import av
    tmp = out + ".part.mp4"
    done = 0
    with av.open(tmp, mode="w") as cont:
        vs = None
        for chunk, n in _iter_frames(src_path):
            if cancel and cancel():
                raise InterruptedError("cancelled")
            fr = torch.from_numpy(chunk).float().div_(255.0)
            pr = preprocess(fr, mode, params).clamp(0, 1)
            u8 = (pr * 255.0 + 0.5).to(torch.uint8).numpy()
            if vs is None:
                h, w = u8.shape[1] // 2 * 2, u8.shape[2] // 2 * 2
                vs = media.video_stream(cont, w, h, core.FPS, {"crf": "16", "preset": "veryfast"})
            for a in u8:
                for pk in vs.encode(media.video_frame(np.ascontiguousarray(a[:vs.height, :vs.width]))):
                    cont.mux(pk)
            done += len(u8)
            if progress:
                progress(done, n or done)
        if vs is not None:
            for pk in vs.encode():
                cont.mux(pk)
    if not done:
        os.remove(tmp)
        raise ValueError(f"no frames in {os.path.basename(src_path)}")
    media.replace_file(tmp, out)
    return out


JOBS = {}
_JLOCK = threading.Lock()
_RUN = threading.Lock()   # one preprocessing at a time (VRAM)


def job_key(src_path, mode, params):
    return processed_name(src_path, mode, params)


def start_job(src_path, mode, params):
    """Background preprocessing for the timeline preview; returns the job state."""
    key = job_key(src_path, mode, params)
    ref, out, ok = processed_ref(src_path, mode, params)
    with _JLOCK:
        j = JOBS.get(key)
        if ok:
            j = JOBS[key] = {"key": key, "state": "done", "done": 1, "total": 1, "ref": ref, "error": None}
            return dict(j)
        if j and j["state"] in ("queued", "running"):
            return dict(j)
        j = JOBS[key] = {"key": key, "state": "queued", "done": 0, "total": 0, "ref": None, "error": None, "t0": time.time()}

    def run():
        with _RUN:
            j["state"] = "running"
            try:
                build_processed(src_path, mode, params, progress=lambda d, n: j.update(done=d, total=n))
                j.update(state="done", ref=processed_ref(src_path, mode, params)[0])
            except Exception as e:
                traceback.print_exc()
                j.update(state="error", error=str(e))
    threading.Thread(target=run, daemon=True, name="h3lab-control").start()
    return dict(j)


def job_state(key):
    with _JLOCK:
        j = JOBS.get(key)
        return dict(j) if j else None


# ---------------------------------------------------------------- sampling: the patch on the model
_FALLBACK_WARNED = set()


class ControlPatchMissing(RuntimeError):
    """No usable ControlNet patch while control clips guide a segment: the run stops with this message."""


def missing_message(bad=()):
    if bad:
        return ("ControlNet: нет готовой модели MiniMax H3 Fun ControlNet Union — генерация с дорожкой ControlNet остановлена. "
                f"Недокачанные файлы не загружаются: {', '.join(b['file'] for b in bad)}. Скачайте модель в «Настройки → Модели» или выключите дорожку ControlNet.")
    return ("ControlNet: нет готовой модели MiniMax H3 Fun ControlNet Union — генерация с дорожкой ControlNet остановлена. "
            "Скачайте модель в «Настройки → Модели» или выключите дорожку ControlNet.")


def load_patch():
    """The ControlNet patch for this run, kept hot between runs that use it (h3s_memory.HOT "cn_patch:<name>")."""
    from . import h3s_memory as mem
    name, path = patch_file()
    if not name:
        return None, None
    with _LOCK:
        key = "cn_patch:" + name
        if mem.get(key) is None:
            release_patch()   # another patch file: only one at a time
            from comfy_extras.nodes_model_patch import ModelPatchLoader
            mem.hold(key, _out(ModelPatchLoader().load_model_patch(name)), "ControlNet patch " + name)
        return name, mem.get(key)


def segment_control_frames(project, it, asset_path_fn):
    """Control frames [frames, H, W, 3] for one segment (time-aligned, held at the ends), or (None, cw)."""
    cw = core.control_window(project, it)
    if not cw:
        return None, None
    a = next((x for x in project["assets"] if x["id"] == cw["asset"]), None)
    if not a:
        return None, cw
    src = asset_path_fn(a)
    path = build_processed(src, cw["mode"], cw["params"]) if cw["mode"] != "ready" else src
    idx = [core.control_frame_index(cw, k) for k in range(it["frames"])]
    lo, hi = min(idx), max(idx)
    info = media.video_info(path)
    lo = min(lo, max(0, int(info["frames"]) - 1))
    h, w = int(info["height"]), int(info["width"])
    s = min(1.0, MAX_SIDE / max(h, w))
    w2, h2 = max(16, int(w * s) // 2 * 2), max(16, int(h * s) // 2 * 2)
    fr = media.load_video_frames(path, lo, hi - lo + 1, w2, h2, fps=core.FPS, mode="stretch")
    sel = np.stack([fr[min(len(fr) - 1, k - lo)] for k in idx])
    return torch.from_numpy(sel), cw


def apply(model, vae, project, it, log=print, warn=None, asset_path_fn=None):
    """The model with the control patch for this segment (unchanged when no control clip lies under it).
    Returns (model, info) — info: None (no control) / {"ok": bool, ...} for the take and the log."""
    cw = core.control_window(project, it)
    if not cw:
        return model, None
    name, patch = load_patch()
    if patch is None:
        raise ControlPatchMissing(missing_message(patch_info()["bad"]))
    if name not in _FALLBACK_WARNED and "2.0" not in name:
        _FALLBACK_WARNED.add(name)
        bad = patch_info()["bad"]
        msg = (f"ControlNet: Union 2.0 недокачан ({', '.join(b['file'] for b in bad)}) — используется запасная модель v1 ({name}). Скачайте 2.0 в «Настройки → Модели»."
               if bad else f"ControlNet: Union 2.0 не скачан — используется запасная модель v1 ({name}). Скачайте 2.0 в «Настройки → Модели».")
        log(msg)
        if warn:
            warn(msg)
    try:
        frames, cw = segment_control_frames(project, it, asset_path_fn)
    except Exception as e:
        msg = f"ControlNet: не удалось подготовить контроль «{cw['mode']}» ({e}) — отрезок создан без контроля."
        log(msg)
        if warn:
            warn(msg)
        return model, {"ok": False, "why": "preprocess", "mode": cw["mode"], "error": str(e)}
    from comfy_extras.nodes_minimax_h3 import MiniMaxH3FunControlNetApply
    m = _out(MiniMaxH3FunControlNetApply.execute(model, patch, vae, float(cw["strength"]), float(cw["start"]), float(cw["end"]), control_video=frames))
    try:
        m.h3zs_cn = True   # v6m «Экономия памяти» auto: the pass is guided by ControlNet
    except Exception:
        pass
    log(f"  ControlNet {cw['mode']} ({name}): strength {cw['strength']} range {cw['start']:.2f}-{cw['end']:.2f}, "
        f"{frames.shape[0]} frames {frames.shape[2]}x{frames.shape[1]} from the control clip (offset {cw['rel']:+.2f}s)")
    return m, {"ok": True, "mode": cw["mode"], "strength": cw["strength"], "patch": name}
