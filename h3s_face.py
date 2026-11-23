"""H3ZeroStudio Lab v6k — «Рефайн лица»: a few low-denoise sampler steps over a tracked face crop of a finished clip.

The track / crop / paste maths is a port of the needed parts of ComfyUI-H3-FaceRefine
(MIT License, Copyright (c) 2026 Carasibana — https://github.com/Carasibana/ComfyUI-H3-FaceRefine; it in turn credits
the FaceDetailer of the ComfyUI Impact Pack by ltdrdata): gap interpolation + gaussian trajectory smoothing, the fixed
size sub-pixel affine crop, the FaceDetailer-style blurred face-ellipse paste mask, the inverse-affine paste with a
weighted colour match and the detection-confidence fade. Detection is OpenCV YuNet (cv2.FaceDetectorYN, a 233 KB
onnx in models/detection, downloaded on first use) instead of InsightFace / ultralytics / SAM — no extra packages.

Pipeline (refine_clip): detect faces on every frame → follow the face the user picked (anchor frame + box) →
interpolate gaps, smooth centre and size → fixed CANVAS×CANVAS crop per frame → VAE-encode the crops as the video
latent → a few steps at low denoise with the clip's own prompt, character references (ref2va conditioning) and
sampler, the sound frozen by the noise mask → decode → feathered, colour-matched paste back into the full frames.
Pure helpers (no cv2, no ComfyUI) are unit-tested on synthetic frames."""
import hashlib
import json
import math
import os

import numpy as np
import torch
import torch.nn.functional as F

YUNET = ("detection", "face_detection_yunet_2023mar.onnx")
DET_SIDE = 640          # detection runs on a copy downsized to this longest side (YuNet is fast and scale-robust)
CANVAS = 768            # fixed crop canvas fed to the model
SMOOTH = 21             # centre smoothing window (frames, gaussian sigma = window/6) — FaceRefine default (~0.9 s)
SIZE_SMOOTH = 51        # size smoothing window — FaceRefine default (size jitter reads as shimmer; zooms are slow)
DILATION = 16           # paste-mask growth in canvas px before the blur (FaceRefine / Impact bbox dilation)
# face-size denoise scaling (FaceRefine «H3 Per-Frame Denoise» defaults, applied per clip here): a tiny face has no
# detail to keep and wants a strong pass, a big one is gentle. The slider is the denoise of a large face (>= 120 px);
# a face of <= 30 px gets it / 0.35 (FaceRefine multipliers 1.0 … 0.35), never above DENOISE_CAP.
FACE_PX_SMALL, FACE_PX_LARGE, MULT_SMALL, MULT_LARGE, DENOISE_CAP = 30.0, 120.0, 1.0, 0.35, 0.4
VER = "fr1"
PICK_SCORE = 0.75       # the picker lists only confident faces; the track (0.6) follows them through harder frames


def log(msg):
    print(f"[H3ZeroStudio face] {msg}", flush=True)


# ---------------------------------------------------------------- parameters
def normalize_fr(fr):
    """«Рефайн лица» parameters — see h3s_core.normalize_fr (the pure copy used by the project normaliser)."""
    from . import h3s_core as core
    return core.normalize_fr(fr)


def face_refine_key(base_key, fr, seed):
    """Cache key of the face-refined copy of a take: base key + "F" + a hash of the parameters (and the seed)."""
    blob = json.dumps({"v": VER, "fr": fr, "seed": int(seed)}, sort_keys=True)
    return f"{base_key}F{hashlib.sha256(blob.encode()).hexdigest()[:10]}"


# ---------------------------------------------------------------- trajectory (port of FaceRefine _interp_gaps / _smooth)
def interp_gaps(vals, valid):
    """Fill frames without a detection by linear interpolation; hold at the ends."""
    vals, valid = np.asarray(vals, dtype=np.float64), np.asarray(valid, dtype=bool)
    idx = np.arange(len(vals))
    if not valid.any():
        return np.zeros(len(vals), dtype=np.float64)
    return np.interp(idx, idx[valid], vals[valid])


def smooth(vals, window):
    """Gaussian smoothing with reflected edges (sigma = window/6). window <= 1: no-op."""
    vals = np.asarray(vals, dtype=np.float64)
    if window <= 1 or len(vals) < 3:
        return vals
    window = min(int(window), len(vals))
    if window % 2 == 0:
        window += 1
    if window > len(vals):
        window -= 2
    if window < 3:
        return vals
    pad = window // 2
    padded = np.pad(vals, pad, mode="reflect")
    x = np.arange(window, dtype=np.float64) - pad
    sigma = max(window / 6.0, 0.5)
    k = np.exp(-(x ** 2) / (2.0 * sigma ** 2))
    k /= k.sum()
    return np.convolve(padded, k, mode="valid")[:len(vals)]


def link_track(dets, anchor_frame, anchor_box):
    """Follow one face through per-frame detections.
    dets: list (per frame) of lists of (x, y, w, h, score) in pixels; anchor_box (x, y, w, h) pixels at anchor_frame.
    Walks forward and backward from the anchor; on every frame takes the detection closest to the last accepted
    position (centre distance / face size), accepting it when near enough — the reach grows with the length of the
    gap (a face that was hidden for a while may reappear a bit further). Returns a list of (x, y, w, h) or None."""
    n = len(dets)
    out = [None] * n
    if n == 0:
        return out
    f0 = int(max(0, min(n - 1, anchor_frame)))

    def centre(b):
        return b[0] + b[2] / 2.0, b[1] + b[3] / 2.0, max(1.0, (b[2] + b[3]) / 2.0)

    def best(cands, ref, gap):
        cx, cy, sz = centre(ref)
        reach = min(2.5, 0.9 + 0.15 * gap)
        top, tc = None, 1e9
        for d in cands:
            dx, dy, ds = centre(d)
            ratio = ds / sz
            if ratio < 0.5 or ratio > 2.0:
                continue
            c = math.hypot(dx - cx, dy - cy) / sz + abs(math.log(ratio)) * 0.5
            if c < tc:
                top, tc = d, c
        return top if top is not None and tc <= reach else None

    a = best(dets[f0], anchor_box, 2) if dets[f0] else None
    start_ref = tuple(float(x) for x in (a[:4] if a else anchor_box[:4]))
    out[f0] = start_ref if a else None
    for rng in (range(f0 + 1, n), range(f0 - 1, -1, -1)):
        ref, gap = start_ref, 0
        for f in rng:
            d = best(dets[f], ref, gap) if dets[f] else None
            if d is not None:
                out[f] = tuple(float(x) for x in d[:4])
                ref, gap = out[f], 0
            else:
                gap += 1
    return out


def plan_crops(track, W, H, crop_factor=2.5, canvas=CANVAS, smooth_window=SMOOTH, size_window=SIZE_SMOOTH):
    """Per-frame square crop boxes from a face track (FaceRefine track node, square canvas).
    Returns dict(boxes [(x, y, bw, bh) float], face_rect [(fx, fy, fw, fh) in canvas px], weights [0..1],
    detected [bool], canvas) or None when the face is never found."""
    n = len(track)
    valid = np.array([b is not None for b in track], dtype=bool)
    if not valid.any():
        return None
    cx = np.array([b[0] + b[2] / 2.0 if b else 0.0 for b in track])
    cy = np.array([b[1] + b[3] / 2.0 if b else 0.0 for b in track])
    fw = np.array([b[2] if b else 0.0 for b in track])
    fh = np.array([b[3] if b else 0.0 for b in track])
    cx = smooth(interp_gaps(cx, valid), smooth_window)
    cy = smooth(interp_gaps(cy, valid), smooth_window)
    fw = smooth(interp_gaps(fw, valid), size_window)
    fh = smooth(interp_gaps(fh, valid), size_window)
    sz = np.maximum(fw, fh)
    boxes, rects = [], []
    for i in range(n):
        bh = float(sz[i] * crop_factor)
        bh = max(8.0, min(bh, float(W), float(H)))
        bw = bh
        # FLOAT box — integer rounding is the dominant residual jitter once the trajectory is smoothed
        x = min(max(cx[i] - bw / 2.0, 0.0), max(0.0, W - bw))
        y = min(max(cy[i] - bh / 2.0, 0.0), max(0.0, H - bh))
        boxes.append((float(x), float(y), float(bw), float(bh)))
        sc = canvas / bh
        rects.append((float((cx[i] - fw[i] / 2.0 - x) * sc), float((cy[i] - fh[i] / 2.0 - y) * sc),
                      float(fw[i] * sc), float(fh[i] * sc)))
    # detection-confidence fade: where the face is lost (turned away) the composite fades out over ~half a second
    weights = np.clip(smooth(valid.astype(np.float64), max(9, smooth_window // 2)), 0.0, 1.0)
    return {"boxes": boxes, "face_rect": rects, "weights": [float(w) for w in weights],
            "detected": [bool(v) for v in valid], "canvas": int(canvas), "src": (int(W), int(H))}


# ---------------------------------------------------------------- crop / masks / paste (ports)
def affine_crop(frames, boxes, canvas=CANVAS, chunk=16):
    """Sub-pixel crop + resize in one bilinear sample. frames [F,H,W,C] float -> [F,canvas,canvas,3]."""
    Fn, H, W = frames.shape[0], frames.shape[1], frames.shape[2]
    out = torch.empty((Fn, canvas, canvas, 3), dtype=torch.float32)
    for c0 in range(0, Fn, chunk):
        c1 = min(Fn, c0 + chunk)
        th = torch.zeros((c1 - c0, 2, 3), dtype=torch.float32)
        for j, i in enumerate(range(c0, c1)):
            x, y, bw, bh = boxes[i]
            th[j, 0, 0] = bw / W
            th[j, 0, 2] = (2.0 * x + bw) / W - 1.0
            th[j, 1, 1] = bh / H
            th[j, 1, 2] = (2.0 * y + bh) / H - 1.0
        src = frames[c0:c1, ..., :3].movedim(-1, 1).float()
        grid = F.affine_grid(th, (c1 - c0, 3, canvas, canvas), align_corners=False)
        out[c0:c1] = F.grid_sample(src, grid, mode="bilinear", padding_mode="border", align_corners=False).movedim(1, -1)
    return out


def gaussian_blur_mask(mask, feather):
    """Separable gaussian blur of a [N,1,H,W] mask (Impact Pack feather_mask: sigma = size/6 of a 2f+1 kernel)."""
    if feather <= 0:
        return mask
    k = 2 * int(feather) + 1
    shortest = min(mask.shape[-2], mask.shape[-1])
    if shortest <= k:
        k = max(3, int(shortest / 2) | 1)
    sigma = max(k / 6.0, 0.5)
    x = torch.arange(k, dtype=torch.float32) - k // 2
    g = torch.exp(-(x ** 2) / (2 * sigma ** 2))
    g = (g / g.sum()).to(mask.dtype)
    pad = k // 2
    m = F.conv2d(F.pad(mask, (pad, pad, 0, 0), mode="replicate"), g.view(1, 1, 1, k))
    return F.conv2d(F.pad(m, (0, 0, pad, pad), mode="replicate"), g.view(1, 1, k, 1))


def face_mask(canvas, rect, feather, dilation=None):
    """FaceDetailer-style paste mask in canvas space (FaceRefine face_ellipse): a solid ellipse over the face box,
    dilated by `dilation` canvas px, then gaussian-blurred. The generous crop gives the sampler context; only the face
    itself is pasted back. -> [1,1,c,c]."""
    fx, fy, fw_, fh_ = rect
    dil = DILATION if dilation is None else dilation
    fx, fy, fw_, fh_ = fx - dil, fy - dil, fw_ + 2 * dil, fh_ + 2 * dil
    yy = torch.arange(canvas, dtype=torch.float32).view(-1, 1)
    xx = torch.arange(canvas, dtype=torch.float32).view(1, -1)
    ccx, ccy = fx + fw_ / 2.0, fy + fh_ / 2.0
    rx, ry = max(fw_ / 2.0, 1.0), max(fh_ / 2.0, 1.0)
    m = ((((xx - ccx) / rx) ** 2 + ((yy - ccy) / ry) ** 2) <= 1.0).float().view(1, 1, canvas, canvas)
    return gaussian_blur_mask(m, feather).clamp(0, 1)


def denoise_for(base, face_px, auto=True):
    """Effective denoise of the pass: `base` is the large-face value; auto scales it up for small faces
    (FaceRefine per-frame denoise, linear between FACE_PX_SMALL and FACE_PX_LARGE, here on the clip's median face)."""
    if not auto:
        return float(base)
    t = min(1.0, max(0.0, (float(face_px) - FACE_PX_SMALL) / (FACE_PX_LARGE - FACE_PX_SMALL)))
    mult = MULT_SMALL + (MULT_LARGE - MULT_SMALL) * t
    return round(min(DENOISE_CAP, float(base) * mult / MULT_LARGE), 3)


def stitch(frames, crops, plan, feather=6, colour=1.0, blend=1.0, chunk=8):
    """Paste refined crops back: inverse affine grid, blurred face-ellipse mask, weighted colour match (mean / std
    inside the mask, pulled `colour` of the way to the original), per-frame detection fade. frames [F,H,W,3] float."""
    Fn, H, W = frames.shape[0], frames.shape[1], frames.shape[2]
    cv = int(plan["canvas"])
    boxes, rects, weights = plan["boxes"], plan["face_rect"], plan["weights"]
    out = frames[..., :3].float().clone()
    for c0 in range(0, Fn, chunk):
        c1 = min(Fn, c0 + chunk)
        n = c1 - c0
        masks = []
        for i in range(c0, c1):
            # feather is given in SOURCE pixels; the mask lives in canvas space -> scale by this frame's magnification
            f_can = max(1, min(cv // 3, int(round(feather * cv / max(boxes[i][3], 1.0)))))
            masks.append(face_mask(cv, rects[i], f_can))
        mask_can = torch.cat(masks, 0)
        th = torch.zeros((n, 2, 3), dtype=torch.float32)
        for j, i in enumerate(range(c0, c1)):
            x, y, bw, bh = (float(v) for v in boxes[i])
            th[j, 0, 0] = W / bw
            th[j, 0, 2] = (W - 2.0 * x) / bw - 1.0
            th[j, 1, 1] = H / bh
            th[j, 1, 2] = (H - 2.0 * y) / bh - 1.0
        grid = F.affine_grid(th, (n, 3, H, W), align_corners=False)
        patch = F.grid_sample(crops[c0:c1, ..., :3].movedim(-1, 1).float(), grid, mode="bilinear", padding_mode="zeros", align_corners=False)
        m = F.grid_sample(mask_can, grid, mode="bilinear", padding_mode="zeros", align_corners=False).clamp(0, 1)
        patch, m = patch.movedim(1, -1), m.movedim(1, -1)
        base = out[c0:c1]
        if colour > 0:
            wsum = m.sum(dim=(1, 2), keepdim=True).clamp_min(1e-6)
            bmu = (base * m).sum(dim=(1, 2), keepdim=True) / wsum
            pmu = (patch * m).sum(dim=(1, 2), keepdim=True) / wsum
            bsd = (((base - bmu) ** 2 * m).sum(dim=(1, 2), keepdim=True) / wsum).sqrt().clamp_min(1e-6)
            psd = (((patch - pmu) ** 2 * m).sum(dim=(1, 2), keepdim=True) / wsum).sqrt().clamp_min(1e-6)
            adj = (patch - pmu) * (bsd / psd) + bmu
            patch = (patch + (adj - patch) * float(colour)).clamp(0, 1)
        wv = torch.tensor([float(blend) * float(weights[i]) for i in range(c0, c1)], dtype=torch.float32).view(n, 1, 1, 1)
        mm = m * wv
        out[c0:c1] = (1.0 - mm) * base + mm * patch
    return out


# ---------------------------------------------------------------- detection (OpenCV YuNet)
def yunet_path(download=True, wait=90.0):
    """Path of the YuNet onnx; downloads it (233 KB, the «Загрузка моделей» list) when missing. None if unavailable."""
    from . import h3s_models_dl as dl
    p = dl.find_installed(YUNET[0], [YUNET[1]])
    if p or not download:
        return p
    import time
    r = dl.start("yunet")
    if r.get("path"):
        return r["path"]
    t0 = time.time()
    while time.time() - t0 < wait:
        j = (dl.job_status("yunet") or {}).get("job") or {}
        if j.get("state") in ("done", "error", "cancelled"):
            break
        time.sleep(0.3)
    return dl.find_installed(YUNET[0], [YUNET[1]])


def have_cv2():
    try:
        import cv2
        return hasattr(cv2, "FaceDetectorYN")
    except Exception:
        return False


class Detector:
    """cv2.FaceDetectorYN on a downsized copy of each frame; boxes come back in source pixels."""

    def __init__(self, path, score=0.6):
        import cv2
        self.cv2 = cv2
        self.det = cv2.FaceDetectorYN.create(path, "", (320, 320), score, 0.3, 50)
        self.size = None

    def __call__(self, frame_u8):
        """frame_u8: [H,W,3] RGB uint8 numpy -> [(x, y, w, h, score), ...] in source px."""
        cv2 = self.cv2
        H, W = frame_u8.shape[:2]
        sc = min(1.0, DET_SIDE / max(H, W))
        w, h = max(16, int(round(W * sc))), max(16, int(round(H * sc)))
        img = cv2.resize(frame_u8, (w, h), interpolation=cv2.INTER_AREA) if (w, h) != (W, H) else frame_u8
        if self.size != (w, h):
            self.det.setInputSize((w, h))
            self.size = (w, h)
        _, faces = self.det.detect(np.ascontiguousarray(img[..., ::-1]))
        out = []
        for f in (faces if faces is not None else []):
            x, y, fw, fh = (float(v) / sc for v in f[:4])
            if fw > 4 and fh > 4:
                out.append((x, y, fw, fh, float(f[-1])))
        return out


def to_u8(fr):
    return (fr[..., :3].clamp(0, 1) * 255.0 + 0.5).to(torch.uint8).cpu().numpy()


def detect_frames(frames, det=None, progress=None, every=8):
    """Per-frame detections of a [F,H,W,3] float clip. progress(done, total) every `every` frames (and at the end)."""
    if det is None:
        p = yunet_path()
        if not p:
            raise ValueError("H3ZeroStudio: «Рефайн лица»: нет модели поиска лиц YuNet (models/detection/" + YUNET[1] + ")")
        det = Detector(p)
    n, out = int(frames.shape[0]), []
    for i in range(n):
        out.append(det(to_u8(frames[i])))
        if progress is not None and ((i + 1) % every == 0 or i + 1 == n):
            progress(i + 1, n)
    return out


def group_faces(samples, n_frames):
    """Faces for the picker: detections on a few sampled frames grouped into people (same linking as the track).
    samples: [(frame_index, [(x, y, w, h, score), ...])]. Returns [{frame, box(px), score, seen}] biggest first."""
    groups = []   # each: list of (frame, det)
    for f, dets in samples:
        used = set()
        for g in groups:
            ref = g[-1][1]
            cx, cy, sz = ref[0] + ref[2] / 2, ref[1] + ref[3] / 2, max(1.0, (ref[2] + ref[3]) / 2)
            top, tc = None, 1e9
            for k, d in enumerate(dets):
                if k in used:
                    continue
                dsz = max(1.0, (d[2] + d[3]) / 2)
                if not 0.5 <= dsz / sz <= 2.0:
                    continue
                c = math.hypot(d[0] + d[2] / 2 - cx, d[1] + d[3] / 2 - cy) / sz
                if c < tc:
                    top, tc = k, c
            if top is not None and tc <= 1.6:
                used.add(top)
                g.append((f, dets[top]))
        for k, d in enumerate(dets):
            if k not in used:
                groups.append([(f, d)])
    out = []
    for g in groups:
        f, d = max(g, key=lambda e: e[1][4] * e[1][2] * e[1][3])
        out.append({"frame": int(f), "box": [float(x) for x in d[:4]], "score": round(float(d[4]), 3), "seen": len(g)})
    out.sort(key=lambda r: (-r["seen"], -r["box"][2] * r["box"][3]))
    return out[:8]


def detect_for_picker(path, samples=8, thumb=128):
    """Faces in a clip file for the «Рефайн лица» window: sampled frames → grouped faces with a jpeg thumbnail each.
    Returns dict(faces=[{id, frame, box (0..1 of the frame), score, seen, thumb (view ref)}], w, h, frames)."""
    if not have_cv2():
        raise ValueError("H3ZeroStudio: «Рефайн лица»: нет OpenCV (cv2) — нужен пакет opencv-python")
    p = yunet_path()
    if not p:
        raise ValueError("H3ZeroStudio: «Рефайн лица»: модель YuNet не скачалась — «Настройки» → «Загрузка моделей»")
    import av
    import cv2
    from . import h3s_gen as gen
    from . import h3s_projfiles as pf
    import folder_paths
    with av.open(path) as c:
        st = c.streams.video[0]
        frames = [fr.to_ndarray(format="rgb24") for fr in c.decode(st)]
    n = len(frames)
    if not n:
        raise ValueError("H3ZeroStudio: «Рефайн лица»: пустое видео")
    H, W = frames[0].shape[:2]
    det = Detector(p, PICK_SCORE)
    idx = sorted({int(round(k * (n - 1) / max(1, samples - 1))) for k in range(samples)})
    found = group_faces([(i, det(frames[i])) for i in idx], n)
    tag = hashlib.sha256(f"{VER}|{PICK_SCORE}|{os.path.abspath(path)}|{gen.file_sig(path)}".encode()).hexdigest()[:12]
    pid = pf.project_of(path)
    sub = pf.sub_of(pid, "face") if pid else pf.ROOT + "/_face"
    d = os.path.join(folder_paths.get_output_directory(), *sub.split("/"))
    os.makedirs(d, exist_ok=True)
    out = []
    for k, fc in enumerate(found):
        x, y, w, h = fc["box"]
        s = max(w, h) * 1.7
        cx, cy = x + w / 2, y + h / 2
        x0, y0 = int(max(0, cx - s / 2)), int(max(0, cy - s / 2))
        x1, y1 = int(min(W, cx + s / 2)), int(min(H, cy + s / 2))
        crop = frames[fc["frame"]][y0:y1, x0:x1]
        name = f"face_{tag}_{k}.jpg"
        if crop.size:
            crop = cv2.resize(crop, (thumb, max(1, int(round(thumb * crop.shape[0] / max(1, crop.shape[1]))))), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(d, name), crop[..., ::-1], [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        out.append({"id": k, "frame": fc["frame"], "box": [round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4)],
                    "score": fc["score"], "seen": fc["seen"], "samples": len(idx),
                    "thumb": {"filename": name, "subfolder": sub, "type": "output"}})
    return {"faces": out, "w": W, "h": H, "frames": n}


# ---------------------------------------------------------------- the refine pass
def refine_clip(model, clip, vae, project, index, frames, a, fr, ref_images, step_cb=None, notify_log=None,
                stage=None, live_factory=None):
    """«Рефайн лица» of a finished clip. frames: its decoded pixels [F,H,W,3] (0..1), a: its audio latent (kept 1:1).
    The crops are re-sampled with the clip's prompt, character references (the very ref2va conditioning it was made
    with, here on the crop canvas) and sampler / cfg / scheduler / shift; `fr["denoise"]` of the schedule over
    `fr["steps"]` steps. Returns (frames [F,H,W,3], info dict).
    v6l: stage(name, **kw) reports «detect» (frames done / total) → «refine» → «paste»; live_factory(model) gives the
    per-step live preview (LivePreview: the sampler's x0 of the 768² face crop) — the face pass had none before."""
    import comfy.model_management
    import comfy.nested_tensor
    import comfy.sample
    from . import h3s_core as core
    from . import h3s_gen as gen
    say = notify_log or log
    Fn, H, W = int(frames.shape[0]), int(frames.shape[1]), int(frames.shape[2])
    fb = fr["face"]["box"]
    anchor = (fb[0] * W, fb[1] * H, fb[2] * W, fb[3] * H)
    st = stage or (lambda *_a, **_k: None)
    st("detect", fd=0, fn=Fn)
    dets = detect_frames(frames, progress=lambda k, n: st("detect", fd=k, fn=n))
    track = link_track(dets, min(Fn - 1, fr["face"]["frame"]), anchor)
    plan = plan_crops(track, W, H, fr["crop"], canvas=CANVAS)
    if plan is None:
        raise ValueError(f"H3ZeroStudio: «Рефайн лица»: лицо не найдено в отрезке {index + 1}")
    hit = sum(plan["detected"])
    mags = [CANVAS / b[3] for b in plan["boxes"]]
    face_px = float(np.median([r[3] * b[3] / CANVAS for r, b in zip(plan["face_rect"], plan["boxes"])]))
    den = denoise_for(fr["denoise"], face_px, fr.get("auto", True))
    say(f"segment {index + 1} [face refine]: face found on {hit}/{Fn} frames, face ~{face_px:.0f} px, crop {CANVAS}², "
        f"magnification {min(mags):.2f}–{max(mags):.2f}×, {fr['steps']} steps at denoise {den}"
        + (f" (base {fr['denoise']}, scaled by face size)" if den != fr["denoise"] else ""))
    crops = affine_crop(frames, plan["boxes"], CANVAS)
    s = project["settings"]
    p = core.pass_params(project, index, "full")
    dev = comfy.model_management.intermediate_device()
    video = vae.encode(crops).float().to(dev)
    if a is None or int(a.shape[-1]) == 0:
        raise ValueError("H3ZeroStudio: «Рефайн лица»: у клипа нет звукового латента")
    audio = a.to(dev).float().clone()
    images = list(ref_images)[:core.MAX_REF_IMAGES]
    seg = project["segments"][index]
    prompt = core.compose_prompt(project, index, video=False)
    cards = gen.holder_cards(project, seg, vae, "refine")
    # references at least as detailed as when the clip was generated (its own canvas), never below the crop canvas —
    # identity comes from them (Minimax_Studio feeds them at «max» for the same reason; «max» costs far more tokens)
    rw, rh = (W, H) if W * H >= CANVAS * CANVAS else (CANVAS, CANVAS)
    pos = gen.encode_cond(clip, vae, prompt, images, rw, rh, s.get("ref_size", "match"), None, None, cards)
    neg = pos if p["cfg"] == 1.0 else gen.encode_cond(clip, vae, s.get("negative") or "", images, rw, rh, s.get("ref_size", "match"), None, None, cards)
    m = gen.apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    vmask = torch.ones([1, 1] + list(video.shape[2:]))
    amask = torch.zeros([1, 1, 2, int(audio.shape[-1])])   # the sound stays exactly as it was
    noise_mask = comfy.nested_tensor.NestedTensor((vmask, amask))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    seed = int(p["seed"])
    noise = comfy.sample.prepare_noise(samples, seed)

    live = None
    if live_factory is not None:
        try:
            live = live_factory(m)
            live.set_sigmas(gen.preview.preview_sigmas(m, int(fr["steps"]), p["sampler"], p["scheduler"], den))
        except Exception as e:   # the preview never breaks the pass
            say(f"segment {index + 1} [face refine]: live preview off — {e}")
            live = None
    st("refine", steps=int(fr["steps"]), denoise=den, canvas=CANVAS, face_px=round(face_px), hit=hit, fn=Fn)

    def cb(step, x0, x, total):
        comfy.model_management.throw_exception_if_processing_interrupted()
        if live is not None:
            try:
                live(step, x0, x, total)
            except comfy.model_management.InterruptProcessingException:
                raise
            except Exception:
                pass
        if step_cb is not None:
            step_cb(step, total, live.dyn if live is not None else {})
    out = gen.sample_pass(m, noise, int(fr["steps"]), p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples,
                          den, cb, seed, noise_mask=noise_mask)
    ov, _oa = out.unbind()
    st("paste", fn=Fn)
    refined = gen.decode_video(vae, ov.to(dev))
    if refined.shape[0] != Fn:   # the VAE frame grid: trim / hold the last frame
        refined = refined[:Fn] if refined.shape[0] > Fn else torch.cat([refined, refined[-1:].expand(Fn - refined.shape[0], -1, -1, -1)])
    if tuple(refined.shape[1:3]) != (CANVAS, CANVAS):
        refined = F.interpolate(refined.movedim(-1, 1), size=(CANVAS, CANVAS), mode="bilinear", align_corners=False).movedim(1, -1)
    res = stitch(frames.float().cpu(), refined.float().cpu(), plan, fr["feather"], fr["colour"])
    return res.clamp(0, 1), {"detected": hit, "frames": Fn, "mag": [round(min(mags), 2), round(max(mags), 2)],
                             "face_px": round(face_px), "denoise": den}
