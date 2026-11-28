"""Серия связанных отрезков из одной идеи: делим время ролика по бюджету токенов и пишем промты.

Пользователь даёт идею и длительность — модуль решает, на сколько отрезков их резать (обучаемый диапазон H3
124–362 кадра и бюджет токенов конкретной карты), как связать соседние отрезки (жёсткий стык или продолжение
с перекрытием) и в каком виде отдать задание модели-писателю. Промты пишет LLM, а если её нет — работает
шаблонный писатель, поэтому серию можно собрать и офлайн.

Вся арифметика кадров и токенов — наша (h3s_core + h3s_budget); форматы промтов — наш H3 Ref2VA.
"""
import json, math, re

from . import h3s_core as core
from . import h3s_budget as budget_mod

MAX_BLOCKS = (core.TRAINED_MAX_FRAMES - core.TRAINED_MIN_FRAMES) // 17 + 7   # 21 блок = 357+ ... capped ниже
BEAT_MIN_BLOCKS = 3                     # ≈2.1 с нового материала на отрезок — короче уже не отрезок
ROLES = ("начало", "развитие", "поворот", "финал")


def _tokens_for(frames, w, h, ref_images=0, ref_video_frames=0, cards=()):
    return budget_mod.segment_tokens({"frames": frames}, w, h, ref_images=ref_images,
                                     ref_video_frames=ref_video_frames, cards=cards)


def beat_limit_blocks(w, h, budget, overlap_blocks=1, ref_images=0, ref_video_frames=0, cards=()):
    """Сколько блоков нового материала (по 17 кадров) влезает в один отрезок по бюджету токенов."""
    overlap = core.overlap_frames(overlap_blocks) if overlap_blocks else 0
    best = 0
    for blocks in range(BEAT_MIN_BLOCKS, 40):
        frames = 17 * blocks + (overlap if overlap else 5)
        if frames > core.TRAINED_MAX_FRAMES:
            break
        if not budget_mod.fits(_tokens_for(frames, w, h, ref_images, ref_video_frames, cards), budget):
            break
        best = blocks
    return best


def _split_even(total_blocks, parts):
    """Разложить блоки по отрезкам как можно ровнее (разница не больше одного блока)."""
    base, extra = divmod(int(total_blocks), max(1, int(parts)))
    out = [base + (1 if i < extra else 0) for i in range(max(1, int(parts)))]
    return [b for b in out if b > 0]


def plan_beats(idea, seconds, w=1344, h=768, budget=None, overlap_blocks=1, beats=None,
               min_blocks=BEAT_MIN_BLOCKS, ref_images=0, ref_video_frames=0, cards=(), fps=core.FPS):
    """План серии: отрезки, их кадры, связь между ними и оценка токенов.

    `seconds` — сколько всего нового материала (перекрытия в него не считаются), `beats` — желаемое число
    отрезков (None: столько, сколько нужно по бюджету). Сумма нового материала точно равна запрошенному времени.
    """
    content = int(round(float(seconds) * fps))
    if content <= 0:
        raise ValueError("Серия: длительность ролика должна быть больше нуля")
    budget = int(budget if budget is not None else budget_mod.budget_tokens())
    overlap_blocks = max(0, min(core.MAX_OVERLAP_BLOCKS, int(overlap_blocks)))
    total_blocks = max(1, int(round(content / 17.0)))
    limit = beat_limit_blocks(w, h, budget, overlap_blocks, ref_images, ref_video_frames, cards)
    if limit < max(1, int(min_blocks)):
        raise ValueError(f"Серия: даже {17 * max(1, int(min_blocks))} кадров не влезают в бюджет "
                         f"{budget} токенов — уменьшите разрешение или референсы")
    count = int(beats) if beats else max(1, math.ceil(total_blocks / limit))
    count = max(1, min(count, math.ceil(total_blocks / max(1, int(min_blocks)))))
    blocks = _split_even(total_blocks, count)
    if len(blocks) > 1 and blocks[-1] < max(1, int(min_blocks)) and blocks[-2] > max(1, int(min_blocks)):
        take = max(1, int(min_blocks)) - blocks[-1]      # не оставляем огрызок в конце
        blocks[-2] -= take
        blocks[-1] += take
    beats_out, cursor = [], 0
    for i, b in enumerate(blocks):
        ov = core.overlap_frames(overlap_blocks) if (i and overlap_blocks) else 0
        frames = 17 * b + (ov if ov else 5)
        new_frames = 17 * b
        beats_out.append({"index": i, "blocks": b, "frames": frames, "overlap": ov,
                          "overlap_blocks": overlap_blocks if i else 0,
                          "new_frames": new_frames, "start_frame": cursor,
                          "seconds": round(new_frames / fps, 3),
                          "link": "extend" if i else "cut",
                          "role": ROLES[min(len(ROLES) - 1, int(round(i * (len(ROLES) - 1) / max(1, len(blocks) - 1))))]
                          if len(blocks) > 1 else "начало+финал",
                          "tokens": _tokens_for(frames, w, h, ref_images, ref_video_frames, cards)})
        cursor += new_frames
    return {"idea": str(idea or "").strip(), "seconds": round(cursor / fps, 3), "requested_seconds": float(seconds),
            "frames": cursor, "width": int(w), "height": int(h), "budget": budget,
            "limit_blocks": limit, "overlap_blocks": overlap_blocks, "beats": beats_out,
            "over_budget": [b["index"] for b in beats_out if b["tokens"] > budget]}


CONTRACT = """You write English MiniMax H3 REF2VA prompts for a chain of segments that must play as ONE
unbroken shot: every segment continues the one before it, and the finished film must show no visible join.
The rules are the pack's own Long Take writer skill (forge_data/styles/minimax_h3_long_take.json).

{answer}

Every segment prompt has exactly these six sections, in this order:
subject_definitions:   <Subject 1> - who is in the shot and where their appearance comes from.
summary:               [reference generation] one paragraph: what happens in this segment and how it ends.
retention_analysis:    one line per label that has a role.
detailed_description:  the shot; it starts with a [Shot 1] line, then the action over time.
overall_soundscape:    diegetic sound only.
non_diegetic_music:    N/A when there is none.
Write the whole prompt in English: the idea may be given in another language, translate it yourself.

Chain rules (this segment is joined to the previous one through its last frames, which is why they exist):
1. Describe ONLY your own segment ({seconds} s, {new_frames} frames). Never retell the earlier parts.
2. Segments in the series: {count}. This segment's link: {link_hint}.
3. The join lands on a boring mid-action moment (mid-step, mid-climb, mid-stroke): the only possible next frame
   there is "keep going". Never join on a door, a threshold, an arrival, sitting down or the middle of a sentence.
4. A whole transition lives inside one segment: reaching it, opening it and stepping through all happen there.
5. Show the destination before travelling to it, and give the travel real screen time.
6. Lock the framing for the whole film; never carry a smooth camera move (push-in, pull-out, tilt) across a join.
7. 2-3 beats per 10 seconds. Something must keep developing - light, weather, what a beam reveals: identical
   scenery reads as copy-paste. No first-person POV when a person is in the shot.
8. Never use the word cut in any form, not even "no cut": an H3 prompt has no edit cuts.
9. Exactly one [Shot 1] line. Timestamps are local to the segment and start at 00:00.000. In a continuing
   segment write them 0.92 s earlier (its first ~22 frames come from the previous segment and are trimmed on
   assembly): a beat meant for T seconds goes at T + 0.92.
10. The last line of every segment except the final one states what the subject is still doing when it ends.
11. A continuing segment opens with a continuation block covering the first ~3 seconds: ZERO new scenery nouns,
    only continuation - the video opens already in progress, the camera holds exactly the position, height and
    distance it already has, the subject keeps moving at exactly the same pace in the space they are already in,
    the light on them unchanged, nothing new enters the frame. End the block with negations of what happens later
    in this segment, and give the performer a small action (a breath, a weight shift): a frozen frame freezes.
12. Style, subjects, location and light are written identically in every segment; only the action changes.
13. Speech: short lines of 7-9 words, about one every 2.5 s, formatted
    At 00:04.700: [speaking, Russian, <voice>] "Stairs. Let's go up." with the exact words of the spoken
    language inside <d>[Russian] What is next?</d>. One speaker (S1). Without speech, never mention speech.
14. Sound: overall_soundscape is diegetic only. Music: non_diegetic_music: N/A unless the idea needs music.
"""


ANSWER_JSON = ('Answer with STRICT JSON and nothing else: {"title": "...", "logline": "...", "segments": '
               '[{"prompt": "...", "note": "..."}, ...]}\n'
               'Exactly {count} items in segments, in the same order as the segments below.')

ANSWER_TEXT = ("Answer with the FINISHED PROMPT ONLY, as plain text: no JSON, no Markdown fences, no preface, "
               "no commentary - just the prompt exactly as it would be pasted into this segment's prompt field.\n"
               "Use exactly this skeleton, in this order, fill every section and keep the section names:\n"
               "subject_definitions:\n<Subject 1> is ...\n"
               "summary:\n[reference generation] ...\n"
               "retention_analysis:   <Subject 1> (appears in [Shot 1]): fully_preserved - ...   "
               "(include this section and line only when this segment really has reference labels, "
               "otherwise omit the section entirely)\n"
               "detailed_description:\n[Shot 1] ...\n"
               "overall_soundscape:\n...\n"
               "non_diegetic_music:\nN/A")


def writer_messages(idea, plan, style="", refs=(), language="ru", extra="", only=None, previous_prompt=""):
    """Задание писателю: идея + посчитанные отрезки + наш контракт формата.

    `only` — писать промт одного отрезка (индекс): так длинная серия не зависит от одного длинного ответа,
    а сбой модели стоит одного отрезка, а не всей серии.
    """
    beats = plan["beats"]
    lines = [f"Идея: {plan['idea'] or idea}",
             f"Всего времени: {plan['seconds']:.1f} с на {len(beats)} отрезков (склейка встык или продолжение)."]
    if style:
        lines.append(f"Стиль/мир (одинаковый для всех отрезков): {style}")
    for r in refs or ():
        lines.append(f"Есть референс: {r}")
    if language and language != "ru":
        lines.append(f"Язык речи в кадре: {language}")
    lines.append("Отрезки:")
    for b in beats:
        link = "продолжение предыдущего (перекрытие {0} кадр.)".format(b["overlap"]) if b["overlap"] else "начало ролика, жёсткий старт"
        lines.append(f"  {b['index'] + 1}. {b['seconds']:.1f} с ({b['new_frames']} новых кадров, {b['frames']} всего), "
                     f"роль: {b['role']}, связь: {link}")
    if extra:
        lines.append(f"Дополнительно: {extra}")
    # no str.format here: the contract itself shows a JSON object, so its braces are not placeholders
    head = (CONTRACT.replace("{answer}", ANSWER_TEXT if only is not None else ANSWER_JSON)
            .replace("{count}", "1" if only is not None else str(len(beats)))
            .replace("{seconds}", f"{beats[only]['seconds']:.1f}" if only is not None
                     else " / ".join(f"{b['seconds']:.1f}" for b in beats))
            .replace("{new_frames}", str(beats[only]["new_frames"]) if only is not None
                     else " / ".join(str(b["new_frames"]) for b in beats))
            .replace("{link_hint}", "продолжение" if len(beats) > 1 else "начало"))
    if only is not None:
        head += f"\n\nWrite SEGMENT {only + 1} of {len(beats)} ONLY."
        slices = _idea_beats(plan["idea"] or idea, len(beats))
        mine = slices[only]
        lines = [f"This is segment {only + 1} of {len(beats)}.", f"Your part of the idea (this one only): {mine}"]
        if only + 1 < len(slices):
            lines.append(f"Next part of the idea - hand the action over to it at the end, do not play its events "
                         f"now: {slices[only + 1]}")
        if previous_prompt:
            lines.append("Previous segment's prompt - FOR CONTINUITY ONLY: keep its framing, light and appearance, "
                         "continue its action, do not start a new scene, and do not describe a new beginning, a "
                         "repeat of the first action or a hard reset of camera and sound.")
            lines.append(previous_prompt)
        else:
            lines.append("This is the OPENING segment: it opens the film. Never write that the shot continues or "
                         "resumes, and do not jump ahead to later events.")
        lines += [f"Whole series for context only (do not write it): {plan['idea'] or idea}"]
    return [{"role": "system", "content": head},
            {"role": "user", "content": "\n".join(lines)}]


# Правила промта H3 (forge_data/prompts/portable-prompt.md): их обязан соблюдать и писатель, и шаблон.
PROMPT_SECTIONS = ("subject_definitions:", "summary:", "retention_analysis:", "detailed_description:",
                   "overall_soundscape:", "non_diegetic_music:")
REQUIRED_SECTIONS = ("subject_definitions:", "summary:", "detailed_description:", "non_diegetic_music:")
META_PHRASES = ("part 1 of", "part 2 of", "part 3 of", "this shot is part", "this part opens the film",
                "this part ends the film", "the target video presents")


def _section_body(text, header):
    """Текст секции до следующей известной секции."""
    lines = str(text or "").splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == header)
    except StopIteration:
        return ""
    body = []
    for line in lines[start + 1:]:
        if line.strip() in PROMPT_SECTIONS:
            break
        body.append(line)
    return "\n".join(body).strip()


CONTINUATION_MARKERS = ("already in progress", "opens already", "mid-stride", "mid-step", "mid-climb",
                        "mid-action", "mid-motion", "in the middle of", "continues the previous",
                        "continuing from", "the same pace", "same position, height and distance")


def check_prompt_rules(prompt, continuation=False):
    """Список нарушений правил H3 (пусто — промт годится).

    Правила: язык, секции и их порядок, тип задачи, `[Shot 1]`, отсутствие слова cut; у продолжающего отрезка —
    блок продолжения в начале описания.
    """
    text = str(prompt or "")
    if not text.strip():
        return ["промт пустой"]
    bad = []
    if _NON_EN.search(text):
        bad.append("в промте текст не на английском (правило 1a: промт H3 пишется целиком по-английски)")
    order = [line.strip() for line in text.splitlines() if line.strip() in PROMPT_SECTIONS]
    for need in REQUIRED_SECTIONS:
        if need not in order:
            bad.append(f"нет секции {need.rstrip(':')}")
    if order != [s for s in PROMPT_SECTIONS if s in order]:
        bad.append("секции идут не по порядку: " + " → ".join(s.rstrip(":") for s in PROMPT_SECTIONS))
    if "summary:" in order:
        body = _section_body(text, "summary:")
        if not body.startswith("["):
            bad.append("summary должен начинаться с типа задачи в квадратных скобках, например "
                       "[reference generation]")
    if "[Shot 1]" not in text:
        bad.append("описание кадра должно начинаться со строки [Shot 1]")
    if "non_diegetic_music:" in order and not _section_body(text, "non_diegetic_music:"):
        bad.append("пустая строка non_diegetic_music — для ролика без музыки напиши N/A")
    low = text.lower()
    for phrase in META_PHRASES:
        if phrase in low:
            bad.append(f"служебная фраза в описании кадра: «{phrase}»")
    if re.search(r"\bcut\b|\bcuts\b|\bcutting\b", low):
        bad.append("в промте есть слово cut, а монтажных склеек в промте H3 нет (правило 8)")
    if continuation and not any(marker in low for marker in CONTINUATION_MARKERS):
        bad.append("продолжающий отрезок без блока продолжения: первые ~3 секунды — только продолжение "
                   "уже идущего кадра, без новых предметов и смены света (правило 11)")
    return bad


def _objects(text):
    """Все сбалансированные {...} из текста (строки в кавычках не мешают)."""
    out, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(str(text)):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth:
                depth -= 1
            if depth == 0 and start is not None:
                out.append(str(text)[start:i + 1])
                start = None
    return out


# закрывающий тег бывает и без «>» (модель обрывает его) — отсюда \s*>* 
THINK_RE = re.compile(r"<think\b[^>]*>.*?</think\s*>*|```think.*?```", re.I | re.S)


def strip_thinking(text):
    """Убрать блок размышлений и служебную обвязку вокруг промта (приём LongForge: модель кладёт ответ в think)."""
    out = THINK_RE.sub("", str(text or ""))
    out = re.sub(r"^\s*(?:вот|here(?:'s| is)|ок|okay)[^\n]{0,80}:\s*", "", out, flags=re.I)
    return out.strip()


def _json_block(text):
    """Достать JSON из ответа модели: чистый, в ```-блоке или в окружении текста.

    Если объектов несколько (модель рассуждала и писала черновики), берём ПОСЛЕДНИЙ разобравшийся:
    готовый ответ стоит в конце, а не в начале размышлений.
    """
    raw = str(text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", raw, re.S)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except ValueError:
        pass
    for candidate in reversed(_objects(raw)):
        try:
            return json.loads(candidate)
        except ValueError:
            continue
    return None      # не JSON: решение принимает parse_answer (ответ текстом годится для одного отрезка)


def parse_answer(text, plan, expect=None, index=None, continuation=False):
    """Ответ писателя → проверенные промты (число отрезков должно совпасть с ожидаемым).

    `expect` — сколько элементов ждём (по умолчанию все отрезки), `index` — чей это промт, когда пишут по одному.
    """
    data = _json_block(strip_thinking(text))
    segs = data.get("segments") if isinstance(data, dict) else data
    if not isinstance(segs, list):
        if index is not None:
            # пишем один отрезок: годится и ответ готовым текстом — JSON тут не обязателен
            plain = re.sub(r"```[a-zA-Z]*", "", strip_thinking(text)).strip().strip("`").strip()
            segs = [{"prompt": plain, "note": ""}] if plain else []
        if not isinstance(segs, list) or not segs:
            raise ValueError("Писатель вернул не JSON — нужен объект с segments")
    want = int(expect if expect is not None else len(plan["beats"]))
    if len(segs) != want:
        raise ValueError(f"Писатель вернул {len(segs)} отрезков вместо {want}")
    prompts = []
    for i, item in enumerate(segs):
        prompt = item.get("prompt") if isinstance(item, dict) else str(item)
        if not prompt or not str(prompt).strip():
            raise ValueError(f"Отрезок {i + 1} пришёл без промта")
        prompts.append(str(prompt).strip())
    out = []
    for i, (item, prompt) in enumerate(zip(segs, prompts)):
        idx = int(index) if index is not None else i
        cont = bool(plan["beats"][idx].get("overlap")) if 0 <= idx < len(plan["beats"]) else bool(continuation)
        broken = check_prompt_rules(prompt, continuation=cont)
        if broken:
            raise ValueError(f"Писатель нарушил правила промта H3 (отрезок {i + 1}): " + "; ".join(broken[:4]))
        out.append({"index": int(index) if index is not None else i, "prompt": prompt,
                    "note": str((item.get("note") if isinstance(item, dict) else "") or "").strip()})
    return {"title": str(data.get("title") or "") if isinstance(data, dict) else "",
            "logline": str(data.get("logline") or "") if isinstance(data, dict) else "",
            "segments": out}


_BULLET_RE = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s*")
_CJK_RE = re.compile(r"[\u3000-\u9fff\uac00-\ud7af]")          # иероглифы = размышления модели, не промт
_META_HINTS = ("концепц", "промпт:", "промт:", "prompt:", "let me", "thinking", "вариант", "идея:",
               "задание", "инструкц", "сегмент", "отрезок", "итог", "итак", "сначала", "нужно",
               "此处", "因此", "首先", "总结", "构思", "根据", "用俄语")

_STRICT_NOTE = ("Важно: ответь ТОЛЬКО JSON-объектом по контракту выше — без пояснений, списков, "
                "размышлений и посторонних языков. Каждый промт пиши ЦЕЛИКОМ по-английски (переведи идею сам), "
                "одной строкой в поле prompt.")


def clean_prompt_line(text):
    """Вытащить строку промта из болтливого ответа модели (пусто, если промта там нет).

    Дешёвые модели иногда отвечают рассуждением на другом языке или пустотой: такой ответ нельзя
    молча превращать в промт, но и терять годную строку не нужно — берём последнюю похожую на промт.
    """
    body = re.sub(r"```[a-zA-Z]*", "", str(text or ""))
    lines = []
    for raw in body.splitlines():
        line = _BULLET_RE.sub("", raw).strip().strip('"«»\'* ')
        if len(line) < 12 or _CJK_RE.search(line) or line[:1] in "{[<" or "\":" in line and '"' in line:
            continue
        low = line.lower()
        if low.endswith(":") or any(h in low[:24] for h in _META_HINTS):
            continue
        lines.append(line)
    return lines[-1] if lines else ""


def _idea_sentences(idea):
    """Идея → аккуратные предложения: шаблон не должен склеивать чужие строки в одну фразу."""
    text = " ".join(str(idea or "").split())
    if not text:
        return ["One continuous scene."]
    parts = [s.strip() for s in re.split(r"(?<=[.!?…])\s+", text) if s.strip()]
    out = []
    for s in parts:
        s = s[0].upper() + s[1:] if s else s
        out.append(s if s.endswith((".", "!", "?", "…")) else s + ".")
    return out


def _tidy_clause(text):
    """Кусок фразы → отдельное предложение: разделители не должны склеивать слова («кистью ставит»)."""
    line = " ".join(str(text or "").split()).strip(" ,;—–-")
    if not line:
        return ""
    line = line[0].upper() + line[1:]
    return line if line.endswith((".", "!", "?", "…")) else line + "."


def _idea_beats(idea, count):
    """Идея → ровно `count` частей, по одной на отрезок (одна и та же фраза дважды — плохой промт).

    Предложений обычно меньше, чем отрезков, поэтому самую длинную фразу дробим по `;`, `,` и ` — `
    (это черновик: аккуратный текст всё равно пишет человек или модель).
    """
    parts = _idea_sentences(idea)
    while len(parts) < count:
        cut, pieces = -1, []
        for i, part in enumerate(parts):
            split = [_tidy_clause(p) for p in re.split(r";\s*|\s+—\s+|,\s+(?=[а-яёa-z])", part) if p.strip()]
            if len(split) > 1 and len(split) > len(pieces):
                cut, pieces = i, split
        if cut < 0:
            break
        parts[cut:cut + 1] = pieces
    if not parts:
        parts = [""]
    while len(parts) < count:
        parts.append(parts[-1])                       # вырожденный случай: одна мысль на несколько отрезков
    if len(parts) > count:
        parts = parts[:count - 1] + [" ".join(parts[count - 1:])]
    return parts


SLICE_HINT = ("Each segment describes only its own beat of the idea, in its own words: the same action must "
              "never be repeated in two segments.")


_NON_EN = re.compile(r"[а-яё]", re.I)


def english_or_placeholder(text):
    """Промт H3 пишется по-английски. Идея на русском без модели не переводится — ставим место под перевод.

    Возвращает (строка для промта, нужен ли перевод): перевод нужен, когда в тексте есть кириллица.
    """
    line = " ".join(str(text or "").split()).strip()
    if not line:
        return "", False
    if _NON_EN.search(line):
        return "", True
    return line, False


def fallback_prompts(plan, style="", sound="", voice="", refs=()):
    """Шаблонный писатель: серия собирается без LLM (промты в формате H3, по отрезку на шаг).

    Промт собран как пресеты пака: `subject_definitions` → `summary` с `[reference generation]` →
    `retention_analysis` (только когда у отрезка есть референсы, иначе строка врёт о несуществующей
    картинке) → `detailed_description` со строкой `[Shot 1]` → `overall_soundscape` → `non_diegetic_music`.
    Каждый отрезок берёт свою часть идеи: повторять одно действие дважды — значит получить один и тот же
    кадр дважды. Это рыба, а не готовый промт; в `note` стоит пометка «шаблон».
    """
    beats = plan["beats"]
    sentences = _idea_sentences(plan["idea"])
    parts = _idea_beats(plan["idea"], len(beats))
    style_line, style_needs_en = english_or_placeholder(style or "")
    sound_line, sound_needs_en = english_or_placeholder(sound or "")
    voice_line, voice_needs_en = english_or_placeholder(voice or "")
    out = []
    for b in beats:
        i = b["index"]
        beat_text, needs_en = english_or_placeholder(parts[i])     # своя часть идеи у каждого отрезка
        if beat_text and not beat_text.endswith((".", "!", "?", "…")):
            beat_text += "."
        if needs_en:
            # перевода у шаблона нет: в промте — английское место под перевод, русский текст уходит в пометку
            beat_text = ("Replace this line with the English description of this part of the action, keeping "
                         "the same subject, wardrobe and light as every other part of the film.")
        # блок продолжения: первые ~3 секунды — только продолжение уже идущего кадра, без новых предметов
        opening = ("[Shot 1] The video opens already in progress, mid-motion. The camera holds exactly the "
                   "position, height and distance it already has, and the person keeps moving at exactly the same "
                   "pace through the space they are already in, the light on them unchanged. For the first three "
                   "seconds nothing changes: no new object enters the frame, the light does not shift, and the "
                   "person does not stop or turn around." if b["overlap"]
                   else "[Shot 1] The shot opens the film: the camera is already settled on the scene, the light "
                        "is steady and the person is mid-motion from the first frame.")
        closing = ("At the end of the shot the person is still carrying the action on, mid-motion, with nothing "
                   "else in progress." if i < len(beats) - 1
                   else "The shot ends on a held final pose while the motion settles.")
        lines = [
            "subject_definitions:",
            "<Subject 1> is the person of the scene: the same face, hair, build and wardrobe as in every other "
            "part of this film.",
            "summary:",
            f"[reference generation] A {b['seconds']:.2f}-second shot of one continuous film: {beat_text}",
        ]
        if refs:
            lines += ["retention_analysis:",
                      "<Subject 1> (appears in [Shot 1]): fully_preserved - face, hair and wardrobe follow the "
                      "reference exactly, with no change of hairstyle, clothing or accessories."]
        lines += [
            "detailed_description:",
            style_line or "Live-action, cinematic, real-time speed. Natural light, fine film grain, stable "
                          "framing, a hand-held texture that stays calm.",
            f"{opening} {beat_text} {closing}",
            "The person's hands, gaze and breathing carry the action: unhurried, deliberate, physically "
            "believable, with no extra people entering the frame.",
            "overall_soundscape:",
            sound_line or "The quiet ambience of the room and the small sounds the action itself makes.",
            "non_diegetic_music:",
            "N/A",
        ]
        # имена из деталей, которые не удалось перенести на английский, остаются здесь, а не в промте
        notes = []
        if needs_en:
            notes.append("переведите идею на английский: " + parts[i])
        if style_needs_en:
            notes.append("стиль задан по-русски: " + str(style))
        if sound_needs_en:
            notes.append("звук задан по-русски: " + str(sound))
        if voice_needs_en:
            notes.append("речь задана по-русски: " + str(voice))
        draft = ("шаблон — " + "; ".join(notes)) if notes else \
            "шаблон — напишите свой текст или подключите модель в «Ассистенте»"
        out.append({"index": i, "prompt": "\n".join(lines), "note": draft})
    return {"title": " ".join(sentences)[:60], "logline": " ".join(sentences), "segments": out}


def write_series(plan, fetch=None, style="", refs=(), language="ru", extra="", sound="", allow_fallback=True,
                 only=None, previous_prompt=""):
    """Промты для серии: писателем (если он есть) или шаблоном; при сбое писателя — шаблон и причина.

    `fetch(messages) -> текст ответа` — любая функция вызова модели, поэтому логика проверяется без LLM.
    `only` — писать промт одного отрезка: длинная серия не зависит от одного длинного ответа.
    """
    messages = writer_messages(plan["idea"], plan, style=style, refs=refs, language=language, extra=extra,
                               only=only, previous_prompt=previous_prompt)

    def template(index=None):
        full = fallback_prompts(plan, style=style, sound=sound, refs=refs)
        if index is None:
            return full
        one = next((s for s in full["segments"] if s["index"] == int(index)), None)
        return {"title": full["title"], "logline": full["logline"], "segments": [one] if one else []}

    if fetch is None:
        return {"written": template(only), "used": "template", "messages": messages}
    expect = 1 if only is not None else None
    strict = messages + [{"role": "user", "content": _STRICT_NOTE}]
    answer, error, attempts, last_exc = "", "", 0, None
    try:
        for attempt in (0, 1):
            attempts = attempt + 1
            answer = fetch(messages if attempt == 0 else strict)
            try:
                seg_plan = plan["beats"][int(only)] if only is not None else None
                cont = bool(seg_plan and seg_plan.get("overlap")) if seg_plan else False
                written = parse_answer(answer, plan, expect=expect, index=only, continuation=cont)
                out = {"written": written, "used": "llm", "messages": messages, "attempts": attempts}
                return {**out, **({"only": only} if only is not None else {})}
            except Exception as exc:
                error, last_exc = str(exc), exc
        raise last_exc if last_exc is not None else RuntimeError("Писатель не дал промтов")
    except Exception as exc:
        if not allow_fallback:
            raise
        fallback = template(only)
        fallback["error"] = str(exc)
        return {"written": fallback, "used": "template", "messages": messages, "error": str(exc), "attempts": attempts,
                **({"only": only} if only is not None else {})}


def _is_draft(segment):
    """Промт-рыба из шаблона (её можно заменить, а написанный моделью текст — нет)."""
    return str((segment or {}).get("note") or "").startswith("шаблон")


def build_project(plan, written, settings=None, name=None, existing=None, refs=None, assets=None,
                  cards=None, card_snaps=None):
    """Серия → обычный проект пака: отрезки со связью, перекрытием и промтами.

    `existing` — уже сохранённый проект этой же серии: если раскладка отрезков та же, а новый промт
    пришёл из шаблона, оставляем написанный ранее (моделью) промт — перепланирование не должно молча
    затирать чужой текст рыбой.
    """
    from . import h3s_library as lib
    prompt_items = {s["index"]: s for s in (written or {}).get("segments", [])}
    old = {i: seg for i, seg in enumerate((existing or {}).get("segments") or [])}
    same_layout = bool(old) and len(old) == len(plan["beats"]) and all(
        int(old[i].get("frames") or 0) == int(plan["beats"][i]["frames"]) for i in old)
    prompts = {}
    for i, item in prompt_items.items():
        kept = old.get(i) if same_layout else None
        # рыба из шаблона не имеет права затирать уже написанный текст при перепланировании
        if kept and _is_draft(item) and str(kept.get("prompt") or "").strip():
            prompts[i] = kept["prompt"]
        else:
            prompts[i] = item["prompt"]
    # Референсы серии: одни и те же ассеты на всех отрезках, чтобы метки <Picture N>/<Video N>
    # из промтов разрешались в каждом отрезке, а не только в первом.
    ref_ids = [str(r) for r in (refs or []) if str(r).strip()]
    # Персонажи-карточки: на отрезки идут ссылки (id/вес/вкл), а в проект — снимки из библиотеки.
    # Снимок и есть то, чем пользуется генерация, поэтому файлы копировать не нужно.
    card_refs = core.normalize_card_refs([{"id": c} if isinstance(c, str) else c for c in (cards or [])])
    snaps = core.normalize_card_snaps(card_snaps or {})
    card_refs = [c for c in card_refs if not snaps or c["id"] in snaps]
    segments = []
    for b in plan["beats"]:
        segments.append({"id": f"s{b['index'] + 1}", "name": f"{b['index'] + 1}. {b['role']}",
                         "frames": int(b["frames"]), "prompt": prompts.get(b["index"], ""),
                         "link": "cut" if b["index"] == 0 else "extend",
                         "overlap_blocks": int(b["overlap_blocks"]), "refs": list(ref_ids),
                         "cards": [dict(c) for c in card_refs]})
    wide = plan["width"] >= plan["height"]
    # Референсы указывают на ассеты исходного проекта: без их копии в новом проекте метки
    # <Picture N>/<Video N> не разрешались бы при генерации.
    wanted = {str(r) for r in ref_ids}
    keep_assets = [{k: a.get(k) for k in ("id", "name", "file", "subfolder", "type", "category")}
                   for a in (assets or []) if str(a.get("id")) in wanted]
    # Персонажи-карточки: на отрезки идут ссылки (id/вес/вкл), а в проект — снимки из библиотеки.
    # Снимок и есть то, чем пользуется генерация, поэтому файлы копировать не нужно.
    card_refs = core.normalize_card_refs([{"id": c} if isinstance(c, str) else c for c in (cards or [])])
    snaps = core.normalize_card_snaps(card_snaps or {}) if card_snaps else {}
    card_refs = [c for c in card_refs if not snaps or c["id"] in snaps]
    project = {"id": lib.clean_id(name or plan["idea"][:24] or "series"),
               "name": name or (written or {}).get("title") or plan["idea"][:60] or "Серия",
               "settings": dict(settings or {}), "segments": segments, "assets": keep_assets,
               "cards": {k: dict(v) for k, v in snaps.items()},
               "stats": {"series": {"idea": plan["idea"], "logline": (written or {}).get("logline") or "",
                                    "beats": len(plan["beats"]), "seconds": plan["seconds"],
                                    "budget": plan["budget"]}},
               "run": {"operation": "full"}}
    project = core.normalize_project(project)
    project["settings"]["width"] = int(plan["width"])
    project["settings"]["height"] = int(plan["height"])
    project["settings"]["res_mode"] = "custom"
    project["settings"]["continuation_method"] = "overlap" if plan["overlap_blocks"] else "last_frame"
    project["settings"]["overlap_blocks"] = int(plan["overlap_blocks"])
    project["settings"]["continuity_ref"] = bool(plan["overlap_blocks"])
    project["settings"]["fps"] = core.FPS
    return project


def total_new_frames(project):
    """Сколько всего кадров ролик играет (без перекрытий и без служебного первого кадра)."""
    out = 0
    for i, s in enumerate(project.get("segments") or []):
        o = int(s.get("overlap_blocks") or 0)
        out += int(s["frames"]) - (core.overlap_frames(o) if o else 5)
    return out
