"""Validate decoded H3 cache tensors before they reach generation or stitching."""
import torch


class InvalidLatentCache(ValueError):
    pass


def validate_av_cache(data, path, *, require_audio=False):
    """Validate tensor layout and values; leave optional metadata untouched.

    Video H3 latents: [B, C, T, H, W]; audio: [B, C, 2, T].
    Channel counts are deliberately not hard-coded for model compatibility.
    """
    def fail(why):
        raise InvalidLatentCache(f"H3ZeroStudio: некорректный латент кеша {path}: {why}. "
                                 "Файл не удалён; восстановите его или очистите соответствующий кеш.")

    if not isinstance(data, dict):
        fail("ожидался словарь")
    v = data.get("v")
    if not isinstance(v, torch.Tensor) or v.ndim != 5:
        fail("видео должно быть тензором [B,C,T,H,W]")
    if any(dim <= 0 for dim in v.shape) or v.shape[0] != 1:
        fail(f"недопустимая форма видео {tuple(v.shape)}")
    if not v.is_floating_point() or not bool(torch.isfinite(v).all()):
        fail("видео содержит невещественный тип, NaN или Inf")
    a = data.get("a")
    if a is None:
        if require_audio:
            fail("отсутствует аудиолатент")
    else:
        if not isinstance(a, torch.Tensor) or a.ndim != 4:
            fail("аудио должно быть тензором [B,C,2,T]")
        if any(dim <= 0 for dim in a.shape) or a.shape[0] != v.shape[0] or a.shape[2] != 2:
            fail(f"недопустимая форма аудио {tuple(a.shape)}")
        if not a.is_floating_point() or not bool(torch.isfinite(a).all()):
            fail("аудио содержит невещественный тип, NaN или Inf")
    return data


def load_av_cache(path, *, require_audio=False):
    try:
        data = torch.load(path, map_location="cpu", weights_only=True)
    except Exception as exc:
        raise InvalidLatentCache(f"H3ZeroStudio: не удалось прочитать кеш {path}: {exc}") from exc
    return validate_av_cache(data, path, require_audio=require_audio)
