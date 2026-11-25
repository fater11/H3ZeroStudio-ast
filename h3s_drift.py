"""Дрейф цвета и яркости по всему ролику: правка после сборки, а не только на стыках.

Наш level lock выравнивает уровни в стыках, но за 40+ отрезков картинка может уехать по яркости и тону
целиком. Здесь это лечится по двум проходам: сначала по уменьшенным кадрам считается кривая яркости и цвет,
затем полные кадры пересчитываются с покадровым коэффициентом.

Режимы:
  "scenes" — каждая сцена (и всё, что в ней) приводится к общей цели: убирает и дрейф, и прыжки между сценами;
  "trend"  — правится только медленная кривая (дрейф), а местные изменения (вспышка, свет включили) остаются;
  "color"  — вместе с яркостью выравнивается и тон (средние по каналам), иначе только яркость.

Группировка по сценам — по монтажным склейкам (детектор пакета) и/или по резкому шагу яркости.
"""
import math, os

from . import h3s_media as media

# Насколько можно тянуть кадр. Границы ремастерские: выравнивание отрезков, уехавших на треть, — рабочая
# задача, но дальше ±45 % правка уже заметна как «мигание», и честнее сказать об остатке в отчёте.
DRIFT_LIMIT = (0.70, 1.45)
NEAR_CLIP = 0.985               # кадр уже почти выбит в белое: сильнее не поднимаем
SAMPLE_SIDE = 64
DEFAULT_TREND_S = 2.0
ASSUMED_FPS = 24


class DriftError(ValueError):
    pass


def _grey(frames):
    import numpy as np
    a = np.asarray(frames, dtype="float32")
    if a.ndim == 4 and a.shape[-1] >= 3:
        return a[..., :3].mean(axis=-1), a[..., :3].mean(axis=(1, 2, 3))
    if a.ndim == 3:
        return a, a.mean(axis=(1, 2))
    raise DriftError("Дрейф: нужны кадры [F,H,W,C]")


def measure(frames):
    """Покадровые метрики: {'luma': [...], 'rgb': [[r,g,b], ...], 'p995': [...]}."""
    import numpy as np
    grey, luma = _grey(frames)
    a = np.asarray(frames, dtype="float32")[..., :3]
    return {"luma": [float(v) for v in luma],
            "rgb": [[float(v) for v in c] for c in a.mean(axis=(1, 2))],
            "p995": [float(v) for v in np.percentile(grey, 99.5, axis=(1, 2))]}


def smooth(values, window):
    """Медленная кривая: скользящее среднее (окно в кадрах, нечётное, минимум 3)."""
    import numpy as np
    v = np.asarray([float(x) for x in values], dtype="float32")
    n = len(v)
    if n == 0:
        return []
    w = int(max(3, min(n, int(window) | 1)))
    pad = w // 2
    padded = np.pad(v, (pad, pad), mode="edge")
    kernel = np.ones(w, dtype="float32") / w
    return [float(x) for x in np.convolve(padded, kernel, mode="valid")[:n]]


def scene_bounds(cuts, frames, min_len=6):
    """Сцены по монтажным склейкам: [(начало, конец), ...] в кадрах (конец не включается)."""
    edges = sorted({int(c) for c in (cuts or ()) if 0 < int(c) < int(frames)})
    out, prev = [], 0
    for c in edges:
        if c - prev >= int(min_len):
            out.append((prev, c))
            prev = c
    if frames - prev >= int(min_len) or not out:
        out.append((prev, int(frames)))
    return out


def scene_trends(luma, scenes, window):
    """Медленная кривая внутри каждой сцены отдельно: на склейке сглаживание не перетекает через границу."""
    out = []
    for a, b in scenes:
        part = [float(x) for x in luma[a:min(b, len(luma))]]
        out.extend(smooth(part, min(window, max(3, len(part)))))
    return out[:len(luma)]


def offsets(metrics, mode="scenes", bounds=None, trend_window=None, strength=1.0, limit=DRIFT_LIMIT,
            target=None):
    """Покадровые коэффициенты правки.

    target — общая цель (медиана яркости ролика). Сцены — по склейкам, и сглаживание внутри сцены своё.
    Режимы:
      "trend"  — убирает медленную кривую внутри каждой сцены, но её собственный уровень сохраняет:
                 разница «день / ночь» остаётся, а уползание за 40 отрезков уходит;
      "scenes" — каждый отрезок целиком тянется к общей цели: прыжки между сценами уходят;
      "both"   — и то, и другое: дрейф уходит и внутри сцены, и на её границах;
      "color"  — как "scenes" плюс выравнивание средних по каналам (яркость сохраняется).
    """
    import numpy as np
    luma = [float(x) for x in metrics["luma"]]
    if not luma:
        raise DriftError("Дрейф: нет кадров для анализа")
    frames = len(luma)
    target = float(target) if target is not None else float(np.median(luma))
    window = int(trend_window or DEFAULT_TREND_S * ASSUMED_FPS)
    strength = max(0.0, min(2.0, float(strength)))
    scenes = bounds or scene_bounds((), frames)
    scene_of = [0] * frames
    for i, (a, b) in enumerate(scenes):
        for k in range(a, min(b, frames)):
            scene_of[k] = i
    trends = scene_trends(luma, scenes, window)
    scene_med = {}
    for i, (a, b) in enumerate(scenes):
        part = luma[a:min(b, frames)]
        scene_med[i] = float(np.median(part)) if part else target

    def clamp(g):
        return 1.0 + (min(max(g, limit[0]), limit[1]) - 1.0) * strength

    gains = []
    for k in range(frames):
        g = 1.0
        if mode in ("trend", "both"):
            # медленная часть снимается к собственному уровню сцены: в "trend" он так и остаётся,
            # в "both" его затем тянет к общей цели блок ниже — иначе отрезок уезжает дважды
            g *= (luma[k] - trends[k] + scene_med[scene_of[k]]) / max(1e-4, luma[k])
        if mode in ("scenes", "both", "color"):
            a, b = scenes[scene_of[k]]
            scene_level = sum(luma[a:min(b, frames)]) / max(1, min(b, frames) - a)
            g *= target / max(1e-4, scene_level)
        gains.append(clamp(g))

    rgb_gain = None
    if mode == "color":
        rgb = np.asarray(metrics["rgb"], dtype="float32")
        ref = np.median(rgb, axis=0)
        rgb_gain = []
        for k in range(frames):
            row = np.clip(rgb[k] * gains[k], 1e-4, None)
            scale = np.clip(ref / row, limit[0], limit[1])
            rgb_gain.append([float(v) for v in (scale / max(1e-6, float(scale.mean())))])
    return {"gain": gains, "rgb_gain": rgb_gain, "target": target, "scenes": scenes,
            "trend": trends, "frames": frames}


def _soft_limit(gain, p995, limit):
    """Не поднимаем кадр, который уже почти выбит в белое: иначе получаем клиппинг вместо ровной картинки."""
    out = []
    for g, p in zip(gain, p995):
        if g > 1.0 and p > 0:
            room = max(0.0, (NEAR_CLIP - p)) / max(1e-6, p) + 1.0
            g = min(g, max(limit[0], room))
        out.append(g)
    return out


def apply_offsets(frames, plan):
    """Кадры [F,H,W,C] (float 0..1) → выровненные кадры того же вида."""
    import numpy as np
    a = np.asarray(frames, dtype="float32").copy()
    gain = _soft_limit(plan["gain"], plan.get("p995") or [0.0] * len(plan["gain"]), DRIFT_LIMIT)
    if a.shape[0] != len(gain):
        raise DriftError(f"Дрейф: кадров {a.shape[0]}, коэффициентов {len(gain)}")
    for k, g in enumerate(gain):
        frame = a[k][..., :3]
        if plan.get("rgb_gain"):
            frame *= np.asarray(plan["rgb_gain"][k], dtype="float32")
        frame *= g
        np.clip(frame, 0.0, 1.0, out=frame)
    return a


def report(before, after):
    """Что изменилось: разброс яркости и цветовых каналов, средний сдвиг."""
    def spread(m):
        luma = m["luma"]
        if not luma:
            return 0.0, 0.0
        return (max(luma) - min(luma),
                max(max(c) - min(c) for c in zip(*m["rgb"])) if m["rgb"] else 0.0)
    b_l, b_c = spread(before)
    a_l, a_c = spread(after)
    return {"luma_spread_before": round(b_l, 4), "luma_spread_after": round(a_l, 4),
            "color_spread_before": round(b_c, 4), "color_spread_after": round(a_c, 4),
            "luma_median_before": round(sorted(before["luma"])[len(before["luma"]) // 2], 4) if before["luma"] else 0.0,
            "luma_median_after": round(sorted(after["luma"])[len(after["luma"]) // 2], 4) if after["luma"] else 0.0,
            "gain_min": round(min(after["gain"]), 4) if after.get("gain") else 1.0,
            "gain_max": round(max(after["gain"]), 4) if after.get("gain") else 1.0}


def analyze_video(path, side=SAMPLE_SIDE, cuts=None, mode="scenes", strength=1.0, trend_window=None,
                  limit=DRIFT_LIMIT, sample=None):
    """Первый проход: метрики по уменьшенным кадрам и план правки (файл не пишется).

    Результат пригоден и для отчёта, и как вход второго прохода: `gains`, `rgb_gain`, `scenes`, `report`.
    """
    info = media.video_info(path)
    count = int(sample or info.get("frames") or 0)
    if count <= 0:
        raise DriftError("Дрейф: не удалось прочитать видео")
    w = max(2, int(side) // 2 * 2)
    h = max(2, int(round(side * (info.get("height") or 1) / max(1, info.get("width") or 1))) // 2 * 2)
    frames = media.load_video_frames(path, 0, count, w, h)
    before = measure(frames)
    if cuts is None:
        try:
            from . import h3s_swap_mask as swap
            cuts = swap.detect_shot_cuts(path) or ()
        except Exception:
            cuts = ()
    bounds = scene_bounds(cuts, count)
    plan = offsets(before, mode=mode, bounds=bounds, trend_window=trend_window, strength=strength, limit=limit)
    plan["p995"] = before["p995"]
    after = measure(apply_offsets(frames, plan))
    after["gain"] = plan["gain"]
    return {"info": info, "sample": {"width": w, "height": h, "frames": count}, "mode": mode,
            "strength": strength, "scenes": plan["scenes"], "gains": plan["gain"],
            "rgb_gain": plan["rgb_gain"], "target": plan["target"], "p995": before["p995"],
            "report": report(before, after)}


def _audio_stream(out, src):
    """Дорожка звука для нового файла: звук исходника, перекодированный в aac.

    Перекладывание чужой дорожки на своё перекодированное видео (stream copy) у muxer не сходится,
    поэтому звук кодируется заново из исходника — как в остальных экспортах пака.
    """
    import numpy as np
    try:
        wave, sr = media.load_audio(src)
    except Exception:
        return None, None, 0
    if wave is None or not len(wave.shape) or not wave.shape[-1]:
        return None, None, 0
    wav = np.clip(np.asarray(wave)[:2], -1, 1).astype(np.float32)
    try:
        from .h3s_seams import taper_edges
        wav = taper_edges(wav.copy(), int(sr))
    except Exception:
        pass
    layout = "stereo" if wav.shape[0] == 2 else "mono"
    stream = out.add_stream("aac", rate=int(sr), layout=layout)
    stream.bit_rate = 192000
    return stream, wav, int(sr)


def _write_audio(out, stream, wav, sr, chunk=1024):
    """Кадры звука в контейнер (поток уже добавлен; pts нумерует muxer)."""
    import av
    if stream is None or wav is None or not wav.shape[-1]:
        return 0
    total = 0
    layout = getattr(getattr(stream, "layout", None), "name", None) or ("stereo" if wav.shape[0] == 2 else "mono")
    for i in range(0, wav.shape[-1], chunk):
        piece = wav[:, i:i + chunk]
        frame = av.AudioFrame.from_ndarray(piece, format="fltp", layout=layout)
        frame.sample_rate = int(sr)
        frame.pts = None
        for packet in stream.encode(frame):
            out.mux(packet)
        total += piece.shape[-1]
    for packet in stream.encode():
        out.mux(packet)
    return total


def correct_video(src, dst, mode="scenes", strength=1.0, cuts=None, side=SAMPLE_SIDE, limit=DRIFT_LIMIT,
                  trend_window=None, progress=None, encoder="cpu", audio=True):
    """Два прохода: анализ по уменьшенным кадрам, затем полные кадры едут в новый файл с покадровым коэффициентом."""
    import av
    import numpy as np
    plan = analyze_video(src, side=side, cuts=cuts, mode=mode, strength=strength, trend_window=trend_window,
                         limit=limit)
    gain = _soft_limit(plan["gains"], plan["p995"], limit)
    rgb_gain = plan.get("rgb_gain")
    total = int(plan["sample"]["frames"])
    tmp = dst + ".part.mp4"
    out = av.open(tmp, mode="w", format="mp4")
    n, rate = 0, 24.0
    astr, wav, sr = (None, None, 0)
    if audio:
        astr, wav, sr = _audio_stream(out, src)
    try:
        with av.open(src) as c:
            st = c.streams.video[0]
            st.thread_type = "AUTO"
            rate = float(st.average_rate or 24)
            w, h = st.codec_context.width // 2 * 2, st.codec_context.height // 2 * 2
            vs = media.video_stream(out, w, h, int(round(rate)),
                                    {"crf": "17", "preset": "medium", "movflags": "+faststart"}, encoder=encoder)
            for fr in c.decode(st):
                img = fr.to_ndarray(format="rgb24").astype("float32") / 255.0
                k = n if n < len(gain) else len(gain) - 1
                if rgb_gain:
                    img *= np.asarray(rgb_gain[k], dtype="float32")
                img *= gain[k]
                np.clip(img, 0.0, 1.0, out=img)
                frame = media.video_frame((img * 255.0 + 0.5).astype("uint8"))
                frame.pts = None                                  # the encoder numbers frames itself
                for packet in vs.encode(frame):
                    out.mux(packet)
                n += 1
                if progress and (n % 24 == 0 or n == total):
                    progress(n, total)
            for packet in vs.encode():
                out.mux(packet)
            written = _write_audio(out, astr, wav, sr)
            if written:
                print(f"[H3ZS] дрейф: звук перекодирован из исходника ({written / max(1, sr):.2f} с)", flush=True)
    finally:
        out.close()
    media.replace_file(tmp, dst)
    res = dict(plan)
    res.update({"path": dst, "frames": n, "corrected_frames": len(gain),
                "audio_kept": bool(astr is not None), "audio_seconds": round((written / sr) if astr else 0.0, 2),
                "fps": rate})
    return res


def state_of(path):
    """Короткая справка о видео (для интерфейса и логов)."""
    info = media.video_info(path)
    return {"path": path, "frames": info.get("frames"), "fps": info.get("src_fps") or 24,
            "width": info.get("width"), "height": info.get("height"),
            "duration": info.get("duration"), "has_audio": bool(info.get("has_audio"))}
