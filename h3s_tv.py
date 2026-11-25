"""AI TV Studio: brands, scripted orders, batch scenes, overlays and playlists.

This module orchestrates ordinary H3ZeroStudio projects instead of duplicating the generation
engine: every scene of an order is a normal project (same preset, cache, takes, upscale), and the
studio only plans the script, submits the batch and assembles the result.
"""
import json, math, os, re, shutil, subprocess, time
import numpy as np

FPS = 24
GRID = 17                      # H3 packs frames as 17k+5
TRAINED = (124, 362)           # trained frame range of H3 (5.1–15.1 s at 24 fps)
PACE = {"calm": (204, 362), "medium": (124, 243), "fast": (124, 158)}
CTA_EVERY = 4                  # a CTA/loop slot after every N story scenes


# ------------------------------------------------------------------ storage
def root():
    """`output/h3labstudio/_tv` — brands, orders and rendered playlists."""
    try:
        import folder_paths
        base = folder_paths.get_output_directory()
    except Exception:
        base = os.path.join(os.getcwd(), "output")
    return os.path.join(base, "h3labstudio", "_tv")


def _dir(kind):
    p = os.path.join(root(), kind)
    os.makedirs(p, exist_ok=True)
    return p


def _load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return data


def slug(text, fallback="item"):
    s = re.sub(r"[^0-9a-zA-Zа-яА-Я_-]+", "-", str(text or "").strip().lower()).strip("-")
    return (s or fallback)[:48]


# ------------------------------------------------------------------ brands
DEFAULT_BRAND = {
    "id": "", "name": "", "accent": "#3b5bdb", "logo": "", "logo_pos": "br", "logo_margin": 32,
    "logo_opacity": 0.9, "cta_text": "", "cta_seconds": 6, "style_prefix": "",
    "language": "ru", "casts": [], "scenes": [], "notes": "",
    "render": {},   # model/clip/vae/steps used for every scene of the order
}

DEFAULT_RENDER = {"model": "", "clip": "", "vae": "minimax_h3_video_vae_fp16.safetensors",
                  "audio_vae": "minimax_h3_audio_vae_fp32.safetensors", "width": 1344, "height": 768,
                  "steps": 8, "piflow_steps": 0, "sampler": "", "scheduler": "", "seed": 0,
                  "no_audio": False, "accel": {}}


def normalize_render(raw):
    out = dict(DEFAULT_RENDER)
    raw = raw or {}
    for k in out:
        if k in raw and raw[k] is not None:
            out[k] = raw[k]
    out["width"] = int(max(256, min(4096, float(out["width"] or 1344))))
    out["height"] = int(max(256, min(4096, float(out["height"] or 768))))
    out["steps"] = int(max(1, min(60, float(out["steps"] or 8))))
    out["piflow_steps"] = int(out["piflow_steps"] or 0)
    out["piflow_steps"] = out["piflow_steps"] if out["piflow_steps"] in (2, 4) else 0
    out["no_audio"] = bool(out["no_audio"])
    out["seed"] = int(out["seed"] or 0)
    return out


def normalize_brand(raw):
    b = dict(DEFAULT_BRAND)
    raw = raw or {}
    for k in b:
        if k in raw and raw[k] is not None:
            b[k] = raw[k]
    b["name"] = str(b["name"]).strip()[:80]
    b["id"] = slug(b["id"] or b["name"], "brand")
    b["accent"] = str(b["accent"])[:16]
    b["logo_pos"] = b["logo_pos"] if b["logo_pos"] in ("tl", "tr", "bl", "br") else "br"
    b["logo_margin"] = int(max(0, min(400, float(b["logo_margin"] or 0))))
    b["logo_opacity"] = float(max(0.0, min(1.0, float(b["logo_opacity"] if b["logo_opacity"] is not None else 0.9))))
    b["cta_seconds"] = float(max(0.0, min(60.0, float(b["cta_seconds"] or 0))))
    b["style_prefix"] = str(b["style_prefix"])[:600]
    b["language"] = str(b["language"] or "ru")[:8]
    b["casts"] = [str(x) for x in (b["casts"] or [])][:64]
    b["scenes"] = [str(x) for x in (b["scenes"] or [])][:128]
    b["cta_text"] = str(b["cta_text"])[:200]
    b["render"] = normalize_render(b.get("render"))
    return b


def brands():
    out = [_load(os.path.join(_dir("brands"), f), None) for f in sorted(os.listdir(_dir("brands")))
           if f.endswith(".json")]
    return [normalize_brand(b) for b in out if b]


def brand_get(bid):
    return next((b for b in brands() if b["id"] == bid), None)


def brand_save(raw):
    b = normalize_brand(raw)
    if not b["name"]:
        raise ValueError("AI TV: у бренда должно быть имя")
    _write(os.path.join(_dir("brands"), b["id"] + ".json"), b)
    return b


def brand_delete(bid):
    path = os.path.join(_dir("brands"), slug(bid) + ".json")
    if os.path.isfile(path):
        os.remove(path)
    return {"deleted": slug(bid)}


# ------------------------------------------------------------------ script planning
def snap(frames, low=None, high=None):
    """Snap a frame count to the H3 grid 17k+5 inside the trained range."""
    lo = TRAINED[0] if low is None else int(low)
    hi = TRAINED[1] if high is None else int(high)
    k = (int(frames) - 5) / GRID
    k = max((lo - 5) // GRID, min((hi - 5) // GRID, int(round(k))))
    return GRID * k + 5


def snap_down(frames, low=None, high=None):
    """Largest grid-legal scene length not exceeding `frames` (never above the trained range)."""
    lo = TRAINED[0] if low is None else int(low)
    hi = TRAINED[1] if high is None else int(high)
    k = (int(frames) - 5) // GRID
    k = max((lo - 5) // GRID, min((hi - 5) // GRID, k))
    return GRID * k + 5


def plan(minutes, pace="medium", cta_text="", language="ru"):
    """Split a program into H3-legal scenes: story beats plus CTA slots.

    Every scene is on the H3 grid (17k+5) and inside the trained range, so the sum lands within one
    17-frame block (~0.7 s) of the requested duration — an exact total is not representable on the grid.
    """
    total = int(round(float(minutes) * 60 * FPS))
    low, high = PACE.get(pace if pace in PACE else "medium", PACE["medium"])
    scenes, left, i = [], total, 0
    while left > 0:
        want = snap_down(max(left, TRAINED[0]), low, high)   # a legal scene, may overrun into the tail
        kind = "cta" if (cta_text and i and i % CTA_EVERY == 0) else "story"
        scenes.append({"index": len(scenes), "kind": kind, "frames": int(want),
                       "seconds": round(want / FPS, 3), "text": cta_text if kind == "cta" else "",
                       "prompt": "", "cast": [], "scene": "", "link": "cut" if not scenes else "extend"})
        left -= want
        i += 1
    for s in scenes:
        s["language"] = language
    return scenes


def exported_frames(scenes, total=None):
    """Frame counts actually delivered: the last scene is cut at the order's exact frame budget."""
    budget = int(total) if total else sum(s["frames"] for s in scenes)
    out, done = [], 0
    for s in scenes:
        n = min(int(s["frames"]), max(0, budget - done))
        out.append(n)
        done += n
    return out


def order_create(name, brand_id, minutes, pace="medium", cast=None, prompt_prefix=""):
    b = brand_get(brand_id)
    if not b:
        raise ValueError("AI TV: бренд не найден: " + str(brand_id))
    text = b.get("cta_text") or ""
    scenes = plan(minutes, pace, text, b.get("language", "ru"))
    prefix = (b.get("style_prefix") or "") + (" " + prompt_prefix if prompt_prefix else "")
    for s in scenes:
        s["cast"] = [c for c in (cast or b.get("casts") or [])]
        base = s["text"] or (f"[Shot 1] {prefix}".strip())
        s["prompt"] = base
    actual = round(sum(s["frames"] for s in scenes) / FPS, 3)
    order = {"id": slug(name, "order") + "-" + str(int(time.time()))[-5:], "name": str(name or "")[:80],
             "brand": b["id"], "minutes": float(minutes), "pace": pace, "scenes": scenes,
             "actual_seconds": actual, "frames_total": int(sum(s["frames"] for s in scenes)),
             "frames_requested": int(round(float(minutes) * 60 * FPS)),
             "created": time.time(), "status": "draft", "playlist": [], "dupes": []}
    _write(os.path.join(_dir("orders"), order["id"] + ".json"), order)
    return order


def orders():
    out = [_load(os.path.join(_dir("orders"), f), None) for f in sorted(os.listdir(_dir("orders")))
           if f.endswith(".json")]
    return [o for o in out if o]


def order_get(oid):
    return _load(os.path.join(_dir("orders"), slug(oid) + ".json"), None)


def order_delete(oid):
    path = os.path.join(_dir("orders"), slug(oid) + ".json")
    if os.path.isfile(path):
        os.remove(path)
    return {"deleted": slug(oid)}


def order_update(order):
    return _write(os.path.join(_dir("orders"), slug(order["id"]) + ".json"), order)


def scene_project_id(order_id, index):
    return f"tv_{slug(order_id)}_{index:02d}"


# ------------------------------------------------------------------ duplicates
def dhash(path, samples=4, size=8):
    """Perceptual hash of a video: 64-bit dHash per sampled frame, averaged bit by bit."""
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    bits, levels = [], []
    try:
        for k in range(samples):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (k + 1) / (samples + 1)) if total else k)
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (size + 1, size), interpolation=cv2.INTER_AREA)
            bits.append((small[:, 1:] > small[:, :-1]).astype(np.uint8).ravel())
            levels.append(float(small.mean()))
    finally:
        cap.release()
    if not bits:
        return None
    mean = np.mean(np.stack(bits), axis=0)
    luma = int(np.clip(np.mean(levels) if levels else 0, 0, 255))   # flat scenes differ by brightness alone
    return "".join("1" if v >= 0.5 else "0" for v in mean) + format(luma, "08b")


def hamming(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)


def dupes(paths, threshold=6):
    """Groups of videos that look the same (dHash distance ≤ threshold, 64 bits)."""
    hashes = {p: dhash(p) for p in paths}
    used, groups = set(), []
    keys = [p for p in paths if hashes.get(p)]
    for i, a in enumerate(keys):
        if a in used:
            continue
        group = [a]
        for b in keys[i + 1:]:
            if b in used:
                continue
            if hamming(hashes[a], hashes[b]) <= threshold:
                group.append(b); used.add(b)
        if len(group) > 1:
            groups.append({"distance": min(hamming(hashes[group[0]], hashes[x]) for x in group[1:]),
                           "files": group})
        used.add(a)
    return {"checked": len(keys), "groups": groups}


# ------------------------------------------------------------------ overlays, loops, playlists
def overlay_cmd(video, out, brand, logo=None, seconds=None):
    """ffmpeg command: logo (PNG) + CTA text over the finished MP4. No re-generation involved."""
    b = normalize_brand(brand)
    pos, m = b["logo_pos"], b["logo_margin"]
    x = f"{m}" if pos in ("tl", "bl") else f"main_w-overlay_w-{m}"
    y = f"{m}" if pos in ("tl", "tr") else f"main_h-overlay_h-{m}"
    inputs, vf = ["-i", str(video)], []
    base = "[0:v]"
    if logo and os.path.isfile(str(logo)):
        inputs += ["-i", str(logo)]
        vf.append(f"[1:v]format=rgba,colorchannelmixer=aa={b['logo_opacity']:.2f}[lg]")
        vf.append(f"[0:v][lg]overlay=x={x}:y={y}[o0]")
        base = "[o0]"
    if b["cta_text"]:
        txt = b["cta_text"].replace("\\", "").replace(":", "\\:").replace("'", "")
        enable = ""
        if seconds:
            enable = f":enable='between(t,{max(0.0, float(seconds[0])):.3f},{float(seconds[1]):.3f})'"
        vf.append(f"{base}drawtext=text='{txt}':fontsize=42:fontcolor=white:box=1:boxcolor=black@0.45:"
                  f"boxborderw=16:x=(w-text_w)/2:y=h-text_h-64{enable}[v]")
        base = "[v]"
    if not vf:
        vf.append("[0:v]null[v]")
        base = "[v]"
    return ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf),
            "-map", base, "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
            "-c:a", "copy", "-movflags", "+faststart", str(out)]


def overlay_export(video, out, brand, logo=None, seconds=None):
    cmd = overlay_cmd(video, out, brand, logo, seconds)
    subprocess.run(cmd, check=True)
    return {"ok": True, "file": str(out)}


def loop_export(video, out, crossfade=0.4):
    """Make a seamless loop: crossfade the tail into the head, keeping the duration."""
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json",
                                                str(video)]))
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    dur = float(v.get("duration") or 0) or 0
    if dur <= 2 * crossfade:
        raise ValueError("AI TV: клип слишком короткий для зацикливания")
    off = dur - crossfade
    fc = (f"[0:v]split[a][b];[b]trim=start={off:.3f},setpts=PTS-STARTPTS[t];"
          f"[a][t]xfade=transition=fade:duration={crossfade:.3f}:offset={off:.3f}[v]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-filter_complex", fc, "-map", "[v]",
                    "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-movflags",
                    "+faststart", str(out)], check=True)
    return {"ok": True, "file": str(out), "seconds": round(dur, 3)}


def playlist_export(videos, out):
    """One concatenated file from finished scene MP4s (same codec/canvas enforced by the pack)."""
    listing = str(out) + ".txt"
    with open(listing, "w", encoding="utf-8") as f:
        for v in videos:
            f.write("file '" + str(v).replace("'", "'\\''") + "'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy",
                    "-movflags", "+faststart", str(out)], check=True)
    os.remove(listing)
    return {"ok": True, "file": str(out), "clips": len(videos)}


def scene_media(order):
    """Finished scene files of an order, in scene order (from the pack's project folders)."""
    try:
        import folder_paths
        base = os.path.join(folder_paths.get_output_directory(), "h3labstudio")
    except Exception:
        base = os.path.join(os.getcwd(), "output", "h3labstudio")
    out = []
    for s in order.get("scenes", []):
        pid = scene_project_id(order["id"], s["index"])
        folder = os.path.join(base, pid)
        files = sorted((f for f in os.listdir(folder) if f.startswith("full_") and f.endswith(".mp4")),
                       key=lambda n: os.path.getmtime(os.path.join(folder, n))) if os.path.isdir(folder) else []
        out.append(os.path.join(folder, files[-1]) if files else None)
    return out


def _project_for_scene(order, brand, scene):
    """A normal pack project for one scene, so cache/takes/upscale keep working."""
    pid = scene_project_id(order["id"], scene["index"])
    r = normalize_render(brand.get("render"))
    segments = [{"id": "s1", "name": f'{scene["kind"]} {scene["index"] + 1}', "frames": int(scene["frames"]),
                 "prompt": scene.get("prompt") or "", "refs": [], "link": "cut", "gap": 0}]
    budget = int(order.get("frames_requested") or 0)
    before = sum(int(s["frames"]) for s in order.get("scenes", []) if s["index"] < scene["index"])
    end = max(0, min(int(scene["frames"]), budget - before)) if budget else 0
    settings = {"model_preset": "tv", "seed": r["seed"] + int(scene["index"]), "auto_random_seed": False,
                "fps": FPS, "quality": "final", "final_mode": "full", "steps": r["steps"],
                "piflow_steps": r["piflow_steps"], "cfg": 1, "sampler": r["sampler"] or "", "scheduler":
                r["scheduler"] or "", "res_mode": "custom", "width": r["width"], "height": r["height"],
                "continuation_method": "overlap", "continuity_ref": False, "level_lock": False,
                "cache": True, "resume_only": False, "preview_suppress": True, "verbose_log": True,
                "accel": r.get("accel") or {}}
    preset = {"id": "tv", "name": brand["name"], "base": "unet", "model": r["model"], "dtype": "default",
              "clip": r["clip"], "vae": r["vae"], "audio_vae": r["audio_vae"], "loras": []}
    return {"version": 1, "id": pid, "name": f'{order["id"]} · {scene["index"] + 1}', "settings": settings,
            "model_presets": {"tv": preset}, "assets": [], "segments": segments,
            "end_mode": "fixed" if end and end < int(scene["frames"]) else "auto", "end": int(end),
            "audio": {"clips": [], "video_volume": 0.0 if r["no_audio"] else 1.0, "input_ref": None},
            "run": {"operation": "full", "export_stream": True, "no_audio": bool(r["no_audio"]),
                    "export_colour": False}}


def _prompt_server_port():
    try:
        from server import PromptServer
        return getattr(PromptServer.instance, "port", 8188) or 8188
    except Exception:
        return 8188


def order_run(order_id, limit=None):
    """Queue every pending scene of the order as a normal prompt (FIFO behind whatever runs now)."""
    import urllib.request, urllib.error
    order = order_get(order_id)
    if not order:
        raise ValueError("AI TV: заказ не найден: " + str(order_id))
    brand = brand_get(order["brand"])
    if not brand:
        raise ValueError("AI TV: у заказа нет бренда")
    r = normalize_render(brand.get("render"))
    if not r["model"] or not r["clip"] or not r["vae"]:
        raise ValueError("AI TV: в бренде не заполнены модель, энкодер и VAE")
    port, sent, results = _prompt_server_port(), [], []
    for scene in order.get("scenes", [])[:limit or None]:
        project = _project_for_scene(order, brand, scene)
        graph = {"1": {"class_type": "ZL_H3ZeroStudioLab",
                       "inputs": {"project": json.dumps(project, ensure_ascii=False),
                                  "assembly_mode": "Потоковый (MP4, экономия RAM)"}}}
        body = json.dumps({"prompt": graph, "client_id": "h3_tv_studio"}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{port}/prompt", data=body,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as f:
                scene["prompt_id"] = json.loads(f.read())["prompt_id"]
                scene["queued"] = time.time()
                sent.append(scene["index"])
        except (urllib.error.HTTPError, OSError, ValueError) as e:
            scene["error"] = str(e)[:300]
            results.append({"index": scene["index"], "error": str(e)[:200]})
    order["status"] = "running" if sent else order.get("status", "draft")
    order_update(order)
    return {"order": order["id"], "queued": sent, "errors": results}


def status(order):
    media = scene_media(order)
    return {"order": order["id"], "scenes": [{"index": s["index"], "kind": s["kind"],
                                             "seconds": s["seconds"],
                                             "ready": bool(m and os.path.isfile(m)),
                                             "file": m} for s, m in zip(order.get("scenes", []), media)],
            "ready": sum(1 for m in media if m and os.path.isfile(m)), "total": len(media)}
