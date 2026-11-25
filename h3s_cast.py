"""Multi-person cast: who is who in the source video, which moments become keyframes, package export/import.

Front half of a multi-person swap: people are detected per frame (YOLO person boxes, the same detector
the swap mask already uses), linked into tracks, numbered in order of first appearance and ordered left
to right inside every frame. A keyframe package (zip) carries the chosen frames plus the new characters,
so an LLM can write one H3 Image edit prompt per keyframe and the answers come back as a plan.
Tracking with SAM 3.1 stays in h3s_swap_mask; this module is pure geometry plus file packaging.
"""
import json, os, re, zipfile
import numpy as np

FPS = 24
SAMPLE_FPS = 6.0            # people are detected 6 times a second (H3MD uses the same rate)
IOU_LINK = 0.25             # a box belongs to the same person while it overlaps this much
MIN_VISIBLE_S = 1.0         # a person counts (gets a number) when seen clearly this long
TOGETHER_S = 1.0            # first seen within this window: they appear together
EDGE = 0.01                 # a box this close to the frame edge is cut by it
KEYFRAME_MIN_GAP_S = 1.5    # keyframes are spread at least this far apart


# ---------------------------------------------------------------- geometry
def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1, ix2, iy2 = max(ax1, bx1), max(ay1, by1), min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    return inter / max(1e-6, area_a + area_b - inter)


def link_tracks(boxes_per_frame, iou_min=IOU_LINK, max_gap=2):
    """Link per-frame boxes (x1,y1,x2,y2 in 0..1) into tracks.

    A track keeps its last box for `max_gap` frames, so a short occlusion (a crossing, a lost frame)
    does not split one person into two numbers.
    """
    tracks, active = [], {}
    for idx, boxes in enumerate(boxes_per_frame):
        used = set()
        for tid, track in active.items():
            if idx - track["last"] > max_gap:
                continue
            prev = track["boxes"][-1]
            best, best_iou = None, iou_min
            for bi, box in enumerate(boxes):
                if bi in used:
                    continue
                v = iou(prev, box)
                if v >= best_iou:
                    best, best_iou = bi, v
            if best is not None:
                track["boxes"].append(boxes[best]); track["frames"].append(idx)
                track["last"] = idx; used.add(best)
        for bi, box in enumerate(boxes):
            if bi in used:
                continue
            tracks.append({"frames": [idx], "boxes": [box], "last": idx})
            active[len(tracks) - 1] = tracks[-1]
        active = {t: tr for t, tr in active.items() if idx - tr["last"] <= max_gap}
    return [t for t in tracks if t["frames"]]


def number_cast(tracks, fps=FPS, sample_fps=SAMPLE_FPS, min_visible_s=MIN_VISIBLE_S,
                together_s=TOGETHER_S):
    """Numbers in order of first appearance; tracks inside the same moment share a group number."""
    seen = sorted(((t["frames"][0] / sample_fps, i) for i, t in enumerate(tracks)), key=lambda x: x[0])
    out, number, last_start, group = [], 0, None, 1
    for start_s, i in seen:
        t = tracks[i]
        visible = t["frames"][-1] - t["frames"][0] + 1
        if visible / sample_fps < min_visible_s:
            t["number"] = 0        # a glimpse: tracked, but not a cast member
            out.append(t)
            continue
        if last_start is None or start_s - last_start > together_s:
            group += 1                       # a new group of people that appear together
        number += 1                          # every person still gets its own number
        last_start = start_s if last_start is None else last_start
        t["number"] = number
        t["group"] = group
        t["first_s"] = round(start_s, 3)
        t["visible_s"] = round(visible / sample_fps, 3)
        out.append(t)
    return out


def left_to_right(boxes):
    """1-based order of the boxes inside one frame, counted from the left edge."""
    order = sorted(range(len(boxes)), key=lambda i: boxes[i][0])
    return [i + 1 for i in order]


def box_percent(box, prec=1):
    x1, y1, x2, y2 = box
    return [round(x1 * 100, prec), round(y1 * 100, prec), round(x2 * 100, prec), round(y2 * 100, prec)]


def cut_by_edges(box, edge=EDGE):
    x1, y1, x2, y2 = box
    return bool(x1 <= edge or y1 <= edge or x2 >= 1 - edge or y2 >= 1 - edge)


def assign_face(face_box, boxes):
    """Which person a face belongs to: the box holding the face centre in its upper half (0 = none)."""
    if not boxes:
        return 0
    fx = (face_box[0] + face_box[2]) / 2
    fy = (face_box[1] + face_box[3]) / 2
    best, score = 0, 0.0
    for i, (x1, y1, x2, y2) in enumerate(boxes, start=1):
        if not (x1 <= fx <= x2 and y1 <= fy <= y2):
            continue
        # prefer the upper part of the box: faces sit there, feet do not
        rel = (fy - y1) / max(1e-6, y2 - y1)
        s = 1.0 - abs(rel - 0.15)
        if s > score:
            best, score = i, s
    return best


def pick_keyframes(tracks, duration_s, count=4, cuts=(), min_gap_s=KEYFRAME_MIN_GAP_S,
                   sample_fps=SAMPLE_FPS):
    """Evenly spaced moments, nudged off shot cuts and away from each other.

    A keyframe is a constraint for the video model, so it must show the people clearly: frames with
    the most tracked boxes win inside each slot.
    """
    if duration_s <= 0 or not tracks:
        return []
    count = max(1, int(count))
    by_frame = {}
    for t in tracks:
        if not t.get("number"):
            continue
        for f, box in zip(t["frames"], t["boxes"]):
            by_frame.setdefault(f, []).append((t["number"], box))
    if not by_frame:
        return []
    cuts = {int(round(c)) for c in cuts}
    slots = [(i + 1) * duration_s / (count + 1) for i in range(count)]
    picked, used = [], []
    for target in slots:
        base = int(round(target * sample_fps))
        best, best_score = None, -1.0
        for cand in sorted(by_frame, key=lambda f: abs(f - base)):
            if abs(cand - base) / sample_fps > 2.0:
                break
            if any(abs(cand - u) / sample_fps < min_gap_s for u in used):
                continue
            score = len(by_frame[cand]) - (5.0 if cand in cuts else 0.0) - abs(cand - base) / sample_fps * 0.1
            if score > best_score:
                best, best_score = cand, score
        if best is None:
            continue
        used.append(best)
        people = sorted(by_frame[best], key=lambda nb: nb[1][0])
        order = left_to_right([b for _n, b in people])
        picked.append({"frame": best, "at_seconds": round(best / sample_fps, 3), "people": people, "order": order})
    return picked


def cast_sheet(tracks):
    """One row per numbered person: first appearance, visible time, box on its first clear frame."""
    rows = []
    for t in sorted((t for t in tracks if t.get("number")), key=lambda t: (t["number"], t["frames"][0])):
        rows.append({"number": t["number"], "group": t.get("group", t["number"]),
                     "first_s": t.get("first_s"), "visible_s": t.get("visible_s"),
                     "box_percent": box_percent(t["boxes"][0]), "frames": len(t["frames"])})
    return rows


# ---------------------------------------------------------------- detection (needs the YOLO person model)
def detect_boxes(frames, size=480):
    """Per-frame person boxes (0..1) from the YOLO person detector the swap mask already uses.

    `frames` are uint8 RGB frames on the analysis canvas. Returns [] when the detector is absent:
    the cast is then built from whatever boxes the caller supplies (tests do exactly that).
    """
    from . import h3s_swap_mask as sm
    try:
        import folder_paths
        checkpoint = os.path.join(folder_paths.models_dir, *sm.YOLO_RELATIVE)
        if not os.path.isfile(checkpoint):
            return []
        det = sm._person_detector(checkpoint)
    except (ImportError, AttributeError, OSError):
        return []
    out = []
    for frame in frames:
        h, w = frame.shape[:2]
        found = det.predict(frame, device="cpu", imgsz=640, conf=.3, max_det=12, verbose=False)[0]
        boxes = []
        if found.boxes is not None:
            for row in found.boxes.xyxy.cpu().numpy():
                x1, y1, x2, y2 = [float(v) for v in row[:4]]
                if (x2 - x1) * (y2 - y1) < 0.002:
                    continue
                boxes.append((max(0.0, x1 / w), max(0.0, y1 / h), min(1.0, x2 / w), min(1.0, y2 / h)))
        out.append(sorted(boxes))
    return out


def analyse(boxes_per_frame, fps=FPS, sample_fps=SAMPLE_FPS, keyframes=4, cuts=()):
    """Full cast analysis from per-frame boxes: tracks, numbers, cast sheet and keyframe moments."""
    tracks = number_cast(link_tracks(boxes_per_frame), fps, sample_fps)
    duration = len(boxes_per_frame) / sample_fps
    moments = pick_keyframes(tracks, duration, keyframes, cuts, sample_fps=sample_fps)
    return {"cast": cast_sheet(tracks), "keyframes": moments, "duration_s": round(duration, 3),
            "tracks": [{"number": t.get("number", 0), "frames": t["frames"]} for t in tracks]}


# ---------------------------------------------------------------- keyframe package (zip)
README_AI = """# Keyframe package (H3ZeroStudio)

The user runs a multi-person swap. This package holds the chosen source frames and the new characters.

1. `request.json` — `package`, `characters` (each picture once with its description) and, per keyframe,
   `at_seconds`, `picture_1` (the frame), `pictures` (which character replaces which person from the left),
   `people_in_frame`, `keeps_people_from_left`, `people_from_left` (place, box_percent, cut_by_edges,
   role) and `sentence` (what the keyframe must become).
2. `keyframe_<n>.png` — the original frames. `character_picture_<n>.png` — the new people.

Write ONE H3 Image edit prompt per keyframe and save them as `{"keyframe_prompts": {"1": "...", ...}}`.
H3 Image redraws the whole picture and draws only what the text says: describe pose, hands, place, size
and overlaps of every person, because the frame alone does not carry them.
"""


def build_request(package, keyframes, characters, describe=None):
    """request.json content: the LLM reads this and answers with one prompt per keyframe."""
    describe = describe or {}
    chars = [{"picture": i + 1, "file": c.get("file"), "description": describe.get(str(i + 1), ""),
              "describe_it": not describe.get(str(i + 1))} for i, c in enumerate(characters)]
    out = {"package": package, "answer_file": package + "_answer.json", "characters": chars, "keyframes": []}
    for kf in keyframes:
        people = kf.get("people") or []
        labels = kf.get("labels") or {}
        out["keyframes"].append({
            "keyframe": len(out["keyframes"]) + 1,
            "at_seconds": kf.get("at_seconds", 0.0),
            "picture_1": f'keyframe_{len(out["keyframes"]) + 1}.png',
            "pictures": [{"picture": i + 1, "file": c.get("file"),
                          "replaces_person_from_left": c.get("replaces", i + 1),
                          "description": describe.get(str(i + 1), "")} for i, c in enumerate(characters)],
            "people_in_frame": len(people),
            "keeps_people_from_left": sorted(labels.get("keeps") or []),
            "people_from_left": [{"place": n, "box_percent": box_percent(box),
                                  "cut_by_edges": cut_by_edges(box),
                                  "role": labels.get(n, "stays")} for n, box in people],
            "sentence": kf.get("sentence", ""),
        })
    return out


def export_package(zip_path, frames, keyframes, characters, request, readme=True):
    """Write the package: request.json, keyframe PNGs, character PNGs, README (optional)."""
    import io
    from PIL import Image
    os.makedirs(os.path.dirname(str(zip_path)), exist_ok=True)
    with zipfile.ZipFile(str(zip_path), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("request.json", json.dumps(request, ensure_ascii=False, indent=2))
        for i, kf in enumerate(keyframes, start=1):
            # ключ — номер кадра видео (kf["frame"]), поэтому словарь должен быть по номерам, а не по порядку
            frame = frames.get(kf["frame"]) if isinstance(frames, dict) else frames[kf["frame"]]
            if frame is None:
                raise ValueError(f"Каст: нет кадра {kf.get('frame')!r} для ключевого кадра {i} "
                                 f"(кадры должны идти по номерам видео)")
            buf = io.BytesIO()
            Image.fromarray(np.asarray(frame).astype("uint8")).save(buf, format="PNG")
            z.writestr(f'keyframe_{kf.get("keyindex", i)}.png', buf.getvalue())
        for i, ch in enumerate(characters, start=1):
            path = ch.get("path")
            if path and os.path.isfile(path):
                z.write(path, f"character_picture_{i}.png")
        if readme:
            z.writestr("README_for_AI.md", README_AI)
    return {"ok": True, "zip": str(zip_path), "keyframes": len(keyframes), "characters": len(characters)}


def read_request(zip_path):
    with zipfile.ZipFile(str(zip_path)) as z:
        return json.loads(z.read("request.json").decode("utf-8"))


def import_answer(zip_path, answer):
    """Validate an LLM answer against the package: one non-empty prompt per keyframe."""
    request = read_request(zip_path)
    prompts = answer.get("keyframe_prompts") if isinstance(answer, dict) else None
    if not isinstance(prompts, dict):
        raise ValueError("ответ должен быть объектом {\"keyframe_prompts\": {\"1\": \"…\"}}")
    out, missing = {}, []
    for kf in request.get("keyframes", []):
        n = str(kf["keyframe"])
        text = str(prompts.get(n) or "").strip()
        if not text:
            missing.append(kf["keyframe"])
            continue
        out[n] = text
    if missing:
        raise ValueError("нет промптов для ключевых кадров: " + ", ".join(map(str, missing)))
    return {"package": request.get("package"), "keyframes": int(len(out)), "prompts": out}


def answer_file_for(zip_path):
    return re.sub(r"\.zip$", "", str(zip_path)) + "_answer.json"
