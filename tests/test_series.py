"""A series from one idea: the split by token budget, the writer contract and the assembled project."""
import json

import pytest

from h3s import h3s_core as core
from h3s import h3s_series as S


def good_prompt(action_en="She winds the old clock while dust drifts in the light."):
    """Промт, который соблюдает правила H3: им пользуются тесты писателя и проверки правил."""
    return ("subject_definitions:\n<Subject 1> is the woman of the scene: the same face, hair, build and "
            "wardrobe as in every part of the film.\nsummary:\n[reference generation] A 5.17-second shot of one "
            "continuous film: " + action_en + "\ndetailed_description:\n[Shot 1] The camera holds exactly the "
            "position, height and distance it already has, the person is already in progress, mid-motion, and "
            "nothing new enters the frame. " + action_en + "\noverall_soundscape:\nQuiet room tone with small "
            "metal sounds.\nnon_diegetic_music:\nN/A")


def test_plan_tiles_the_whole_time_and_stays_legal():
    plan = S.plan_beats("Реставрация заброшенного отеля: рабочие находят старую вывеску", 40, w=1344, h=768,
                        budget=180_000)
    beats = plan["beats"]
    assert plan["seconds"] == pytest.approx(40, abs=0.4)
    assert sum(b["new_frames"] for b in beats) == plan["frames"]
    assert abs(plan["frames"] - 40 * 24) <= 9
    for b in beats:
        assert (b["frames"] - 5) % 17 == 0 and b["frames"] <= core.TRAINED_MAX_FRAMES
        assert b["new_frames"] == 17 * b["blocks"] and b["new_frames"] > 0
    assert [b["index"] for b in beats] == list(range(len(beats)))
    assert [b["link"] for b in beats] == ["cut"] + ["extend"] * (len(beats) - 1)
    assert [b["start_frame"] for b in beats] == sorted(b["start_frame"] for b in beats)


def test_a_tighter_budget_makes_more_beats():
    wide = S.plan_beats("идея", 60, w=1344, h=768, budget=200_000)
    tight = S.plan_beats("идея", 60, w=1344, h=768, budget=60_000)
    assert len(tight["beats"]) > len(wide["beats"])
    assert all(b["tokens"] <= tight["budget"] for b in tight["beats"])
    assert not tight["over_budget"]


def test_beats_can_be_asked_for_explicitly_and_are_even():
    plan = S.plan_beats("идея", 30, w=960, h=544, budget=200_000, beats=4)
    blocks = [b["blocks"] for b in plan["beats"]]
    assert len(plan["beats"]) == 4
    assert max(blocks) - min(blocks) <= 1
    assert sum(b["new_frames"] for b in plan["beats"]) == plan["frames"]


def test_overlap_is_carried_between_beats():
    plan = S.plan_beats("идея", 30, w=960, h=544, budget=200_000, beats=3, overlap_blocks=2)
    first, cont = plan["beats"][0], plan["beats"][1]
    assert first["overlap"] == 0 and first["overlap_blocks"] == 0
    assert cont["overlap"] == core.overlap_frames(2) and cont["overlap_blocks"] == 2
    assert cont["frames"] == cont["new_frames"] + cont["overlap"]


def test_a_tiny_series_is_one_beat():
    plan = S.plan_beats("короткая идея", 4, w=1344, h=768, budget=200_000)
    assert len(plan["beats"]) == 1 and plan["beats"][0]["link"] == "cut"
    assert plan["beats"][0]["frames"] == 17 * plan["beats"][0]["blocks"] + 5


def test_impossible_budget_is_refused_clearly():
    with pytest.raises(ValueError, match="не влезают в бюджет"):
        S.plan_beats("идея", 20, w=1344, h=768, budget=1_000)
    with pytest.raises(ValueError, match="больше нуля"):
        S.plan_beats("идея", 0)


def test_writer_messages_carry_the_idea_the_beats_and_the_contract():
    plan = S.plan_beats("Женщина чинит старый радиоприёмник в мастерской", 24, w=960, h=544, budget=200_000, beats=3)
    msgs = S.writer_messages("Женщина чинит старый радиоприёмник", plan, style="Warm documentary look.",
                             refs=["photo of the woman"], language="ru", extra="Тишина, без музыки")
    assert [m["role"] for m in msgs] == ["system", "user"]
    sys_text, user = msgs[0]["content"], msgs[1]["content"]
    assert '"segments"' in sys_text and "Exactly 3 items" in sys_text
    assert "[Shot 1]" in sys_text and "non_diegetic_music" in sys_text
    assert "part 1 of" not in sys_text and "part 2 of" not in sys_text      # без служебной нумерации частей
    assert "радиоприёмник" in user and "Warm documentary look." in user and "photo of the woman" in user
    assert user.count("с (") == 3 and "роль:" in user and "связь:" in user


def test_parse_answer_tolerates_fences_and_rejects_wrong_shapes():
    plan = S.plan_beats("идея", 20, w=960, h=544, budget=200_000, beats=2)
    good = {"title": "Мастерская", "logline": "Она чинит радио",
            "segments": [{"prompt": good_prompt("She picks up the screwdriver."), "note": "начало"},
                         {"prompt": good_prompt("She switches the radio on."), "note": "финал"}]}
    for text in (json.dumps(good, ensure_ascii=False),
                 "Вот результат:\n```json\n" + json.dumps(good, ensure_ascii=False) + "\n```\nГотово."):
        got = S.parse_answer(text, plan)
        assert got["title"] == "Мастерская" and len(got["segments"]) == 2
        assert "She switches the radio on." in got["segments"][1]["prompt"]
    with pytest.raises(ValueError, match="вместо 2"):
        S.parse_answer(json.dumps({"segments": [{"prompt": "один"}]}, ensure_ascii=False), plan)
    with pytest.raises(ValueError, match="без промта"):
        S.parse_answer(json.dumps({"segments": [{"prompt": "x"}, {"prompt": "  "}]}, ensure_ascii=False), plan)
    with pytest.raises(ValueError, match="не JSON"):
        S.parse_answer("извините, не могу", plan)


def test_fallback_writer_makes_one_prompt_per_beat():
    plan = S.plan_beats("A man walks through a night market", 30, w=960, h=544, budget=200_000, beats=3)
    written = S.fallback_prompts(plan, style="Neon night look.", sound="Distant crowd.")
    assert len(written["segments"]) == len(plan["beats"])
    first, second, last = (s["prompt"] for s in written["segments"])
    for prompt in (first, second, last):
        assert "[Shot 1]" in prompt and prompt.rstrip().endswith("N/A")
        assert "Neon night look." in prompt and "Distant crowd." in prompt
        assert "subject_definitions:" in prompt and "summary:" in prompt
        assert "[reference generation]" in prompt and "detailed_description:" in prompt
    assert "opens the film" in first and "opens already in progress" in second
    assert "still carrying the action on" in second and "still carrying the action on" not in last
    assert written["segments"][0]["note"].startswith("шаблон")          # the template says it is a draft


def test_the_template_gives_every_beat_its_own_part_of_the_idea():
    """Одно действие в двух отрезках = один и тот же кадр дважды: у каждого отрезка своя часть идеи."""
    plan = S.plan_beats("The first thought. The second thought!", 20, w=960, h=544, budget=200_000, beats=2)
    segs = S.fallback_prompts(plan)["segments"]
    assert "The first thought." in segs[0]["prompt"] and "The second thought!" not in segs[0]["prompt"]
    assert "The second thought!" in segs[1]["prompt"] and "The first thought." not in segs[1]["prompt"]
    # и предложения не склеиваются чужой строкой посередине
    assert "The first thought. At the end of the shot" in segs[0]["prompt"]


def test_the_template_does_not_claim_references_it_does_not_have():
    """Без референсов строка retention_analysis врала бы о несуществующей картинке."""
    plan = S.plan_beats("женщина и часы", 20, w=960, h=544, budget=200_000, beats=2)
    plain = S.fallback_prompts(plan)["segments"][0]["prompt"]
    assert "retention_analysis" not in plain
    with_refs = S.fallback_prompts(plan, refs=("кадр женщины",))["segments"][0]["prompt"]
    assert "retention_analysis:" in with_refs and "fully_preserved" in with_refs


def test_write_series_uses_the_writer_and_falls_back_on_a_bad_answer():
    plan = S.plan_beats("Мальчик запускает воздушного змея", 24, w=960, h=544, budget=200_000, beats=2)
    answer = "```json\n" + json.dumps({"title": "Змей", "segments": [
        {"prompt": good_prompt("He unwinds the string.")},
        {"prompt": good_prompt("The kite climbs into the sky.")}]}, ensure_ascii=False) + "\n```"
    calls = []

    def fetch(messages):
        calls.append(messages)
        return answer

    got = S.write_series(plan, fetch=fetch, style="Sunny field.")
    assert got["used"] == "llm" and got["written"]["title"] == "Змей"
    assert calls and calls[0][1]["content"].count("Змей") == 0            # the idea text goes to the writer
    assert "unwinds the string" in got["written"]["segments"][0]["prompt"]

    def broken(_messages):
        return "не могу помочь"

    fell = S.write_series(plan, fetch=broken, style="Sunny field.")
    assert fell["used"] == "template" and fell["error"] and len(fell["written"]["segments"]) == 2
    assert "opens the film" in fell["written"]["segments"][0]["prompt"]
    assert "opens already in progress" in fell["written"]["segments"][1]["prompt"]
    with pytest.raises(ValueError):
        S.write_series(plan, fetch=broken, allow_fallback=False)
    offline = S.write_series(plan)
    assert offline["used"] == "template" and len(offline["written"]["segments"]) == 2


def test_writing_one_segment_at_a_time():
    """Клиент пишет по отрезку за запрос: длинная серия не зависит от одного длинного ответа."""
    plan = S.plan_beats("A restorer rebuilds an old globe", 40, w=960, h=544, budget=200_000, beats=3)
    asked = []

    def fetch(messages):
        asked.append(messages[1]["content"])
        return json.dumps({"segments": [{"prompt": good_prompt("He lifts a layer of paint.")}]},
                          ensure_ascii=False)

    for k in range(3):
        got = S.write_series(plan, fetch=fetch, only=k)
        assert got["used"] == "llm" and len(got["written"]["segments"]) == 1
        assert got["written"]["segments"][0]["index"] == k
        assert f"This is segment {k + 1} of 3." in asked[-1]               # the writer is told which one
        assert f"Write SEGMENT {k + 1} of 3 ONLY" in got["messages"][0]["content"]
    assert len(asked) == 3 and len(set(asked)) == 3

    def broken(_messages):
        raise RuntimeError("Fetch timeout")

    fell = S.write_series(plan, fetch=broken, only=1)
    assert fell["used"] == "template" and fell["error"] == "Fetch timeout"
    assert [s["index"] for s in fell["written"]["segments"]] == [1]     # the template fills just this beat
    assert "opens already in progress" in fell["written"]["segments"][0]["prompt"]
    with pytest.raises(ValueError):
        S.write_series(plan, fetch=lambda m: json.dumps({"segments": [{"prompt": "a"}, {"prompt": "b"}]}),
                       only=0, allow_fallback=False)


def test_the_last_json_object_wins_when_the_model_reasoned_first():
    """Thinking-модель пишет черновики по пути: готовый ответ берём последним, а не первым."""
    plan = S.plan_beats("Двое настраивают лодку", 20, w=960, h=544, budget=200_000, beats=1)
    text = ('Сначала прикину: {"segments": [{"prompt": "черновик"}]} — нет, нужен формат H3.\n'
            'Теперь по правилам: ' + json.dumps({"title": "Лодка", "segments": [{"prompt": good_prompt("They push the boat off the pier.")}]}, ensure_ascii=False))
    got = S.parse_answer(text, plan)
    assert "They push the boat off the pier." in got["segments"][0]["prompt"] and got["title"] == "Лодка"
    # и braces внутри строк не ломают разбор
    tricky = json.dumps({"segments": [{"prompt": good_prompt("She says {quietly} and leaves.")}]},
                        ensure_ascii=False)
    assert "{quietly}" in S.parse_answer(tricky, plan)["segments"][0]["prompt"]


def test_build_project_gives_a_normal_pack_project():
    plan = S.plan_beats("Двое настраивают лодку у причала", 30, w=960, h=544, budget=200_000, beats=3,
                        overlap_blocks=1)
    written = S.fallback_prompts(plan)
    project = S.build_project(plan, written, settings={"steps": 4, "model_preset": "pi4"}, name="Лодка")
    core.normalize_project(project)                     # must survive the pack's normalizer
    segs = project["segments"]
    assert len(segs) == 3 and project["name"] == "Лодка"
    assert [s["link"] for s in segs] == ["cut", "extend", "extend"]
    assert [s["frames"] for s in segs] == [b["frames"] for b in plan["beats"]]
    assert all(s["prompt"].startswith("subject_definitions:") for s in segs)
    assert project["settings"]["width"] == 960 and project["settings"]["height"] == 544
    assert project["settings"]["overlap_blocks"] == 1 and project["settings"]["continuity_ref"] is True
    assert project["settings"]["continuation_method"] == "overlap"
    assert S.total_new_frames(project) == plan["frames"]


def test_build_project_keeps_a_hard_cut_series_cut():
    plan = S.plan_beats("идея", 20, w=960, h=544, budget=200_000, beats=2, overlap_blocks=0)
    project = S.build_project(plan, S.fallback_prompts(plan), name="Стык")
    assert project["settings"]["overlap_blocks"] == 0 and project["settings"]["continuity_ref"] is False
    assert project["settings"]["continuation_method"] == "last_frame"


def test_a_chatty_answer_is_not_mistaken_for_a_prompt():
    """Дешёвая модель отвечает рассуждением (в т.ч. на другом языке) — это не промт."""
    reasoning = ("- 用俄语回答（因为提示是俄语，且系统指令是俄语）\n- 只回答一行。\n"
                 "- 描述画面：女人，修理，老式收音机\n构思一行俄语提示词")
    assert S.clean_prompt_line(reasoning) == ""
    assert S.clean_prompt_line("") == ""
    assert S.clean_prompt_line("- Промпт: что-то про часы\n") == ""
    good = "Женщина заводит настенные часы в мастерской, пыль искрится в луче света из окна."
    assert S.clean_prompt_line(good) == good
    assert S.clean_prompt_line("Думаю так:\n- вариант\n" + good) == good


def _chatty_then_json(plan):
    calls = {"n": 0}

    def fetch(messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return "分词思考：应当描述 мастерская 和 часы."      # рассуждение вместо JSON
        assert "ТОЛЬКО JSON" in messages[-1]["content"]          # повтор идёт с усиленным заданием
        return json.dumps({"title": "Часы", "logline": "", "segments": [
            {"prompt": good_prompt("She winds the wall clock; light from the window falls on the gears."),
             "note": ""}]}, ensure_ascii=False)

    return fetch, calls


def test_a_reasoning_answer_triggers_one_strict_retry():
    plan = S.plan_beats("женщина и часы", 12, w=960, h=544, beats=2)
    fetch, calls = _chatty_then_json(plan)
    got = S.write_series(plan, fetch=fetch, only=1)
    assert got["used"] == "llm" and got["attempts"] == 2 and calls["n"] == 2
    assert "winds the wall clock" in got["written"]["segments"][0]["prompt"]


def test_a_hopeless_writer_falls_back_after_two_attempts():
    plan = S.plan_beats("женщина и часы", 12, w=960, h=544, beats=2)
    calls = {"n": 0}

    def fetch(messages):
        calls["n"] += 1
        return ""

    got = S.write_series(plan, fetch=fetch, only=1)
    assert got["used"] == "template" and got["attempts"] == 2
    assert calls["n"] == 2 and got["written"]["segments"][0]["prompt"].startswith("subject_definitions")


def test_a_replan_does_not_overwrite_a_written_prompt_with_the_draft():
    """Перепланирование серии не должно молча затирать написанный моделью промт рыбой из шаблона."""
    plan = S.plan_beats("женщина и часы", 20, w=960, h=544, budget=200_000, beats=2)
    good = {"title": "", "logline": "", "segments": [
        {"index": 0, "prompt": good_prompt("A hand picks up the tweezers."), "note": ""},
        {"index": 1, "prompt": good_prompt("The gear clicks into place."), "note": ""}]}
    first = S.build_project(plan, good, name="Часы")
    draft = S.fallback_prompts(plan)
    again = S.build_project(plan, draft, name="Часы", existing=first)
    assert "picks up the tweezers" in again["segments"][0]["prompt"]      # написанное осталось
    assert "clicks into place" in again["segments"][1]["prompt"]
    # а когда раскладка другая, новый шаблон берётся целиком
    other = S.plan_beats("женщина и часы", 40, w=960, h=544, budget=200_000, beats=3)
    three = S.build_project(other, S.fallback_prompts(other), name="Часы", existing=first)
    assert len(three["segments"]) == 3 and "picks up the tweezers" not in three["segments"][0]["prompt"]


def test_a_one_sentence_idea_is_split_between_the_beats():
    """Длинная идея одним предложением не должна целиком повторяться в каждом отрезке."""
    plan = S.plan_beats("She takes the clock off the wall; she cleans the movement with a brush; she sets it "
                        "back and winds it.", 30, w=960, h=544, budget=200_000, beats=3)
    segs = S.fallback_prompts(plan)["segments"]
    texts = [s["prompt"].split("[Shot 1]")[1].lower() for s in segs]
    assert "takes the clock" in texts[0] and "takes the clock" not in texts[1]
    assert "cleans the movement" in texts[1] and "sets it back" in texts[2]
    assert "cleans the movement" not in texts[0] and "sets it back" not in texts[1]   # у каждого свой кусок


def test_split_clauses_keep_their_punctuation():
    """Разбор идеи на части не должен склеивать слова соседних действий."""
    plan = S.plan_beats("The master takes the clock off the wall, cleans the movement with a brush and winds it.",
                        20, w=960, h=544, budget=200_000, beats=2)
    segs = S.fallback_prompts(plan)["segments"]
    for seg in segs:
        body = seg["prompt"].split("[Shot 1]")[1]
        for bad in ("wall, cleans", "brushIt"):
            assert bad not in body
    assert "brush and winds" not in segs[0]["prompt"]                 # это кусок второго отрезка
    assert "The master takes the clock off the wall." in segs[0]["prompt"]


def test_the_template_follows_the_h3_prompt_rules():
    """Шаблон и сам обязан соблюдать правила: английский, секции по порядку, [Shot 1], тип задачи."""
    plan = S.plan_beats("Мастер реставрирует старые настенные часы в тесной мастерской", 20,
                        w=960, h=544, budget=200_000, beats=2)
    for variant in (S.fallback_prompts(plan), S.fallback_prompts(plan, style="Neon look.", sound="Rain."),
                    S.fallback_prompts(plan, refs=("кадр мастера",))):
        for seg in variant["segments"]:
            assert S.check_prompt_rules(seg["prompt"]) == [], (seg["prompt"], S.check_prompt_rules(seg["prompt"]))


def test_a_russian_idea_never_leaks_into_the_prompt():
    """Идея по-русски: шаблон не переводит, поэтому в промте место под перевод, а русский текст — в пометке."""
    plan = S.plan_beats("Мастер чинит часы", 12, w=960, h=544, budget=200_000, beats=2)
    seg = S.fallback_prompts(plan)["segments"][0]
    assert "Мастер чинит часы" not in seg["prompt"] and "Мастер чинит часы" in seg["note"]
    assert "Replace this line with the English description" in seg["prompt"]
    assert S.check_prompt_rules(seg["prompt"]) == []


def test_the_writer_must_follow_the_rules():
    """Писатель, который подмешал русский или забыл секции, ответ не принимается."""
    plan = S.plan_beats("женщина и часы", 12, w=960, h=544, beats=2)
    russian = ("subject_definitions:\n<Subject 1> is the woman.\nsummary:\n[reference generation] она "
               "заводит часы.\ndetailed_description:\n[Shot 1] она заводит часы.\nnon_diegetic_music:\nN/A")
    bad = S.check_prompt_rules(russian)
    assert any("английск" in b for b in bad)
    bare = "detailed_description:\n[Shot 1] она заводит часы"
    bad = S.check_prompt_rules(bare)
    assert any("subject_definitions" in b for b in bad) and any("summary" in b for b in bad)
    meta = ("subject_definitions:\n<Subject 1> is the woman.\nsummary:\n[reference generation] The target video "
            "presents a 12-second shot, part 1 of 2.\ndetailed_description:\n[Shot 1] The shot opens.\n"
            "non_diegetic_music:\nN/A")
    assert any("служебная" in b for b in S.check_prompt_rules(meta))
    assert S.check_prompt_rules("") == ["промт пустой"]

    calls = {"n": 0}

    def fetch(messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps({"segments": [{"prompt": russian}]}, ensure_ascii=False)
        return json.dumps({"segments": [{"prompt": "subject_definitions:\n<Subject 1> is the woman with the "
                                                  "same wardrobe.\nsummary:\n[reference generation] A 5.17-second "
                                                  "shot: she winds the old clock.\ndetailed_description:\n[Shot 1] "
                                                  "The shot opens on the workshop. She winds the clock.\n"
                                                  "non_diegetic_music:\nN/A"}]}, ensure_ascii=False)

    got = S.write_series(plan, fetch=fetch, only=0)
    assert got["used"] == "llm" and got["attempts"] == 2 and calls["n"] == 2
    assert "она заводит" not in got["written"]["segments"][0]["prompt"]


def test_the_writer_brief_carries_the_chain_rules():
    """Контракт писателя — из скилла Long Take: продолжение отрезка, стык на скучном месте, +0.92 с, без слова cut."""
    plan = S.plan_beats("A restorer rebuilds an old clock", 30, w=960, h=544, budget=200_000, beats=2)
    contract = S.CONTRACT
    assert "continuation block" in contract and "0.92" in contract
    assert "cut" in contract and "join" in contract.lower()
    assert "2-3 beats per 10 seconds" in contract and "[Shot 1]" in contract
    assert "English" in contract
    msgs = S.writer_messages("Anything", plan, only=1)
    assert "Write SEGMENT 2 of 2 ONLY" in msgs[0]["content"]


def test_a_continuation_prompt_needs_the_continuation_block():
    """Продолжающий отрезок без блока продолжения — нарушение: модель склеит новый кадр вместо продолжения."""
    plan = S.plan_beats("A restorer rebuilds an old clock", 30, w=960, h=544, budget=200_000, beats=2)
    fresh = ("subject_definitions:\n<Subject 1> is the woman of the scene.\nsummary:\n[reference generation] A "
             "5.17-second shot: she lifts the movement out of the case.\ndetailed_description:\n[Shot 1] The shot "
             "opens the film: the camera is already settled on the scene and she lifts the movement out of the "
             "case (a fresh opening, not a continuation).\noverall_soundscape:\nQuiet room tone.\n"
             "non_diegetic_music:\nN/A")
    bad = S.check_prompt_rules(fresh, continuation=True)
    # якорь — номер правила: он ASCII, и сравнение не зависит от невидимых символов в тексте
    assert any("(правило 11)" in b for b in bad), bad
    good = ("subject_definitions:\n<Subject 1> is the woman of the scene.\nsummary:\n[reference generation] A "
            "10.83-second shot of one continuous film: she keeps working.\ndetailed_description:\n[Shot 1] The "
            "video opens already in progress, mid-motion. The camera holds exactly the position, height and "
            "distance it already has, and she keeps moving at exactly the same pace.\noverall_soundscape:\nQuiet "
            "room tone.\nnon_diegetic_music:\nN/A")
    assert S.check_prompt_rules(good, continuation=True) == []
    with_cut = good.replace("Quiet room tone", "Quiet room tone, no cut away from her")
    assert any("(правило 8)" in b for b in S.check_prompt_rules(with_cut, continuation=True))


def test_one_segment_can_come_as_plain_text_with_the_previous_prompt():
    """Один отрезок пишется текстом (JSON тут ломает дешёвые модели), и видит промт предыдущего отрезка."""
    plan = S.plan_beats("A restorer rebuilds an old clock; she hangs it back and winds it.", 30,
                        w=960, h=544, budget=200_000, beats=2)
    seen = {}

    def fetch(messages):
        seen["user"] = messages[1]["content"]
        return good_prompt("She finishes brushing the movement and closes the case.")

    got = S.write_series(plan, fetch=fetch, only=1, previous_prompt=good_prompt("She starts brushing."))
    assert got["used"] == "llm" and "She finishes brushing" in got["written"]["segments"][0]["prompt"]
    assert "FINISHED PROMPT ONLY" in got["messages"][0]["content"]
    assert "She starts brushing." in seen["user"] and "FOR CONTINUITY ONLY" in seen["user"]   # контекст продолжения
    assert "hangs it back" in seen["user"] or "rebuilds an old clock" in seen["user"]   # своя часть идеи
    # ответ текстом соблюдает правила — принимается; на русском — нет
    russian = S.write_series(plan, fetch=lambda m: "она заканчивает чистить механизм", only=1)
    assert russian["used"] == "template"


def test_the_brief_asks_for_a_slice_not_the_whole_idea():
    """Часть идеи отрезка идёт писателю как его задание: вся идея — только для контекста."""
    plan = S.plan_beats("One. Two. Three.", 30, w=960, h=544, budget=200_000, beats=3)
    msg = S.writer_messages("One. Two. Three.", plan, only=2)["1"] if False else S.writer_messages(
        "One. Two. Three.", plan, only=2)[1]["content"]
    assert "Your part of the idea (this one only): Three." in msg
    assert msg.index("Your part of the idea") < msg.index("Whole series for context only")


def test_a_thinking_answer_is_unwrapped():
    """Приём LongForge: thinking-модель отдаёт ответ в <think…>, и он не должен теряться."""
    plan = S.plan_beats("A restorer rebuilds an old clock; she hangs it back and winds it.", 30,
                        w=960, h=544, budget=200_000, beats=2)
    wrapped = ("<think" + ">" + "Надо взять промт прошлого отрезка и продолжить." + "</think" + ">" + "\n\n"
               + good_prompt("She closes the case and winds the clock."))
    assert S.strip_thinking(wrapped).startswith("subject_definitions:")
    got = S.write_series(plan, fetch=lambda m: wrapped, only=1,
                         previous_prompt=good_prompt("She starts brushing."))
    assert got["used"] == "llm" and "winds the clock" in got["written"]["segments"][0]["prompt"]
    assert "Надо взять" not in got["written"]["segments"][0]["prompt"]


def test_the_brief_asks_for_the_next_beat_handoff():
    """Следующая часть идеи идёт в задание, чтобы отрезок передал ей эстафету, а не закрыл сюжет."""
    plan = S.plan_beats("One. Two. Three.", 30, w=960, h=544, budget=200_000, beats=3)
    msg = S.writer_messages("One. Two. Three.", plan, only=1)[1]["content"]
    assert "Next part of the idea" in msg and "Two." in msg
    first = S.writer_messages("One. Two. Three.", plan, only=0)[1]["content"]
    assert "OPENING segment" in first and "Next part of the idea" in first
    last = S.writer_messages("One. Two. Three.", plan, only=2)[1]["content"]
    assert "Next part of the idea" not in last


def test_references_reach_the_writer_and_every_segment():
    """Референсы серии: метки идут в задание писателю, а id ассетов — во все отрезки проекта."""
    plan = S.plan_beats("Woman restores an old clock", 20, w=960, h=544, budget=200_000, beats=2)
    msg = S.writer_messages("Woman restores an old clock", plan,
                            refs=["<Picture 1> — героиня", "<Video 1> — движение рук"])[1]["content"]
    assert "<Picture 1>" in msg and "<Video 1>" in msg

    written = {"segments": [{"index": 0, "prompt": good_prompt()}, {"index": 1, "prompt": good_prompt()}]}
    project = S.build_project(plan, written,
                              refs=["asset-photo", "asset-clip"],
                              assets=[{"id": "asset-photo", "name": "героиня", "file": "hero.jpg",
                                       "subfolder": "", "type": "input", "category": "image"},
                                      {"id": "asset-clip", "name": "руки", "file": "hands.mp4",
                                       "subfolder": "", "type": "input", "category": "video"},
                                      {"id": "unused", "name": "лишний", "file": "x.png",
                                       "subfolder": "", "type": "input", "category": "image"}])
    assert all(seg["refs"] == ["asset-photo", "asset-clip"] for seg in project["segments"])
    # ассеты, на которые ссылаются отрезки, копируются в новый проект (иначе метки не разрешатся)
    assert {a["id"] for a in project["assets"]} == {"asset-photo", "asset-clip"}
    # без референсов серия остаётся без них
    plain = S.build_project(plan, written)
    assert all(seg["refs"] == [] for seg in plain["segments"])

def test_character_cards_reach_the_project_and_every_segment():
    """Карточки персонажей: ссылки на все отрезки, снимки — в проект, без снимка карточка не остаётся."""
    plan = S.plan_beats("Woman restores an old clock", 20, w=960, h=544, budget=200_000, beats=2)
    written = {"segments": [{"index": 0, "prompt": good_prompt()}, {"index": 1, "prompt": good_prompt()}]}
    snaps = {"c1": {"name": "Мира", "concept": "human", "vkind": "image", "appearance": "тёмные волосы"},
             "c2": {"name": "Голос", "concept": "generic", "audio": True}}
    project = S.build_project(plan, written, cards=["c1", {"id": "c2", "w": 1}], card_snaps=snaps)
    assert all([c["id"] for c in seg["cards"]] == ["c1", "c2"] for seg in project["segments"])
    assert set(project["cards"]) == {"c1", "c2"}
    assert project["cards"]["c1"]["name"] == "Мира"
    # карточка без снимка (нет в библиотеке) не попадает на отрезки: иначе метка не разрешится
    lonely = S.build_project(plan, written, cards=["c1", "gone"], card_snaps=snaps)
    assert all([c["id"] for c in seg["cards"]] == ["c1"] for seg in lonely["segments"])