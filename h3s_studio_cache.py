"""Optional, lossless RGB8 cache for H3Studio's *post-colour* frames.

This is not an AV checkpoint and never replaces take masters. All work is
restricted to the H3Studio presentation layer; overlap/protected use none of it.
Every cache entry is an atomic ZIP of independently deflated RGB24 blocks.
The same 8-bit conversion is applied on the cache's first use so cached runs
and fresh runs produce identical downstream pixels before the seam bridge.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import threading
import zipfile
from functools import lru_cache

import numpy as np
import torch

VERSION = "h3studio_rgb8_v1"
BLOCK = 12
MIN_FREE_BYTES = 2 * (1024 ** 3)


@lru_cache(maxsize=1)
def _algorithm_hash():
    path = os.path.join(os.path.dirname(__file__), "h3s_studio_color.py")
    sha = hashlib.sha256()
    with open(path, "rb") as stream:
        for data in iter(lambda: stream.read(131072), b""):
            sha.update(data)
    return sha.hexdigest()[:24]


def identity(take_key, first_key, previous_key, item, width, height, fps):
    """A correction depends on its raw take, clip-1 colour, and the previous corrected clip."""
    obj = {
        "v": VERSION, "algorithm": _algorithm_hash(),
        "take": str(take_key), "first": str(first_key),
        "previous": str(previous_key or ""), "fps": int(fps),
        "frames": int(item["frames"]), "link": str(item["link"]),
        "overlap": int(item["overlap"]), "width": int(width), "height": int(height),
    }
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:32]


def path_for(project_dir, key):
    return os.path.join(project_dir, "cache", "studio_rgb8", key + ".zip")


def _valid_shape(n, h, w):
    return 0 < n <= 5000 and 0 < h <= 8192 and 0 < w <= 8192 and n * h * w * 3 <= 8 * 1024 ** 3


def load(project_dir, key, expected_frames=None):
    """Return (float IMAGE, original first-clip Lab statistics) or None.

    Missing, interrupted, and corrupt entries fall back to normal colour correction.
    Never deserialize pickle or evaluate untrusted code.
    """
    path = path_for(project_dir, key)
    if not os.path.isfile(path):
        return None
    try:
        with zipfile.ZipFile(path) as zf:
            meta = json.loads(zf.read("meta.json"))
            n, h, w = (int(meta[k]) for k in ("frames", "height", "width"))
            if meta.get("key") != key or meta.get("version") != VERSION:
                return None
            if not _valid_shape(n, h, w) or (expected_frames is not None and n != int(expected_frames)):
                return None
            first_stats = meta.get("first_stats")
            if first_stats is not None and (not isinstance(first_stats, list) or len(first_stats) != 6):
                return None
            # Allocate the destination once: avoid retaining every RGB8 block
            # alongside a concatenated RGB8 copy and the final float32 video.
            frames = torch.empty((n, h, w, 3), dtype=torch.float32)
            for start in range(0, n, BLOCK):
                size = min(BLOCK, n - start)
                name = f"{start:06d}.rgb"
                info = zf.getinfo(name)
                length = size * h * w * 3
                if info.file_size != length:
                    return None
                raw = zf.read(name)  # ZIP checks the per-block CRC.
                if len(raw) != length:
                    return None
                block = torch.from_numpy(
                    np.frombuffer(raw, dtype=np.uint8).copy().reshape(size, h, w, 3))
                frames[start:start + size].copy_(block.float().div_(255.0))
            return frames, first_stats
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, zipfile.BadZipFile, MemoryError):
        return None


def save(project_dir, key, frames, first_stats=None):
    """Best effort atomic write, with a disk-space reserve; never fails sampling."""
    n, h, w = (int(x) for x in frames.shape[:3])
    if frames.ndim != 4 or int(frames.shape[3]) != 3 or not _valid_shape(n, h, w):
        return False
    dest = path_for(project_dir, key)
    # A damaged or interrupted previous entry must be replaceable.
    folder = os.path.dirname(dest)
    temp = dest + f".{os.getpid()}.{threading.get_ident()}.part"
    try:
        os.makedirs(folder, exist_ok=True)
        # The compressed file is smaller than raw RGB24, but allow for poor compression.
        if shutil.disk_usage(folder).free < n * h * w * 3 + MIN_FREE_BYTES:
            return False
        meta = {"key": key, "version": VERSION, "frames": n, "height": h, "width": w,
                "first_stats": (first_stats.tolist() if hasattr(first_stats, "tolist") else first_stats)}
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as zf:
            zf.writestr("meta.json", json.dumps(meta, sort_keys=True))
            for start in range(0, n, BLOCK):
                block = (frames[start:start + BLOCK].detach().float().cpu().clamp(0, 1) * 255.0 + 0.5).byte()
                zf.writestr(f"{start:06d}.rgb", block.contiguous().numpy().tobytes())
        os.replace(temp, dest)
        return True
    except (OSError, ValueError, RuntimeError, MemoryError, zipfile.BadZipFile):
        return False
    finally:
        try:
            if os.path.isfile(temp):
                os.remove(temp)
        except OSError:
            pass


def quantize(frames):
    """Normalize first-run data to exactly the RGB8 representation written to disk."""
    output = frames.detach().cpu().float()
    for start in range(0, int(output.shape[0]), BLOCK):
        f = output[start:start + BLOCK]
        f.copy_((f.clamp(0, 1) * 255.0 + 0.5).byte().float().div_(255.0))
    return output
