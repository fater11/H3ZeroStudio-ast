import os
import threading
import time
from collections import deque

_LOCK = threading.Lock()
_LOGS = deque(maxlen=500)
_SEQ = 0
_NVML = None
_NVML_HANDLE = None
_NVML_FAILED = False
_METRICS_LOCK = threading.Lock()
_METRICS_CACHED = None
_METRICS_CACHED_AT = 0.0
_METRICS_TTL_S = 4.0


def record_log(text):
    global _SEQ
    line = str(text).replace("\x00", "")[:8000]
    with _LOCK:
        _SEQ += 1
        _LOGS.append({"seq": _SEQ, "t": time.time(), "text": line})
        return _SEQ


def logs(after=0):
    try:
        after = max(0, int(after))
    except (TypeError, ValueError):
        after = 0
    with _LOCK:
        return [dict(item) for item in _LOGS if item["seq"] > after], _SEQ


def _active_cuda_index():
    """Use ComfyUI's selected compute device, not an assumed CUDA:0."""
    try:
        import comfy.model_management as mm
        device = mm.get_torch_device()
        if getattr(device, "type", None) == "cuda":
            return 0 if device.index is None else int(device.index)
    except Exception:
        pass
    try:
        import torch
        return int(torch.cuda.current_device()) if torch.cuda.is_available() else None
    except Exception:
        return None


def _nvml_handle():
    global _NVML, _NVML_HANDLE, _NVML_FAILED
    if _NVML_FAILED:
        return None, None
    index = _active_cuda_index()
    if index is None:
        return None, None
    try:
        import pynvml
        if _NVML is None:
            pynvml.nvmlInit()
            _NVML = pynvml
        # CUDA_VISIBLE_DEVICES remaps logical CUDA indices. Resolve UUID when
        # exposed by PyTorch; otherwise use the visibility map for numeric IDs.
        handle = None
        try:
            import torch
            props = torch.cuda.get_device_properties(index)
            uuid = getattr(props, "uuid", None)
            if uuid:
                handle = pynvml.nvmlDeviceGetHandleByUUID(str(uuid).encode())
        except Exception:
            pass
        if handle is None:
            visible = [x.strip() for x in os.environ.get("CUDA_VISIBLE_DEVICES", "").split(",") if x.strip()]
            if visible:
                physical = visible[index]
                if physical.isdecimal():
                    handle = pynvml.nvmlDeviceGetHandleByIndex(int(physical))
                elif physical.startswith("GPU-"):
                    handle = pynvml.nvmlDeviceGetHandleByUUID(physical.encode())
            else:
                handle = pynvml.nvmlDeviceGetHandleByIndex(index)
        _NVML_HANDLE = handle
        return _NVML, handle
    except Exception:
        # NVML may be unavailable (or MIG mappings may be ambiguous).
        # Fall back to PyTorch rather than reporting another GPU's statistics.
        return None, None


def _torch_gpu():
    try:
        import torch
        index = _active_cuda_index()
        if index is None:
            return {"available": False}
        with torch.cuda.device(index):
            free, total = torch.cuda.mem_get_info(index)
        used = max(0, total - free)
        return {
            "available": True,
            "name": torch.cuda.get_device_name(index),
            "vram_used": used,
            "vram_total": total,
            "vram_percent": round(used / total * 100, 1) if total else None,
            "cuda": torch.version.cuda,
            "device_index": index,
        }
    except Exception:
        return {"available": False}


def _gpu_metrics():
    nvml, handle = _nvml_handle()
    if nvml is None:
        return _torch_gpu()
    gpu = {"available": True}
    try:
        name = nvml.nvmlDeviceGetName(handle)
        gpu["name"] = name.decode("utf-8", "replace") if isinstance(name, bytes) else str(name)
    except Exception:
        pass
    try:
        gpu["percent"] = float(nvml.nvmlDeviceGetUtilizationRates(handle).gpu)
    except Exception:
        pass
    try:
        mem = nvml.nvmlDeviceGetMemoryInfo(handle)
        gpu["vram_used"] = int(mem.used)
        gpu["vram_total"] = int(mem.total)
        gpu["vram_percent"] = round(mem.used / mem.total * 100, 1) if mem.total else None
    except Exception:
        pass
    try:
        gpu["temperature"] = float(nvml.nvmlDeviceGetTemperature(handle, nvml.NVML_TEMPERATURE_GPU))
    except Exception:
        pass
    try:
        gpu["fan"] = float(nvml.nvmlDeviceGetFanSpeed(handle))
    except Exception:
        pass
    try:
        driver = nvml.nvmlSystemGetDriverVersion()
        gpu["driver"] = driver.decode("utf-8", "replace") if isinstance(driver, bytes) else str(driver)
    except Exception:
        pass
    try:
        import torch
        gpu["cuda"] = torch.version.cuda
    except Exception:
        pass
    return gpu


def metrics():
    cpu = {"cores": os.cpu_count()}
    ram = {}
    try:
        import psutil
        cpu["percent"] = float(psutil.cpu_percent(interval=None))
        freq = psutil.cpu_freq()
        if freq:
            cpu["mhz"] = round(float(freq.current))
        cpu["physical_cores"] = psutil.cpu_count(logical=False)
        mem = psutil.virtual_memory()
        ram = {"used": int(mem.used), "total": int(mem.total), "percent": float(mem.percent)}
        cpu["process_ram"] = int(psutil.Process().memory_info().rss)
    except Exception:
        pass
    return {"cpu": cpu, "ram": ram, "gpu": _gpu_metrics()}


def _cached_metrics():
    """Avoid querying CUDA/NVML on every UI poll during an H3 sampling step.

    Logs are still delivered on every request; only hardware statistics have
    a short TTL. This also coalesces concurrent monitor requests.
    """
    global _METRICS_CACHED, _METRICS_CACHED_AT
    now = time.monotonic()
    with _METRICS_LOCK:
        if _METRICS_CACHED is None or now - _METRICS_CACHED_AT >= _METRICS_TTL_S:
            current = metrics()
            _METRICS_CACHED = current
            _METRICS_CACHED_AT = time.monotonic()
        return _METRICS_CACHED


def payload(after=0):
    entries, seq = logs(after)
    return {"metrics": _cached_metrics(), "logs": entries, "seq": seq}
