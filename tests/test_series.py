"""A series from one idea: the split by token budget, the writer contract and the assembled project."""
import json

import pytest

from h3s import h3s_core as core
from h3s import h3s_series as S


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
    assert '"segments"' in sys_text and "Ровно 3 элементов" in sys_text
    assert "[Shot 1]" in sys_text and "non_diegetic_music" in sys_text and "part" not in sys_text
    assert "радиоприёмник" in user and "Warm documentary look." in user and "photo of the woman" in user
    assert user.count("с (") == 3 and "роль:" in user and "связь:" in user


def test_parse_answer_tolerates_fences_and_rejects_wrong_shapes():
    plan = S.plan_beats("идея", 20, w=960, h=544, budget=200_000, beats=2)
    good = {"title": "Мастерская", "logline": "Она чинит радио",
            "segments": [{"prompt": "detailed_description:\n[Shot 1] она берёт отвёртку", "note": "начало"},
                         {"prompt": "detailed_description:\n[Shot 1] она включает радио", "note": "финал"}]}
    for text in (json.dumps(good, ensure_ascii=False),
                 "Вот результат:\n```json\n" + json.dumps(good, ensure_ascii=False) + "\n```\nГотово."):
        got = S.parse_answer(text, plan)
        assert got["title"] == "Мастерская" and len(got["segments"]) == 2
        assert got["segments"][1]["prompt"].endswith("она включает радио")
    with pytest.raises(ValueError, match="вместо 2"):
        S.parse_answer(json.dumps({"segments": [{"prompt": "один"}]}, ensure_ascii=False), plan)
    with pytest.raises(ValueError, match="без промта"):
        S.parse_answer(json.dumps({"segments": [{"prompt": "x"}, {"prompt": "  "}]}, ensure_ascii=False), plan)
    with pytest.raises(ValueError, match="не JSON"):
        S.parse_answer("извините, не могу", plan)


def test_fallback_writer_makes_one_prompt_per_beat():
    plan = S.plan_beats("Мужчина идёт по ночному рынку", 30, w=960, h=544, budget=200_000, beats=3)
    written = S.fallback_prompts(plan, style="Neon night look.", sound="Distant crowd.")
    assert len(written["segments"]) == len(plan["beats"])
    first, second, last = (s["prompt"] for s in written["segments"])
    for k, prompt in enumerate((first, second, last), start=1):
        assert f"part {k} of 3" in prompt and "[Shot 1]" in prompt and prompt.rstrip().endswith("N/A")
        assert "Neon night look." in prompt and "Distant crowd." in prompt
    assert "This part opens the film." in first and "continues the previous part exactly" in second
    assert "next one continues from" in second and "next one continues from" not in last
    assert written["segments"][0]["note"].startswith("шаблон")          # the template says it is a draft
    # the idea keeps its own sentences instead of being glued into the middle of one line
    long_idea = S.plan_beats("Первая мысль. Вторая мысль!", 20, w=960, h=544, budget=200_000, beats=2)
    text = S.fallback_prompts(long_idea)["segments"][0]["prompt"]
    assert "Первая мысль. Вторая мысль! The part ends" in text


def test_write_series_uses_the_writer_and_falls_back_on_a_bad_answer():
    plan = S.plan_beats("Мальчик запускает воздушного змея", 24, w=960, h=544, budget=200_000, beats=2)
    answer = "```json\n" + json.dumps({"title": "Змей", "segments": [
        {"prompt": "detailed_description:\n[Shot 1] он разматывает верёвку"},
        {"prompt": "detailed_description:\n[Shot 1] змей поднимается"}]}, ensure_ascii=False) + "\n```"
    calls = []

    def fetch(messages):
        calls.append(messages)
        return answer

    got = S.write_series(plan, fetch=fetch, style="Sunny field.")
    assert got["used"] == "llm" and got["written"]["title"] == "Змей"
    assert calls and calls[0][1]["content"].count("Змей") == 0            # the idea text goes to the writer
    assert "разматывает" in got["written"]["segments"][0]["prompt"]

    def broken(_messages):
        return "не могу помочь"

    fell = S.write_series(plan, fetch=broken, style="Sunny field.")
    assert fell["used"] == "template" and fell["error"] and len(fell["written"]["segments"]) == 2
    assert "part 1 of 2" in fell["written"]["segments"][0]["prompt"]
    with pytest.raises(ValueError):
        S.write_series(plan, fetch=broken, allow_fallback=False)
    offline = S.write_series(plan)
    assert offline["used"] == "template" and len(offline["written"]["segments"]) == 2


def test_writing_one_segment_at_a_time():
    """Клиент пишет по отрезку за запрос: длинная серия не зависит от одного длинного ответа."""
    plan = S.plan_beats("Мастер реставрирует старый глобус", 40, w=960, h=544, budget=200_000, beats=3)
    asked = []

    def fetch(messages):
        asked.append(messages[1]["content"])
        return json.dumps({"segments": [{"prompt": "detailed_description:\n[Shot 1] он снимает слой краски"}]},
                          ensure_ascii=False)

    for k in range(3):
        got = S.write_series(plan, fetch=fetch, only=k)
        assert got["used"] == "llm" and len(got["written"]["segments"]) == 1
        assert got["written"]["segments"][0]["index"] == k
        assert f"отрезок {k + 1} из 3" in asked[-1]                      # the writer is told which one
        assert got["messages"][0]["content"].count("Ровно 1 элемент") == 1
    assert len(asked) == 3 and len(set(asked)) == 3

    def broken(_messages):
        raise RuntimeError("Fetch timeout")

    fell = S.write_series(plan, fetch=broken, only=1)
    assert fell["used"] == "template" and fell["error"] == "Fetch timeout"
    assert [s["index"] for s in fell["written"]["segments"]] == [1]     # the template fills just this beat
    assert "part 2 of 3" in fell["written"]["segments"][0]["prompt"]
    with pytest.raises(ValueError):
        S.write_series(plan, fetch=lambda m: json.dumps({"segments": [{"prompt": "a"}, {"prompt": "b"}]}),
                       only=0, allow_fallback=False)


def test_the_last_json_object_wins_when_the_model_reasoned_first():
    """Thinking-модель пишет черновики по пути: готовый ответ берём последним, а не первым."""
    plan = S.plan_beats("Двое настраивают лодку", 20, w=960, h=544, budget=200_000, beats=1)
    text = ('Сначала прикину: {"segments": [{"prompt": "черновик"}]} — нет, нужен формат H3.\n'
            'Теперь по правилам: {"title": "Лодка", "segments": [{"prompt": "detailed_description:\\n[Shot 1] готовый"}]}')
    got = S.parse_answer(text, plan)
    assert got["segments"][0]["prompt"].endswith("готовый") and got["title"] == "Лодка"
    # и braces внутри строк не ломают разбор
    tricky = '{"segments": [{"prompt": "он говорит {тихо} и уходит"}]}'
    assert S.parse_answer(tricky, plan)["segments"][0]["prompt"].endswith("уходит")


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
