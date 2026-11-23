"""H3ZeroStudio memory policy (v6m): one place that decides what stays on the GPU.

Policy (documented in v6m_stage_notes.md):
- Keep hot only what the current run needs. At run start the run's needs are known (base models / encoders /
  VAEs per clip preset — h3s_models.ModelResolver evicts the rest; the ControlNet patch only when a clip is under
  a control clip). Consecutive runs with the same setup reload nothing.
- Preprocessors (Depth Anything 3, SDPose + RT-DETR) are loaded for one control video and released right after
  it is written; the processed video stays on disk (input/h3lab_control/), so later runs never load them.
  YuNet (faces) is a CPU OpenCV object made per call. The assistant LLM is unloaded by h3s_vram before a run.
- No module-level dict keeps a ModelPatcher alive outside this registry (HOT): everything held between runs is
  listed here and released through release().
- Every load / unload is logged briefly: "[H3ZS] loaded: …" / "[H3ZS] unloaded: …".

«Экономия памяти» (settings.memsave): chunked feed-forward of the H3 DiT blocks. Each block's MLP
(fc1 → SwiGLU → fc2) is evaluated in N slices along the token axis when the sequence is long, so the 2×ffn-wide
intermediate exists for 1/N of the tokens at a time. The idea (token-axis FFN chunking) follows the
"MiniMax H3 Chunk FeedForward (Advanced EX)" node of minimax-h3-audio-T8 (GPL-3.0-or-later, same licence as this
pack); this implementation is our own. Row-wise ops: the result equals the unchunked one (allclose)."""
from __future__ import annotations

import gc
import threading
from types import MethodType

LOG = "[H3ZS]"
_LOCK = threading.RLock()
HOT = {}   # purpose -> object kept between runs (ModelPatcher or a tuple of them); see release()

MODES = ("off", "auto", "on")
DEFAULT = {"mode": "auto", "chunks": 2, "threshold": 4096}


def log(msg):
    print(f"{LOG} {msg}")
    try:
        from . import h3s_monitor
        h3s_monitor.record_log(f"{LOG} {msg}")
    except Exception:
        pass


def normalize(v):
    """settings.memsave → {mode off|auto|on, chunks 1..16, threshold 256..262144} (h3s_core.normalize_memsave)."""
    from . import h3s_core
    return h3s_core.normalize_memsave(v)


# ---------------------------------------------------------------- chunked feed-forward
def chunked_ffn(chunks, threshold):
    """forward(self, x) for an H3 MLP: slices along the token axis (dim -2) when it is longer than `threshold`."""
    def forward(self, x):
        import comfy.ops
        n = int(x.shape[-2]) if x.ndim >= 2 else 0
        if chunks <= 1 or n <= threshold:
            return comfy.ops.linear_input_act(self.fc2, self.fc1(x), "swiglu")
        out = None
        k = 0
        for part in x.split(-(-n // chunks), dim=-2):
            y = comfy.ops.linear_input_act(self.fc2, self.fc1(part), "swiglu")
            if out is None:
                out = y.new_empty((*y.shape[:-2], n, y.shape[-1]))
            out[..., k:k + part.shape[-2], :] = y
            k += part.shape[-2]
            del y
        return out
    forward._h3zs_ffn = (int(chunks), int(threshold))
    return forward


def _mlp_blocks(m):
    try:
        dm = m.get_model_object("diffusion_model")
    except Exception:
        dm = getattr(getattr(m, "model", None), "diffusion_model", None)
    blocks = getattr(dm, "blocks", None)
    if not blocks:
        return []
    return [(i, b.mlp) for i, b in enumerate(blocks) if hasattr(getattr(b, "mlp", None), "fc1") and hasattr(b.mlp, "fc2")]


def wants_ffn(cfg, cn=False, tokens=0, vram_gib=None):
    """Auto: save activations on smaller GPUs; keep the fast full-width MLP on 22+ GiB.

    A controlled 8-step H3 test on RTX 3090 measured chunking 6% slower and
    different final latents. ControlNet and extremely long sequences may still
    need chunking on a 24 GiB card. Explicit "on"/"off" always win.
    """
    cfg = normalize(cfg)
    if cfg["mode"] == "off" or cfg["chunks"] <= 1:
        return False
    if cfg["mode"] == "on":
        return True
    if not cn and vram_gib is not None and float(vram_gib) >= 22.0 and int(tokens or 0) <= 131072:
        return False
    return bool(cn) or int(tokens or 0) > 2 * cfg["threshold"]


def _total_vram_gib(m):
    try:
        import comfy.model_management as mm
        device = getattr(m, "load_device", None) or mm.get_torch_device()
        if getattr(device, "type", None) != "cuda":
            return None
        return float(mm.get_total_memory(device)) / (1024 ** 3)
    except Exception:
        return None


def apply_ffn(m, cfg, cn=False, tokens=0):
    """A clone of the ModelPatcher m with the chunked MLP forward on every block (m itself unchanged), or m.
    Object patches are applied by ComfyUI when the model is loaded and undone when it is unpatched."""
    if m is None or not wants_ffn(cfg, cn, tokens, vram_gib=_total_vram_gib(m)):
        return m
    cfg = normalize(cfg)
    blocks = _mlp_blocks(m)
    if not blocks:
        return m
    patches = getattr(m, "object_patches", {}) or {}
    if any(getattr(v, "_h3zs_ffn", None) or getattr(getattr(v, "__func__", None), "_h3zs_ffn", None) for v in patches.values()):
        return m   # already installed (another layer of the run)
    fwd = chunked_ffn(cfg["chunks"], cfg["threshold"])
    mc = m.clone()
    for i, mlp in blocks:
        mc.add_object_patch(f"diffusion_model.blocks.{i}.mlp.forward", MethodType(fwd, mlp))
    return mc


# ---------------------------------------------------------------- hot set
def _patchers(obj):
    out = []
    for o in obj if isinstance(obj, (tuple, list)) else (obj,):
        p = getattr(o, "patcher", o)
        if p is not None and hasattr(p, "model"):
            out.append(p)
    return out


def unload_patchers(objs, what):
    """Take these ModelPatchers (and their clones) off the GPU; memory returned to the driver."""
    import comfy.model_management as mm
    n = 0
    for p in _patchers(objs):
        try:
            if hasattr(mm, "unload_model_and_clones"):
                mm.unload_model_and_clones(p)
            else:
                for lm in list(mm.current_loaded_models):
                    if lm.model is p or getattr(lm.model, "model", None) is getattr(p, "model", 0):
                        lm.model_unload()
                        mm.current_loaded_models.remove(lm)
            n += 1
        except Exception as e:
            log(f"unload of {what} failed ({e})")
    gc.collect()
    try:
        mm.cleanup_models_gc()
    except Exception:
        pass
    try:
        mm.soft_empty_cache()
    except Exception:
        pass
    log(f"unloaded: {what}")
    return n


def hold(purpose, obj, what=None):
    with _LOCK:
        if purpose in HOT and HOT[purpose] is not obj:
            release(purpose)
        HOT[purpose] = obj
    log(f"loaded: {what or purpose}")
    return obj


def get(purpose):
    with _LOCK:
        return HOT.get(purpose)


def release(purpose, what=None):
    with _LOCK:
        obj = HOT.pop(purpose, None)
    if obj is None:
        return False
    unload_patchers(obj, what or purpose)
    del obj
    return True


def reconcile(needed):
    """Run start: release everything held that this run does not need (keeps the rest hot: no reload churn)."""
    with _LOCK:
        gone = [k for k in HOT if k not in set(needed)]
    for k in gone:
        release(k)
    return gone

# ---------------------------------------------------------------- per-scene / per-stage temporary memory
def runtime_snapshot():
    """CUDA allocator and driver memory (GiB); never loads or unloads a model."""
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        free, total = torch.cuda.mem_get_info()
        return {
            "allocated": torch.cuda.memory_allocated() / 2 ** 30,
            "reserved": torch.cuda.memory_reserved() / 2 ** 30,
            "free": free / 2 ** 30,
            "total": total / 2 ** 30,
        }
    except Exception:
        return None


def cleanup_runtime(stage=""):
    """Release *temporary* runtime buffers between complete sampler calls.

    Keep ComfyUI's loaded models, LoRA patchers, model options and attention hooks.
    Never run this during an active model step. In dynamic-VRAM mode we also
    drain weight-prefetch queues and cast buffers, as ComfyUI does between nodes.
    """
    try:
        import comfy
        import comfy.model_management as mm
    except ImportError:
        return None
    dynamic = bool(getattr(getattr(comfy, "memory_management", None), "aimdo_enabled", False))
    if dynamic:
        try:
            import comfy.model_prefetch as prefetch
            prefetch.cleanup_prefetch_queues()
        except (ImportError, AttributeError):
            pass
        except Exception as exc:
            log(f"  memory prefetch cleanup skipped ({exc})")
        if hasattr(mm, "reset_cast_buffers"):
            try:
                mm.reset_cast_buffers()
            except Exception as exc:
                log(f"  memory cast-buffer cleanup skipped ({exc})")
        try:
            from comfy_aimdo import model_vbar
            model_vbar.vbars_reset_watermark_limits()
        except (ImportError, AttributeError):
            pass
        except Exception as exc:
            log(f"  memory watermark cleanup skipped ({exc})")
    gc.collect()
    try:
        mm.soft_empty_cache(True)
    except TypeError:
        try:
            mm.soft_empty_cache()
        except Exception as exc:
            log(f"  memory cache cleanup skipped ({exc})")
    except Exception as exc:
        log(f"  memory cache cleanup skipped ({exc})")
    snap = runtime_snapshot()
    if stage and snap is not None:
        log(f"  memory boundary {stage}: CUDA allocated {snap['allocated']:.2f}, "
            f"reserved {snap['reserved']:.2f}, driver free {snap['free']:.2f}/{snap['total']:.2f} GiB")
    return snap
