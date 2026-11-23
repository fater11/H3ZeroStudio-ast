"""Experimental SAM 3.1 person-only Character Swap with source-background preservation.

The user selects a point in the FIRST source frame. Native ComfyUI SAM3 nodes segment
that person and track it in overlapping 64-frame blocks. Binary masks are cached by
source identity, seed point, tracking resolution and checkpoint fingerprint. An empty
tracking mask restores the source frame, never an unrelated person's pixels.
This is opt-in: projects without source.swap_mask do not enter this module.
"""
import base64
import hashlib
import json
import os
import tempfile

import numpy as np

MODEL = "sam3.1_multiplex_fp16.safetensors"
YOLO_RELATIVE = ("ultralytics", "segm", "person_yolov8m-seg.pt")
TRACK_SIDE = 640
BLOCK = 64


def model_path():
    import folder_paths
    p = folder_paths.get_full_path("checkpoints", MODEL)
    return p if p and os.path.isfile(p) else None


def require_model():
    p = model_path()
    if not p:
        raise ValueError("Swap SAM 3.1: не найден checkpoints/" + MODEL)
    try:
        from comfy_extras.nodes_sam3 import SAM3_Detect, SAM3_VideoTrack, SAM3_TrackToMask
    except ImportError as e:
        raise ValueError("Swap SAM 3.1: обновите ComfyUI (не найдены встроенные SAM3-ноды)") from e
    return p


def _u8(frame):
    a = np.asarray(frame)[..., :3]
    if a.dtype == np.uint8:
        return a
    return np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)


def _model():
    import nodes
    require_model()
    # Native ComfyUI checkpoint loader; SAM and H3 are loaded sequentially by
    # ComfyUI's model manager instead of keeping both in RTX VRAM.
    model = nodes.CheckpointLoaderSimple().load_checkpoint(MODEL)[0]
    return model


def _scaled_size(w, h, side=TRACK_SIDE):
    scale = min(1.0, side / max(w, h))
    return max(32, round(w * scale / 32) * 32), max(32, round(h * scale / 32) * 32)


def _person_mask(first, point):
    """YOLO-seg reference: the *whole* person under the click (None if the model is absent).

    SAM with a box prompt happily returns a part (a forehead, a hand) on big close-ups; the
    YOLO person segmentation is coarser but it is always the person, so it can veto a fragment.
    """
    try:
        import folder_paths
        checkpoint = os.path.join(folder_paths.models_dir, *YOLO_RELATIVE)
        if not os.path.isfile(checkpoint):
            return None
        found = _person_detector(checkpoint).predict(_u8(first), device="cpu", imgsz=640, conf=.25,
                                                    max_det=12, verbose=False)[0]
        if found.masks is None or found.boxes is None:
            return None
        h, w = first.shape[:2]
        x, y = float(point[0]) * w, float(point[1]) * h
        xi = int(min(w - 1, max(0, x)))
        yi = int(min(h - 1, max(0, y)))
        best = None
        for m, cls in zip(found.masks.data.cpu().numpy(), found.boxes.cls.cpu().numpy()):
            if int(cls) != 0:
                continue
            mm = m > .5
            if mm.shape != (h, w):
                import cv2
                mm = cv2.resize(mm.astype("uint8"), (w, h), interpolation=cv2.INTER_NEAREST) > .5
            if not mm[yi, xi]:
                continue
            area = float(mm.mean())
            if not 0.01 <= area <= .97:
                continue
            if best is None or area > float(best.mean()):   # the figure under the click
                best = mm
        return None if best is None else best.astype(np.float32)
    except Exception:
        return None


def _seed(model, first, point, box=None):
    """Select the whole person by the YOLO person box and the click, falling back to a click.

    A positive point alone can select a jacket or a face instead of the person, while a box alone
    can return a fragment on a big close-up — so both prompts are sent together, and the result is
    checked against the YOLO person segmentation (a fragment is replaced by the whole person).
    """
    import torch
    from comfy_extras.nodes_sam3 import SAM3_Detect
    h, w = first.shape[:2]
    x, y = [float(v) for v in point]
    coord = json.dumps([{"x": min(w - 1, max(0, round(x * w))),
                         "y": min(h - 1, max(0, round(y * h)))}])
    kwargs = {"positive_coords": coord}
    area = None
    if isinstance(box, (list, tuple)) and len(box) == 4:
        try:
            bx, by, bw, bh = [float(v) for v in box]
            if all(np.isfinite(v) for v in (bx, by, bw, bh)) and bw >= .08 and bh >= .12:
                x1, y1 = max(0, bx), max(0, by)
                x2, y2 = min(1, bx + bw), min(1, by + bh)
                if x2 > x1 and y2 > y1:
                    # the box *and* the click: the click anchors the object, the box bounds it
                    kwargs = {"positive_coords": coord,
                              "bboxes": {"x": round(x1 * w), "y": round(y1 * h),
                                         "width": max(1, round((x2 - x1) * w)),
                                         "height": max(1, round((y2 - y1) * h))}}
                    area = (x2 - x1) * (y2 - y1)
        except (TypeError, ValueError):
            pass
    mask = SAM3_Detect.execute(model, torch.from_numpy(first[None]).float(),
                               refine_iterations=2, **kwargs)[0].float().cpu()
    coverage = float((mask > .5).float().mean())
    person = _person_mask(first, point)
    if person is not None:
        ref = person > .5
        sam = (mask[0] > .5).numpy()
        inside = float((sam & ref).sum()) / max(1.0, float(ref.sum()))
        if inside < .45:
            # SAM grabbed a part of the figure (a face, a hand): keep the whole person instead
            return torch.from_numpy(person)[None]
        spill = float((sam & ~ref).mean())   # share of the frame SAM put outside the person
        if spill > .02:
            # a point on a big, textureless close-up spreads onto the background and the glasses:
            # clip the seed to the person so only the person is ever replaced
            return torch.from_numpy((sam & ref).astype("float32"))[None]
    if not 0.002 <= coverage <= 0.85:
        raise ValueError("SAM 3.1 не смог выделить выбранного человека. Попробуйте другой кадр или отключите маску.")
    if area is not None and coverage < area * .16:
        raise ValueError("SAM 3.1 выделил лишь часть фигуры. Маска не подтверждена: фон и человек могли бы смешаться.")
    return mask


def _source_frame(path, frame, w, h):
    from . import h3s_media
    return h3s_media.load_video_frames(path, frame, 1, w, h, mode="crop")[0]


def _jpeg(rgb, side=600):
    import cv2
    h, w = rgb.shape[:2]
    scale = min(1.0, side / max(w, h))
    if scale < 1:
        rgb = cv2.resize(rgb, (round(w * scale), round(h * scale)))
    ok, encoded = cv2.imencode(".jpg", rgb[..., ::-1], [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        raise ValueError("Не удалось сформировать предпросмотр кадра")
    return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")


def picker(path, frame=0, width=768, height=1344):
    """Source-frame preview. A YOLO box is only a visual hint, not the SAM tracker."""
    import cv2
    w, h = int(width), int(height)
    if not (256 <= w <= 2048 and 256 <= h <= 2048):
        raise ValueError("Некорректное разрешение для выбора персонажа")
    frame = max(0, int(frame))
    rgb = _u8(_source_frame(path, frame, w, h))
    boxes = []
    try:
        import folder_paths
        p = os.path.join(folder_paths.models_dir, *YOLO_RELATIVE)
        if os.path.isfile(p):
            found = _person_detector(p).predict(rgb, device="cpu", imgsz=512, conf=.3,
                                                 max_det=12, verbose=False)[0]
            if found.boxes is not None:
                for b, cls, score in zip(found.boxes.xyxy.cpu().numpy(),
                                         found.boxes.cls.cpu().numpy(),
                                         found.boxes.conf.cpu().numpy()):
                    if int(cls) != 0:
                        continue
                    box = [float(round(max(0.0, min(1.0, float(v) / dim)), 4)) for v, dim in
                           zip((b[0], b[1], b[2] - b[0], b[3] - b[1]), (w, h, w, h))]
                    boxes.append({"box": box, "score": round(float(score), 3)})
    except Exception:
        # SAM point selection still works even if optional YOLO detector is absent.
        pass
    return {"frame": frame, "width": w, "height": h, "people": boxes, "image": _jpeg(rgb)}


def _outside_prompt():
    """ComfyUI's progress hook needs these attributes even from an editor API call.
    Same standalone-node boundary used by BFSNodes' SAM panel helpers.
    """
    from server import PromptServer
    srv = PromptServer.instance
    for name in ("last_prompt_id", "last_node_id"):
        if not hasattr(srv, name):
            setattr(srv, name, None)


def mask_preview(path, point, width, height, box=None, frame=0):
    """Verify the selected person on the first frame or a later camera shot."""
    import cv2
    import torch
    w, h = int(width), int(height)
    if not (256 <= w <= 2048 and 256 <= h <= 2048):
        raise ValueError("Swap SAM 3.1: некорректное разрешение")
    frame = int(frame)
    if frame < 0:
        raise ValueError("Swap SAM 3.1: некорректный номер кадра")
    tw, th = _scaled_size(w, h)
    src = _u8(_source_frame(path, frame, w, h))
    rgb = cv2.resize(src, (tw, th), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    _outside_prompt()
    # Native nodes ordinarily execute in inference_mode inside the Comfy queue.
    with torch.inference_mode():
        model = _model()
        mask = _seed(model, rgb, point, box)[0].numpy()
    mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_LINEAR) > .5
    overlay = src.astype(np.float32)
    overlay[mask] = overlay[mask] * .52 + np.array([30, 230, 120]) * .48
    return {"frame": frame, "image": _jpeg(overlay.astype(np.uint8)),
            "coverage": round(float(mask.mean()), 4)}


def _hard_cut(previous, current):
    """Hard-cut detector at 24 fps; ordinary camera motion is still ignored.

    The thresholds are deliberately on the sensitive side: a *missed* cut is what
    makes the swap mask slide (SAM3 keeps the old track and latches onto whoever
    stands nearest in the new shot), while a false positive only costs one extra
    re-seed on the same person.
    """
    import cv2
    a = np.asarray(previous, dtype=np.uint8)
    b = np.asarray(current, dtype=np.uint8)
    change = float(np.abs(a.astype(np.int16) - b.astype(np.int16)).mean()) / 255
    if change < .14:
        return False
    ha = cv2.calcHist([a], [0, 1], None, [16, 16], [0, 256, 0, 256])
    hb = cv2.calcHist([b], [0, 1], None, [16, 16], [0, 256, 0, 256])
    ha /= max(1., float(ha.sum()))
    hb /= max(1., float(hb.sum()))
    histogram_change = float(np.abs(ha - hb).sum()) / 2
    return change >= .28 or histogram_change >= .20


def _find_shot_cuts(path, frames, stamp):
    """Inspect the same 24-fps source timeline used by Swap, in bounded CPU batches."""
    from . import h3s_media
    total = max(0, int(frames))
    cuts, previous = [], None
    for start in range(0, total, 240):
        batch = h3s_media.load_video_frames(path, start, min(240, total - start),
                                            128, 96, mode="stretch")
        for j, frame in enumerate(batch):
            index = start + j
            current = _u8(frame)
            if previous is not None and index - (cuts[-1] if cuts else 0) >= 6:
                if _hard_cut(previous, current):
                    cuts.append(index)
            previous = current
    return tuple(cuts)


def detect_shot_cuts(path, frames):
    """Analyze the full source once; every Swap chunk reuses the same cut timeline."""
    from . import h3s_media
    st = os.stat(path)
    total = int(h3s_media.video_info(path)["frames"])
    cuts = _cached_shot_cuts(path, total, (st.st_size, st.st_mtime_ns))
    return tuple(c for c in cuts if c < int(frames))


from functools import lru_cache
_cached_shot_cuts = lru_cache(maxsize=10)(_find_shot_cuts)


def _shot_anchor(anchors, frame):
    """An explicit person selection on a later shot takes priority over YOLO."""
    for entry in anchors or []:
        if isinstance(entry, dict) and int(entry.get("frame", -1)) == frame:
            point = entry.get("point")
            if isinstance(point, (list, tuple)) and len(point) == 2:
                return point, entry.get("box")
    return None


def _auto_shot_seed(model, first, anchors, frame):
    """Re-identify an unambiguous person after a cut; never guess among several people."""
    selected = _shot_anchor(anchors, frame)
    if selected is not None:
        return _seed(model, first, *selected)
    try:
        import folder_paths
        checkpoint = os.path.join(folder_paths.models_dir, *YOLO_RELATIVE)
        if not os.path.isfile(checkpoint):
            return None
        found = _person_detector(checkpoint).predict(_u8(first), device="cpu",
                                                    imgsz=512, conf=.40,
                                                    max_det=12, verbose=False)[0]
        if found.boxes is None:
            return None
        h, w = first.shape[:2]
        boxes = []
        for coords, cls in zip(found.boxes.xyxy.cpu().numpy(), found.boxes.cls.cpu().numpy()):
            if int(cls) != 0:
                continue
            x1, y1, x2, y2 = [float(z) for z in coords]
            if (x2 - x1) * (y2 - y1) / (w * h) >= .015:
                boxes.append([x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h])
        if len(boxes) != 1:
            return None  # Do not swap an unrelated person in a crowded shot.
        x, y, bw, bh = boxes[0]
        return _seed(model, first, [x + bw / 2, y + bh / 2], boxes[0])
    except Exception:
        # Failed re-detection is safer than jumping onto a different subject.
        return None


@lru_cache(maxsize=1)
def _person_detector(checkpoint):
    from ultralytics import YOLO
    return YOLO(checkpoint)


def _cache_dir(project_dir, path, point, w, h, box=None, anchors=None):
    st = os.stat(path)
    cp = os.stat(require_model())
    data = [os.path.normcase(os.path.abspath(path)), st.st_size, st.st_mtime_ns,
            [round(float(x), 5) for x in point],
            [round(float(x), 5) for x in box] if box else None,
            w, h, TRACK_SIDE, cp.st_size, cp.st_mtime_ns,
            anchors or [], "sam3.1-shot-reset-v1"]
    key = hashlib.sha256(json.dumps(data, ensure_ascii=False).encode()).hexdigest()[:20]
    return os.path.join(project_dir, "cache", "swap_sam3", key)


def _block_path(folder, k):
    return os.path.join(folder, f"mask_{k:06d}.npz")


def _pack(masks):
    return np.packbits((masks > .5).astype(np.uint8), axis=-1)


def _unpack(packed, w):
    return np.unpackbits(packed, axis=-1, count=w).astype(np.float32)


def _load_block(file):
    with np.load(file, allow_pickle=False) as z:
        packed, width = z["bits"], int(z["width"])
        return _unpack(packed, width)


def _save_block(file, masks):
    os.makedirs(os.path.dirname(file), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".npz", dir=os.path.dirname(file))
    try:
        with os.fdopen(fd, "wb") as f:
            np.savez_compressed(f, bits=_pack(masks), width=masks.shape[-1])
        os.replace(tmp, file)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def prepare(path, point, count, w, h, project_dir, progress=None, box=None, anchors=None):
    """Track the selected person across segments; re-seed at each detected camera cut."""
    import cv2
    import torch
    from comfy_extras.nodes_sam3 import SAM3_VideoTrack, SAM3_TrackToMask
    from . import h3s_media
    if len(point) != 2 or not all(0 <= float(p) <= 1 for p in point):
        raise ValueError("Swap SAM 3.1: выберите точку на персонаже")
    tw, th = _scaled_size(w, h)
    folder = _cache_dir(project_dir, path, point, w, h, box, anchors)
    cuts = set(detect_shot_cuts(path, int(count)))
    cuts.update(int(a["frame"]) for a in (anchors or [])
                if isinstance(a, dict) and 0 < int(a.get("frame", 0)) < int(count))
    want_blocks = (int(count) + BLOCK - 1) // BLOCK
    current_model = None
    last = None
    for block_id in range(want_blocks):
        expected = min(BLOCK, int(count) - block_id * BLOCK)
        file = _block_path(folder, block_id)
        if os.path.isfile(file):
            try:
                masks = _load_block(file)
                if masks.ndim != 3 or masks.shape[1:] != (th, tw) or len(masks) < expected:
                    raise ValueError("Размер маски не совпадает")
                # A previously cached longer block is valid for a shorter trim.
                last = masks[expected - 1:expected]
                if progress:
                    progress(min((block_id + 1) * BLOCK, int(count)), int(count))
                continue
            except Exception:
                # Corrupted/incomplete cache is recomputed; all earlier blocks remain intact.
                pass
        if current_model is None:
            current_model = _model()
        start = block_id * BLOCK
        # Track through contiguous frames, but NEVER propagate a mask across an edit.
        offset = start - 1 if start and start not in cuts else start
        source = h3s_media.load_video_frames(path, offset, expected + start - offset,
                                              w, h, mode="crop")
        resized = np.stack([cv2.resize(x, (tw, th), interpolation=cv2.INTER_AREA)
                            for x in source]).astype(np.float32)
        end = start + expected
        boundaries = [start] + sorted(c for c in cuts if start < c < end) + [end]
        masks = np.zeros((expected, th, tw), dtype=np.float32)
        for left, right in zip(boundaries, boundaries[1:]):
            if left == 0:
                seed = _seed(current_model, resized[left - offset], point, box)
            elif left in cuts:
                seed = _auto_shot_seed(current_model, resized[left - offset], anchors, left)
            else:
                seed = torch.from_numpy(last.copy()) if last is not None else None
            if seed is None or not bool((seed > .5).any()):
                # Ambiguous new shot: leave source unchanged instead of replacing a bystander.
                last = np.zeros((1, th, tw), dtype=np.float32)
                continue
            base = left if left in cuts or left == 0 else left - 1
            batch = torch.from_numpy(resized[base - offset:right - offset])
            tracked = SAM3_VideoTrack.execute(batch, current_model, initial_mask=seed,
                                              max_objects=1, detect_interval=1)[0]
            segment_masks = SAM3_TrackToMask.execute(tracked, object_indices="0")[0].float().cpu().numpy()
            if base < left:
                segment_masks = segment_masks[1:]
            if segment_masks.shape != (right - left, th, tw):
                raise RuntimeError("Swap SAM 3.1: неверное число масок в плане")
            masks[left - start:right - start] = segment_masks
            # ---- guard: re-anchor where the track left the person (missed cut) ----
            jump = _restart_index(segment_masks) if len(segment_masks) > 1 else None
            if jump:
                absolute = left + jump
                if absolute in cuts:
                    pass                                    # already handled as a shot boundary
                else:
                    fresh = _auto_shot_seed(current_model, resized[absolute - offset], anchors, absolute)
                    if fresh is not None and bool((fresh > .5).any()):
                        tail = torch.from_numpy(resized[absolute - offset:right - offset])
                        tracked_tail = SAM3_VideoTrack.execute(tail, current_model, initial_mask=fresh,
                                                               max_objects=1, detect_interval=1)[0]
                        fixed = SAM3_TrackToMask.execute(tracked_tail, object_indices="0")[0].float().cpu().numpy()
                        if fixed.shape == (right - absolute, th, tw):
                            segment_masks = np.concatenate((segment_masks[:jump], fixed), axis=0)
                            masks[left - start:right - start] = segment_masks
                            cuts.add(absolute)                  # the next chunk starts on this shot too
                    else:
                        # No unambiguous person on the new shot: keep the source frame
                        # instead of pasting the old mask over a bystander.
                        segment_masks = np.concatenate(
                            (segment_masks[:jump], np.zeros((right - absolute, th, tw), dtype=np.float32)), axis=0)
                        masks[left - start:right - start] = segment_masks
                        cuts.add(absolute)
            last = segment_masks[-1:]
        _save_block(file, masks)
        if progress:
            progress(min((block_id + 1) * BLOCK, int(count)), int(count))
    return folder, (tw, th)


def _mask_geometry(mask):
    """Bounding box (normalized) for a tracked person. Pure CPU, used only by the opt-in guard."""
    ys, xs = np.nonzero(np.asarray(mask) > .5)
    if len(xs) < max(2, int(mask.size * .001)):
        return None
    h, w = mask.shape
    return (float(xs.min()) / w, float(ys.min()) / h,
            float(xs.max() + 1) / w, float(ys.max() + 1) / h)


def _mask_identity_jump(previous, current):
    """Conservative discontinuity guard: a large one-frame teleport with almost no box overlap."""
    if previous is None or current is None:
        return False
    ax1, ay1, ax2, ay2 = previous
    bx1, by1, bx2, by2 = current
    center_jump = max(abs((ax1 + ax2 - bx1 - bx2) * .5),
                      abs((ay1 + ay2 - by1 - by2) * .5))
    if center_jump <= .40:
        return False
    intersection = max(0., min(ax2, bx2) - max(ax1, bx1)) * max(0., min(ay2, by2) - max(ay1, by1))
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return intersection / max(1.e-6, area_a + area_b - intersection) < .05


RESTART_MIN_EMPTY = 2   # a mask that disappears for this many frames is a lost track, not a blink


def _restart_index(segment_masks):
    """First frame of a segment where the tracked person is gone or has teleported.

    A cut the frame detector did not see (dissolve, whip pan, a cut inside a fast
    move) leaves SAM3 tracking the *previous* shot: the mask then drifts onto a
    bystander or onto the background. This is the guard that stops it, measured on
    the masks themselves instead of on the source frames.
    """
    previous, empty_run = None, 0
    for index in range(len(segment_masks)):
        box = _mask_geometry(segment_masks[index])
        if box is None:
            empty_run += 1
            if previous is not None and empty_run >= RESTART_MIN_EMPTY:
                return max(0, index - empty_run + 1)
            continue
        if _mask_identity_jump(previous, box):
            return index
        previous, empty_run = box, 0
    return None


def shape_mask(mask, cfg=None):
    """Mask post-processing before the composite (values in video pixels).

    fill_holes — close the interior holes (glasses, gaps between the arms);
    expand — grow the silhouette so the cut edge keeps the original outline;
    feather — soften the border so the paste does not look cut out.
    """
    import cv2
    cfg = cfg or {}
    m = (np.asarray(mask) > .5).astype(np.uint8)
    if cfg.get("fill_holes", True):
        h, w = m.shape[:2]
        inv = (1 - m).astype(np.uint8)
        ff = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(inv, ff, (0, 0), 2)
        # the background the flood did not reach is enclosed by the silhouette -> a hole
        m = np.where(inv == 1, 1, m).astype(np.uint8)
    expand = float(cfg.get("expand", 0) or 0)
    if expand >= 1:
        k = int(round(expand)) * 2 + 1
        m = cv2.dilate(m, np.ones((k, k), np.uint8))
    feather = float(cfg.get("feather", 0) or 0)
    if feather >= 1:
        m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), max(0.6, feather / 3.0))
    return m


def composite(path, src_in, generated, mask_config, project_dir, progress=None):
    """Keep original pixels outside the selected SAM mask, preserving the guide background."""
    import cv2
    import torch
    from . import h3s_media
    n, h, w = map(int, generated.shape[:3])
    point = mask_config["point"]
    if int(mask_config.get("at", 0)) != 0:
        raise ValueError("Swap SAM 3.1: выбор персонажа пока поддерживается на первом кадре видео")
    anchors = mask_config.get("shots") or []
    cuts = set(detect_shot_cuts(path, int(src_in) + n))
    cuts.update(int(a["frame"]) for a in anchors
                if isinstance(a, dict) and 0 < int(a.get("frame", 0)) < int(src_in) + n)
    folder, (tw, th) = prepare(path, point, int(src_in) + n, w, h, project_dir,
                              progress=(lambda a, b: progress(a, b, "track")) if progress else None,
                              box=mask_config.get("box"), anchors=anchors)
    processed = 0
    active = 0
    guarded = 0
    mask_cfg = mask_config.get("cfg") or {}
    temporal = max(0, int(mask_cfg.get("temporal_expand", 0) or 0))
    hist = []          # the last masks (track resolution) for the temporal union
    use_guard = mask_config.get("guard") is True
    previous = None
    # The previous source frame is vital across segment boundaries: do not accept
    # a new person at the beginning of segment 2 just because the batch restarted.
    if use_guard and int(src_in) > 0:
        last_index = int(src_in) - 1
        previous_block = _load_block(_block_path(folder, last_index // BLOCK))
        previous = _mask_geometry(previous_block[last_index % BLOCK])
    # Fewer PyAV reopen/seek cycles while limiting RAM (~300 MB of source frames).
    batch = 32 if w * h <= 600_000 else 16
    loaded_block = -1
    masks = None
    for start in range(0, n, batch):
        count = min(batch, n - start)
        source = h3s_media.load_video_frames(path, int(src_in) + start, count, w, h, mode="crop")
        for j in range(count):
            index = int(src_in) + start + j
            block = index // BLOCK
            if block != loaded_block:
                # Previously the same 64-frame archive was decompressed every 8 frames.
                masks = _load_block(_block_path(folder, block))
                loaded_block = block
            small = masks[index % BLOCK]
            if temporal:
                # union with the neighbouring masks: fast motion keeps a part of the person a frame late
                hist.append(np.asarray(small))
                if len(hist) > 2 * temporal + 1:
                    hist.pop(0)
                if len(hist) > 1:
                    small = np.maximum.reduce(hist)
            if index in cuts:
                previous = None  # New camera shot is not a one-frame identity teleport.
            if float(small.mean()) < .001:
                generated[start + j] = torch.from_numpy(np.asarray(source[j]).copy())
                continue
            if use_guard:
                current = _mask_geometry(small)
                if _mask_identity_jump(previous, current):
                    # Preserve the original frame instead of pasting the wrong person's pixels.
                    generated[start + j] = torch.from_numpy(np.asarray(source[j]).copy())
                    guarded += 1
                    continue
                if current is not None:
                    previous = current
            active += 1
            up = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
            up = shape_mask(up, mask_cfg)
            weight = torch.from_numpy(np.clip(up[..., None], 0, 1).astype(np.float32))
            original = torch.from_numpy(np.asarray(source[j]).copy())
            generated[start + j] = (generated[start + j] * weight + original * (1 - weight)).clamp(0, 1)
            processed += 1
        if progress:
            progress(min(n, start + count), n, "paste")
    if active == 0:
        raise ValueError("Swap SAM 3.1: персонаж не отслеживается. Отключите маску или выберите другую точку.")
    return generated, {"frames": n, "active": active, "preserved": n - active,
                       "guarded": guarded, "cache": folder}
