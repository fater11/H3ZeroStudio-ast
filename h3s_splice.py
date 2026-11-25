"""Сборка ролика из движений одного референс-видео (своя реализация идеи Ref Splice).

Сценарий — обычный текст, по строке на элемент:

    стиль: A realistic live-action scene, real-time speed, no slow motion.
    сцена: A side-on medium-wide shot of a wooden floor, warm spotlights.
    персонаж: <Subject 1> is the woman in the grey coat.
    движение 4.0-6.0        # кадры 4.0–6.0 с исходника играются как есть
    переход 1.5: она опускается на одно колено  # здесь движение дорисовывает модель
    движение 0.0-2.0
    звук: A quiet room, soft steps.
    музыка: N/A

Клипы дают «движение как в референсе» (кадры берутся из исходника), переходы — вставки, где модель играет
сама по словам. Порядок строк задаёт порядок движений, поэтому из одного видео можно собрать новый танец.

Код H3MD (AGPL-3.0) здесь не используется: взяты только идеи, реализация и формат сценария свои.
"""
import math, os, re

from . import h3s_core as core
from . import h3s_media as media

FPS = core.FPS
HOLD = 4                       # кадров «залипания» на концах перехода-растворения
SHORT_GAP_MAX = 2.0            # переход длиннее или со словами становится отдельным шотом
CARRY = 39                     # кадров, переносимых в следующий шот после словесного перехода
END_PAD = 17                   # кадров-стопов в конце: шот округляется вверх до 5+17n
DEFAULT_REF_SIDE = 736         # короткая сторона референс-видео, которое читает H3
MIN_CLIP = 5.0 / FPS

KEYS = ("style", "scene", "sound", "music", "summary")
LIST_KEYS = ("subject", "picture")
RU = {"style": "стиль", "scene": "сцена", "sound": "звук", "music": "музыка", "summary": "итог",
      "subject": "персонаж", "picture": "картинка"}
ALIAS = {ru: en for en, ru in RU.items()}
ALIAS.update({"персонажи": "subject", "субъект": "subject", "картинки": "picture",
              "subject_definitions": "subject", "персоны": "subject"})
ITEM_ALIAS = {"clip": "движение", "move": "движение", "motion": "движение", "моушен": "движение", "движения": "движение",
              "gap": "переход", "transition": "переход", "склейка": "переход", "пауза": "переход"}

_TIME = r"(\d+(?::\d+(?:[.,]\d+)?)?(?:[.,]\d+)?)"
_CLIP_RE = re.compile(rf"^\s*(движение|clip|move|motion|моушен|движения)\s+{_TIME}\s*(?:-|–|—|~|to|до)\s*{_TIME}\s*с?\.?\s*(?::\s*(.*))?$",
                      re.I)
_GAP_RE = re.compile(rf"^\s*(переход|gap|transition|склейка|пауза)\s+{_TIME}\s*с?\.?\s*(?::\s*(.*))?$", re.I)
_SUBJ_RE = re.compile(r"<Subject\s*(\d+)>")


class SpliceError(ValueError):
    pass


def parse_time(s):
    """'12.5' / '1:05.5' → секунды"""
    t = str(s).strip().replace(",", ".")
    if ":" in t:
        m, sec = t.split(":", 1)
        return int(m) * 60 + float(sec)
    return float(t)


def parse_script(text):
    """Текст сценария → {"style","scene","sound","music","summary","subject":[…],"picture":[…],"items":[…]}"""
    out = {k: "" for k in KEYS}
    for k in LIST_KEYS:
        out[k] = []
    items = []
    for n, raw in enumerate(str(text or "").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _CLIP_RE.match(line)
        if m:
            a, b = parse_time(m.group(2)), parse_time(m.group(3))
            if b <= a:
                raise SpliceError(f"строка {n}: конец движения {b:g} с не позже начала {a:g} с")
            if b - a < MIN_CLIP:
                raise SpliceError(f"строка {n}: движение {a:g}–{b:g} с короче 5 кадров")
            items.append({"kind": "clip", "a": a, "b": b, "text": (m.group(4) or "").strip(), "line": n})
            continue
        m = _GAP_RE.match(line)
        if m:
            sec = parse_time(m.group(2))
            if sec <= 0:
                raise SpliceError(f"строка {n}: у перехода должна быть длительность больше нуля")
            items.append({"kind": "gap", "sec": sec, "text": (m.group(3) or "").strip(), "line": n})
            continue
        key, sep, val = line.partition(":")
        key = ALIAS.get(key.strip().lower(), key.strip().lower())
        if sep and key in KEYS + LIST_KEYS:
            val = val.strip()
            if key in LIST_KEYS:
                out[key].append(val)
            else:
                out[key] = (out[key] + " " + val).strip()
            continue
        raise SpliceError(f"строка {n} не понята: «{line}». Нужно «движение 4-6», «переход 1.5: …» "
                          f"или строка вида «{'|'.join(RU[k] for k in KEYS + LIST_KEYS)}: …»")
    if not any(i["kind"] == "clip" for i in items):
        raise SpliceError("в сценарии нет ни одного движения (строка «движение 0.0-2.0»)")
    notes, tidy = [], []
    for it in items:      # слова на движении только мешали бы: движение играется как в исходнике
        if it["kind"] == "clip" and it["text"]:
            notes.append(f"строка {it['line']}: слова на движении пропущены — движение играется как в исходнике, "
                         f"новое действие пишите в переходе")
    for it in items:
        if it["kind"] == "gap" and (not tidy or tidy[-1]["kind"] == "gap"):
            notes.append(f"строка {it['line']}: переход пропущен "
                         f"({'два подряд' if tidy else 'в самом начале'})")
            continue
        tidy.append(it)
    while tidy and tidy[-1]["kind"] == "gap":
        notes.append(f"строка {tidy[-1]['line']}: переход в конце пропущен")
        tidy.pop()
    out["items"], out["notes"] = tidy, notes
    return out


# ----------------------------------------------------------------------------------------------- таймлайн
def clip_frames(item):
    """Исходные времена кадров клипа (24 к/с)."""
    n = max(1, int(round((item["b"] - item["a"]) * FPS)))
    return [item["a"] + k / FPS for k in range(n)]


def _dissolve(n, a_time, b_time):
    """n кадров: залипание на a, растворение a→b, залипание на b (короткий переход — только растворение)."""
    hold = HOLD if n >= 2 * HOLD + 2 else 0
    mid = max(0, n - 2 * hold)
    ops = [("src", a_time)] * hold
    ops += [("mix", a_time, b_time, (k + 1) / (mid + 1)) for k in range(mid)]
    ops += [("src", b_time)] * hold
    return ops[:n] if n else ops


def _still_pair(n, a_time, b_time):
    """n кадров: стоп на a, затем стоп на b. Растворение здесь читалось бы как двойная экспозиция."""
    h = n // 2
    return [("src", a_time)] * h + [("src", b_time)] * (n - h)


def build_timeline(script, src_dur=None, fps=FPS):
    """Кадровые операции сборки: {"ops": [...], "shots": [...], "audio": [...]}.

    ops: ("src", t) — кадр исходника на t секундах, ("mix", ta, tb, w) — смешение, ("still", t) — стоп.
    """
    items = script["items"]
    if src_dur is not None:
        for it in items:
            if it["kind"] == "clip" and it["b"] > float(src_dur) + 0.05:
                raise SpliceError(f"строка {it['line']}: движение кончается на {it['b']:g} с, "
                                  f"а в видео всего {float(src_dur):.2f} с")
    ops, audio, shots = [], [], []
    shot = {"kind": "video", "overlap": 0, "frames": 0, "events": []}
    for k, it in enumerate(items):
        if it["kind"] == "clip":
            fr = clip_frames(it)
            f0 = shot["frames"]
            ops.extend(("src", t) for t in fr)
            audio.append(("src", it["a"], it["a"] + len(fr) / fps))
            shot["frames"] += len(fr)
            shot["events"].append({"kind": "clip", "f0": f0, "f1": shot["frames"], "text": it["text"],
                                   "src": (it["a"], it["b"])})
            continue
        prev = items[k - 1] if k else None
        nxt = items[k + 1] if k + 1 < len(items) else None
        a_time = clip_frames(prev)[-1] if prev and prev["kind"] == "clip" else 0.0
        b_time = nxt["a"] if nxt and nxt["kind"] == "clip" else a_time
        if it["sec"] <= SHORT_GAP_MAX + 1e-9 and not it["text"]:
            n = max(1, int(round(it["sec"] * fps)))
            f0 = shot["frames"]
            ops.extend(_dissolve(n, a_time, b_time))
            audio.append(("sil", n / fps))
            shot["frames"] += n
            shot["events"].append({"kind": "gap", "f0": f0, "f1": shot["frames"], "text": it["text"]})
            continue
        # переход со словами (или длинный): закрываем шот, отдельный шот без референс-видео, следующий клип
        # начинается с переносом CARRY кадров
        shots.append(shot)
        n = max(1, int(round(it["sec"] * fps)))
        shots.append({"kind": "text", "overlap": CARRY, "frames": n, "text": it["text"],
                      "events": [{"kind": "gap", "f0": 0, "f1": n, "text": it["text"]}]})
        ops.extend(_still_pair(CARRY, a_time, b_time))
        audio.append(("sil", CARRY / fps))
        shot = {"kind": "video", "overlap": CARRY, "frames": 0, "events": []}
    shots.append(shot)
    last = ops[-1] if ops else ("src", 0.0)
    tail = last[1] if last[0] == "src" else last[1]
    ops.extend([("still", tail)] * END_PAD)
    audio.append(("sil", END_PAD / fps))
    for s in shots:
        if s["kind"] == "text":
            # шот из одних слов округляем к БЛИЖАЙШЕМУ 5+17n и минимум на 17 новых кадров: округление вверх
            # превратило бы переход 1.5 с в 2.1 с и остаток стал бы паузой
            k = max(int(math.ceil((s["overlap"] + 17 - 5) / 17)), int(round((s["overlap"] + s["frames"] - 5) / 17)))
            s["length"] = 5 + 17 * k
        else:
            s["length"] = core.snap_frames(s["overlap"] + s["frames"], "up")
        s.setdefault("text", "")
    return {"ops": ops, "shots": shots, "audio": audio,
            "frames": sum(s["length"] - s["overlap"] for s in shots), "notes": list(script.get("notes") or [])}


# ---------------------------------------------------------------------------------------------- промпты
def _secs(frames, fps=FPS):
    return f"{frames / fps:.2f}"


def _opening(shot, prev_text, fps=FPS):
    if not shot["overlap"]:
        return ""
    what = prev_text.rstrip(". ") if prev_text else "the end of the previous moment"
    return (f"For the first {_secs(shot['overlap'], fps)} seconds it holds the end of the previous moment "
            f"({what}), then the new action starts.")


def shot_prompt(script, shot, pictures=0, has_audio=False, prev_text="", fps=FPS):
    """Промпт одного шота в формате H3: референс-видео удерживается частично, движения берутся из него."""
    ov = shot["overlap"]
    total = shot["length"] / fps
    style = script["style"] or "A realistic live-action scene, real-time speed, no slow motion."
    subject = [x.replace("<Video 1>", "the shot before") if shot["kind"] == "text" else x
               for x in script["subject"]]
    events = []
    for e in shot["events"]:
        t = f"{(ov + e['f0']) / fps:.2f}"
        if e["kind"] == "clip" and shot["kind"] == "video":
            events.append(f"[{t}s] The people move exactly as in <Video 1>.")
        elif e["text"]:
            txt = e["text"].rstrip(". ")
            events.append(f"[{t}s] {txt[0].upper() + txt[1:]}.")
    body = " ".join(x for x in [script["scene"], _opening(shot, prev_text, fps)] + events if x)
    sound = script["sound"] or "The sound of the scene, matching the action on screen."
    music = script["music"] or "N/A"
    tags = []
    for line in script["subject"]:
        for m in _SUBJ_RE.finditer(line):
            t = f"<Subject {m.group(1)}>"
            if t not in tags:
                tags.append(t)
    if shot["kind"] == "text" and not pictures:                    # без референсов — формат T2VA
        plain = lambda s: _SUBJ_RE.sub(lambda m: f"person {m.group(1)}", s)
        return (f"integrated_multimodal_description:\n{style} {' '.join(plain(x) for x in subject)} "
                f"{plain(body)}\n\noverall_soundscape:\n{plain(sound)}\n\nnon_diegetic_music:\n{music}")
    defs = list(subject)
    kinds = ["reference generation"]
    if shot["kind"] == "video":
        defs.append("<Video 1> is the motion and camera reference: its moves, timing and camera framing.")
        if has_audio:
            defs.append("<Audio 1> is the sound of <Video 1>, used only as a loose reference for the sound.")
            kinds.append("audio reference")
    summary = script["summary"] or (
        f"The target video presents a {total:.1f}-second continuous shot"
        + (" following the moves of <Video 1>." if shot["kind"] == "video" else "."))
    ret = [f"{t} (appears in [Shot 1]): fully_preserved - the look and outfit stay the same from the first "
           f"frame to the last." for t in tags]
    if shot["kind"] == "video":
        wins = [f"{_secs(ov + e['f0'], fps)} to {_secs(ov + e['f1'], fps)}"
                for e in shot["events"] if e["kind"] == "clip"]
        gaps = any(e["kind"] == "gap" for e in shot["events"])
        ret.append("<Video 1> (appears in [Shot 1]): partially_preserved - its moves and camera framing are "
                   f"followed from {', '.join(wins)} seconds"
                   + ("; between those moments it only shows a short dissolve from one pose to the next." if gaps
                      else "."))
        if has_audio:
            ret.append("<Audio 1> (appears in [Shot 1]): reference - the impacts and atmosphere only.")
    return (f"subject_definitions:\n" + "\n".join(defs) + "\n\n"
            f"summary:\n[{' + '.join(kinds)}] {summary}\n\n"
            f"retention_analysis:\n" + "\n".join(ret) + "\n\n"
            f"detailed_description:\n{style}\n[Shot 1] {body}\n\n"
            f"overall_soundscape:\n{sound}\n\nnon_diegetic_music:\n{music}")


# ------------------------------------------------------------------------------------------------- план
def plan_shots(script, timeline, name, video_file, characters=(), w=1344, h=768, budget=None, has_audio=False,
               fps=FPS):
    """План сборки: по шоту промпт, кадры, референс-видео и персонажи (с разбивкой по бюджету токенов)."""
    from . import h3s_budget
    budget = int(budget if budget is not None else h3s_budget.budget_tokens())
    segments, prev_text, cursor = [], "", 0
    for i, shot in enumerate(timeline["shots"], start=1):
        prompt = shot_prompt(script, shot, pictures=len(characters), has_audio=has_audio, prev_text=prev_text, fps=fps)
        frames = shot["length"]
        ref_video = [video_file] if shot["kind"] == "video" and video_file else []
        tok = h3s_budget.segment_tokens({"frames": frames}, w, h, ref_images=len(characters),
                                        ref_video_frames=frames if ref_video else 0, ref_video_w=w,
                                        ref_video_h=h)
        seg = {"name": f"{name} {i}", "prompt": prompt, "frames": frames, "overlap": shot["overlap"],
               "kind": shot["kind"], "video": ref_video, "characters": list(characters), "tokens": tok,
               "index": i - 1, "src_start": cursor}   # src_start: where this shot sits in the spliced video
        cursor += shot["length"] - shot["overlap"]
        if tok > budget:
            parts = h3s_budget.parts_for(frames, tok, budget)
            if len(parts) > 1:
                seg["parts"] = [{"start": p["start"], "frames": p["frames"], "overlap": p["overlap"],
                                 "prompt": h3s_budget.retime_prompt(prompt, (p["start"] - p["overlap"]) / fps,
                                                                    p["start"] / fps + p["frames"] / fps, prompt)}
                                for p in parts]
        segments.append(seg)
        prev_text = shot.get("text") or (shot["events"][-1].get("text") if shot["events"] else "") or prev_text
    return {"name": name, "shots": len(segments), "frames": timeline["frames"], "budget": budget,
            "width": w, "height": h, "source": video_file, "segments": segments,
            "notes": list(timeline.get("notes") or [])}


# ----------------------------------------------------------------------------------- сборка референс-видео
def motion_profile(path, w=64, h=36, limit=None):
    """Кривая движения: средняя разница яркости соседних кадров, 24 значения в секунду."""
    import numpy as np
    frames = media.load_video_frames(path, 0, limit or 24 * 900, w, h)
    if frames is None or len(frames) < 2:
        return []
    grey = np.asarray(frames, dtype=np.float32).mean(axis=-1)
    return [float(np.abs(grey[i] - grey[i - 1]).mean()) for i in range(1, len(grey))]


def draft_script(path, duration=None, cuts=None, min_clip=1.5, max_clips=8, w=1344, h=768):
    """Черновик сценария: режем по монтажным склейкам и по самым тихим местам (пауза между движениями)."""
    info = media.video_info(path)
    duration = float(duration or info.get("duration") or 0.0)
    if duration <= 0:
        raise SpliceError("не удалось прочитать длительность исходного видео")
    if cuts is None:
        try:
            from . import h3s_swap_mask as swap
            cuts = swap.detect_shot_cuts(path) or []
        except Exception:
            cuts = []
    end = math.floor(duration * FPS) / FPS
    splits = []
    for c in sorted(float(x) for x in cuts or ()):
        if min_clip <= c <= end - min_clip and all(abs(c - s) >= min_clip for s in splits):
            splits.append(round(round(c * FPS) / FPS, 4))
    prof = motion_profile(path, limit=int(duration * FPS) or None)
    if len(prof) > 20 and len(splits) < max_clips - 1:
        import numpy as np
        curve = np.convolve(np.asarray(prof, dtype=np.float32), np.ones(13) / 13.0, mode="same")
        med = float(np.median(curve))
        for i in sorted(range(7, len(curve) - 7), key=lambda i: curve[i]):
            if curve[i] > med or len(splits) >= max_clips - 1:
                break
            t = i / FPS
            if t < min_clip or end - t < min_clip or any(abs(t - s) < min_clip for s in splits):
                continue
            if any(0 <= t - c < 1.0 for c in cuts or ()):      # сразу после склейки — это тот же момент с другого угла
                continue
            splits.append(round(round(t * FPS) / FPS, 4))
    edges = [0.0] + sorted(splits) + [end]
    lines = ["# черновик: резы по склейкам и паузам — правьте времена и дописывайте слова в переходах"]
    for k, (a, b) in enumerate(zip(edges, edges[1:])):
        if k:
            lines.append("переход 1")
        lines.append(f"движение {a:.2f}-{b:.2f}")
    return "\n".join(lines) + "\n"


def render(ops, src, out_path, w=None, h=None, audio=None, fps=FPS, progress=None, encoder="cpu"):
    """Склеенное референс-видео: кадры берутся из исходника по операциям, звук — из тех же отрезков."""
    import numpy as np
    info = media.video_info(src)
    if w is None or h is None:
        side = DEFAULT_REF_SIDE
        scale = min(1.0, side / max(1, min(info["width"], info["height"])))
        w, h = (int(info["width"] * scale) // 2 * 2, int(info["height"] * scale) // 2 * 2)
    total = len(ops)
    source = media.load_video_frames(src, 0, total_src_frames(ops, fps), w, h)
    if source is None or not len(source):
        raise SpliceError("не удалось прочитать кадры исходного видео")
    idx = lambda t: min(len(source) - 1, max(0, int(round(float(t) * fps))))
    # load_video_frames gives float 0..1: it must be scaled to bytes, not cut off
    src_frames = np.clip(np.asarray(source, dtype=np.float32) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    frames = []
    for k, op in enumerate(ops):
        if op[0] == "src":
            frames.append(np.asarray(src_frames[idx(op[1])], dtype=np.uint8))
        elif op[0] == "still":
            frames.append(frames[-1] if frames else np.asarray(src_frames[idx(op[1])], dtype=np.uint8))
        else:                                                   # ("mix", ta, tb, weight)
            a = np.asarray(src_frames[idx(op[1])], np.float32)
            b = np.asarray(src_frames[idx(op[2])], np.float32)
            wt = float(op[3])
            frames.append(np.clip(a * (1 - wt) + b * wt, 0, 255).astype(np.uint8))
        if progress and (k % 24 == 0 or k == total - 1):
            progress(k + 1, total)
    import torch
    tensor = torch.from_numpy(np.stack(frames).astype("float32") / 255.0)
    wave = splice_audio(src, audio, fps=fps) if audio else None
    if wave is not None:
        wave = torch.from_numpy(np.ascontiguousarray(wave, dtype=np.float32))
    media.write_mp4(out_path, tensor, fps=fps, waveform=wave, encoder=encoder)
    return {"path": out_path, "frames": len(frames), "width": w, "height": h,
            "duration": round(len(frames) / fps, 3), "audio": bool(wave is not None)}


def total_src_frames(ops, fps=FPS):
    """Сколько кадров исходника нужно прочитать: до самого позднего запрошенного времени."""
    times = []
    for op in ops:
        if op[0] == "src":
            times.append(float(op[1]))
        elif op[0] == "mix":
            times += [float(op[1]), float(op[2])]
    return int(round(max(times) * fps)) + 2 if times else 1


def splice_audio(src, audio, fps=FPS, sample_rate=None):
    """Звук сборки: отрезки исходника в новом порядке, тишина на переходах и в конце."""
    import numpy as np
    try:
        wave, sr = media.load_audio(src)
    except Exception:
        return None
    if wave is None:
        return None
    wave = np.asarray(wave)
    if wave.ndim == 1:
        wave = np.stack([wave, wave])
    total = 0
    pieces = []
    for op in audio or ():
        if op[0] == "src":
            a, b = int(round(float(op[1]) * sr)), int(round(float(op[2]) * sr))
            piece = wave[:, max(0, a):max(0, b)]
        else:
            n = int(round(float(op[1]) * sr))
            piece = np.zeros((wave.shape[0], n), dtype=wave.dtype)
        pieces.append(piece)
        total += piece.shape[1]
    if not pieces:
        return None
    out = np.concatenate(pieces, axis=1)
    return out


def write_splice(script_text, src, out_dir, name="splice", w=None, h=None, budget=None, characters=(),
                 progress=None, encoder="cpu"):
    """Полный проход: сценарий → таймлайн → склеенное референс-видео → план шотов."""
    script = parse_script(script_text)
    info = media.video_info(src)
    timeline = build_timeline(script, src_dur=info.get("duration"))
    os.makedirs(out_dir, exist_ok=True)
    ref = os.path.join(out_dir, f"{name}_ref.mp4")
    rendered = render(timeline["ops"], src, ref, w=w, h=h, audio=timeline["audio"], progress=progress,
                      encoder=encoder)
    plan = plan_shots(script, timeline, name, ref, characters=characters, w=w or 1344, h=h or 768,
                      budget=budget, has_audio=bool(rendered["audio"]))
    plan["reference"] = rendered
    return {"script": script, "timeline": timeline, "plan": plan, "reference": rendered}


def to_order(plan, spliced, name, brand, characters=()):
    """План сборки → заказ AI TV: каждому шоту вырезается свой кусок склеенного референса.

    Референс-клип шота лежит в папке input ComfyUI и приходит в проект как обычный видео-ассет, поэтому
    дальше работает весь остальной конвейер пака (кэш, тейки, апскейл, оценка).
    """
    import shutil
    import folder_paths
    from . import h3s_tv as tv
    inp = os.path.abspath(folder_paths.get_input_directory())
    base = tv.slug(name, "splice")
    assets, scenes = [], []
    for seg in plan["segments"]:
        refs = []
        frames = int(seg["frames"])
        if seg["kind"] == "video" and spliced and os.path.isfile(str(spliced)):
            fname = f"{base}_{seg['index'] + 1}_ref.mp4"
            # export_video takes frame numbers, not seconds
            media.export_video(spliced, os.path.join(inp, fname), start=int(seg["src_start"]),
                               end=int(seg["src_start"]) + frames)
            aid = f"motion{seg['index'] + 1}"
            assets.append({"id": aid, "category": "video", "file": fname, "subfolder": "", "type": "input",
                           "name": f"{name} {seg['index'] + 1}"})
            refs.append(aid)
        for k, path in enumerate(seg.get("characters") or list(characters)):
            path = str(path)
            if not os.path.isfile(path):
                continue
            fname = f"{base}_char{seg['index'] + 1}_{k + 1}" + (os.path.splitext(path)[1] or ".png")
            shutil.copyfile(path, os.path.join(inp, fname))
            aid = f"pic{seg['index'] + 1}_{k + 1}"
            assets.append({"id": aid, "category": "image", "file": fname, "subfolder": "", "type": "input",
                           "name": os.path.basename(path)})
            refs.append(aid)
        scenes.append({"kind": seg["kind"], "frames": frames, "overlap": int(seg.get("overlap") or 0),
                       "seconds": round(frames / FPS, 3), "prompt": seg.get("prompt") or "", "text": "",
                       "refs": refs, "tokens": int(seg.get("tokens") or 0)})
    return tv.order_from_scenes(name, brand, scenes, assets=assets, kind="splice", source=str(spliced or ""))


def script_to_text(script):
    """Сценарий обратно в текст (для правки в интерфейсе)."""
    out = [f"{RU[k]}: {v}" for k in LIST_KEYS for v in script[k] if v]
    out += [f"{RU[k]}: {script[k]}" for k in KEYS if script[k]]
    for it in script["items"]:
        if it["kind"] == "clip":
            out.append(f"движение {it['a']:g}-{it['b']:g}" + (f": {it['text']}" if it["text"] else ""))
        else:
            out.append(f"переход {it['sec']:g}" + (f": {it['text']}" if it["text"] else ""))
    return "\n".join(out) + "\n"
