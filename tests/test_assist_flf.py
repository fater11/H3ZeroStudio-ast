"""v6l hotfix 2 (11.11.2026, user report): in an FLF clip (first / last frame) the Assistant did not see the frames —
astAttachments / astContext read only the REF list (seg.refs), while FLF keeps its pictures in seg.kf since v6i, so the
LLM invented the character and outfit (and a REF list kept from before was sent instead, though generation ignores it).
Now the frames are attached with the generation's numbering (first = <Picture 1>, last = <Picture 2>, alone = 1).
Also: «Применить к отрезку» / «Вставить и сгенерировать» take only the H3 prompt block of an answer (astPromptOf)."""
import json
import os
import shutil
import subprocess
import textwrap

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")

ASSETS = [{"id": "i1", "file": "a.png", "category": "character", "name": "Аня"},
          {"id": "i2", "file": "b.png", "category": "location", "name": "Город"},
          {"id": "i3", "file": "c.png", "category": "other", "name": "Финал"}]


def _run(cases, tmp_path):
    drv = tmp_path / "drv.mjs"
    js = pathlib_uri = "file://" + os.path.join(ROOT, "web", "js").replace("\\", "/")
    drv.write_text(textwrap.dedent(f"""
        import * as C from "{js}/h3s_core.js";
        import {{ installAssist, astPromptOf }} from "{js}/h3s_assist.js";
        class E {{}} installAssist(E, {{ C, h: () => null, ICON: {{}} }});
        const cases = JSON.parse(process.argv[2]), out = [];
        for (const c of cases) {{
          if (c.text !== undefined) {{ out.push(astPromptOf(c.text)); continue; }}
          const e = Object.create(E.prototype); e.p = C.normalizeProject(c.project); e.sel = 0; e.seg = (i) => e.p.segments[i]; e._ast = {{ uploads: [] }};
          out.push({{ att: e.astAttachments(), ctx: e.astContext() }});
        }}
        console.log(JSON.stringify(out));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(drv), json.dumps(cases)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def _proj(kf, refs=("i2",)):
    return {"project": {"id": "t", "assets": ASSETS, "segments": [{"id": "s1", "frames": 121, "refs": list(refs), "kf": kf}]}}


@need_node
def test_flf_frames_go_to_the_assistant(tmp_path):
    both, first, last, ref = _run([_proj({"mode": "flf", "first": "i1", "last": "i3"}), _proj({"mode": "flf", "first": "i1"}),
                                   _proj({"mode": "flf", "last": "i3"}), _proj({"mode": "ref", "first": "i1", "last": "i3"})], tmp_path)
    tok = lambda r: [(a["token"], a["label"], a["asset"]["file"]) for a in r["att"]]
    # first + last: both frames, generation order, the stored REF list («Город») is NOT sent
    assert tok(both) == [("<Picture 1> first frame", "Аня", "a.png"), ("<Picture 2> last frame", "Финал", "c.png")]
    assert "<Picture 1> — первый кадр «Аня»" in both["ctx"] and "<Picture 2> — последний кадр «Финал»" in both["ctx"]
    assert "Город" not in both["ctx"] and "FLF (fl2va)" in both["ctx"]
    # one frame: it is <Picture 1> (i2va / l2va presets say so)
    assert tok(first) == [("<Picture 1> first frame", "Аня", "a.png")] and "I2VA" in first["ctx"]
    assert tok(last) == [("<Picture 1> last frame", "Финал", "c.png")] and "L2VA" in last["ctx"]
    # REF clip: unchanged — its reference list, frames not attached
    assert tok(ref) == [("<Picture 1>", "Город", "b.png")] and "Аня" not in ref["ctx"]


@need_node
def test_flf_mode_without_frames_falls_back_to_refs(tmp_path):
    (r,) = _run([_proj({"mode": "flf"})], tmp_path)   # no frames yet: the clip is still generated as REF
    assert [a["label"] for a in r["att"]] == ["Город"]


@need_node
def test_apply_takes_only_the_h3_prompt_block(tmp_path):
    texts = [
        "Вот промпт:\n\n```text\nsubject_definitions:\n<Subject 1> girl\n\nsummary: x\n\nnon_diegetic_music: none\n```\n\nРекомендации: добавьте свет.",
        "Советы\n```js\nconsole.log(1)\n```\n```\nintegrated_multimodal_description:\n[Shot 1] a\n\noverall_soundscape: rain\nnon_diegetic_music: none\n```\nЕщё советы",
        "Вот:\n\n**subject_definitions:**\n<Subject 1> x\n**summary:** y\nnon_diegetic_music:\nsoft piano\n\nСовет: используйте 0.98 Мп.",
        "Просто текст без секций",
        "```\nпросто код\n```",
    ]
    out = _run([{"text": t} for t in texts], tmp_path)
    assert out[0] == "subject_definitions:\n<Subject 1> girl\n\nsummary: x\n\nnon_diegetic_music: none"
    assert out[1].startswith("integrated_multimodal_description:") and "console.log" not in out[1] and "советы" not in out[1]
    assert out[2].startswith("**subject_definitions:**") and out[2].endswith("soft piano") and "Совет" not in out[2]
    assert out[3] == "Просто текст без секций"
    assert out[4] == "просто код"   # no sections anywhere: the whole answer (fences stripped), as before


@need_node
def test_flf_frames_reach_the_outgoing_request_as_image_data(tmp_path, monkeypatch, capsys):
    """End to end: the attachments the UI builds for an FLF clip → h3s_llm._with_images (the body sent to the LLM)
    carries real image payloads (data:image/jpeg;base64) labelled first / last frame — not only text placeholders."""
    import base64
    import io
    import folder_paths
    from PIL import Image
    from h3s import h3s_llm as llm
    inp = tmp_path / "in"; (inp / "h3labstudio").mkdir(parents=True)
    colors = {"a.png": (255, 0, 0), "c.png": (0, 0, 255), "b.png": (0, 255, 0)}
    for name, col in colors.items():
        Image.new("RGB", (64, 48), col).save(inp / "h3labstudio" / name)
    monkeypatch.setattr(folder_paths, "get_input_directory", lambda: str(inp))
    proj = _proj({"mode": "flf", "first": "i1", "last": "i3"})
    for a in proj["project"]["assets"]:
        a["subfolder"] = "h3labstudio"
    (r,) = _run([proj], tmp_path)
    body = llm._with_images([{"role": "system", "content": "s"}, {"role": "user", "content": "опиши персонажа"}], r["att"])
    parts = body[-1]["content"]
    imgs = [p for p in parts if p.get("type") == "image_url"]
    labels = [p["text"] for p in parts if p.get("type") == "text"][1:]
    assert len(imgs) == 2 and labels == ["<Picture 1> first frame — Аня", "<Picture 2> last frame — Финал"]
    got = []
    for p in imgs:
        url = p["image_url"]["url"]; assert url.startswith("data:image/jpeg;base64,")
        got.append(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB").getpixel((5, 5)))
    near = lambda c, t: all(abs(x - y) < 40 for x, y in zip(c, t))
    assert near(got[0], colors["a.png"]) and near(got[1], colors["c.png"])   # the frames, not the REF picture b.png
    assert "2 image(s) attached: <Picture 1> first frame, <Picture 2> last frame" in capsys.readouterr().out
