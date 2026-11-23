"""Read-only visual drift measurements for a completed H3 segment.

These measurements are descriptive, not a quality score. They intentionally
never change RGB frames, sampling latents, seeds, or cache keys.
"""
import torch
import torch.nn.functional as F


def clip_signature(frames, skip=0, samples=12, side=64):
    """Sample delivered frames and return cheap colour, contrast, detail statistics.

    For an extension, *skip* omits the carried overlap. Each selected frame is
    shrunk before statistics are computed, keeping CPU and memory use bounded.
    """
    if not isinstance(frames, torch.Tensor) or frames.ndim != 4 or frames.shape[-1] < 3:
        return None
    length, height, width = map(int, frames.shape[:3])
    start = max(0, min(int(skip), length - 1))
    if length < 1 or height < 2 or width < 2:
        return None
    indices = torch.linspace(start, length - 1, min(int(samples), length - start)).round().long()
    picked = frames.index_select(0, indices.to(frames.device))[..., :3].float().cpu()
    x = picked.permute(0, 3, 1, 2)
    target = (min(side, height), min(side, width))
    if target != (height, width):
        x = F.interpolate(x, size=target, mode="area")
    rgb = x.mean(dim=(0, 2, 3))
    y = x[:, 0] * 0.2126 + x[:, 1] * 0.7152 + x[:, 2] * 0.0722
    dx = (y[:, :, 1:] - y[:, :, :-1]).abs().mean()
    dy = (y[:, 1:, :] - y[:, :-1, :]).abs().mean()
    return {
        "luma": round(float(y.mean()), 5),
        "contrast": round(float(y.std(unbiased=False)), 5),
        "detail": round(float((dx + dy) / 2), 5),
        "rgb": [round(float(v), 5) for v in rgb],
        "samples": int(indices.numel()),
    }


def compare_signatures(reference, current):
    """Relative measurements against the first clip of the same continuous take."""
    if not reference or not current:
        return None
    def ratio(key):
        old = float(reference[key])
        return round(float(current[key]) / old, 3) if old > 0.002 else None
    return {
        "luma_delta": round(current["luma"] - reference["luma"], 4),
        "contrast_ratio": ratio("contrast"),
        "detail_ratio": ratio("detail"),
        "rgb_delta": [round(a - b, 4) for a, b in zip(current["rgb"], reference["rgb"])],
    }
