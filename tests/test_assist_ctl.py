"""v6m (11.11.2026): the Assistant is ControlNet-aware. When a ControlNet clip guides the current segment, its context
names the CN type, strength, the overlapping window (segment and source seconds) and «Звук в H3», and 4 frames of the CN
source video sampled inside that window go to the LLM as motion/control references (downscaled on the server)."""
import base64
import io
import json
import os
import shutil
import subprocess
import textwrap

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")

ASSETS = [{"id": "i1", "file": "a.png", "category": "character", "name": "Аня", "subfolder": "h3labstudio"},
          {"id": "i3", "file": "c.png", "category": "other", "name": "Финал", "subfolder": "h3labstudio"},
          {"id": "v1", "file": "motion.mp4", "category": "video", "name": "Танец", "subfolder": "h3labstudio", "duration": 10}]


def _run(cases, tmp_path):
    drv = tmp_path / "drv.mjs"
    js = "file://" + os.path.join(ROOT, "web", "js").replace("\\", "/")
    drv.write_text(textwrap.dedent(f"""
        import * as C from "{js}/h3s_core.js";
        import {{ installAssist }} from "{js}/h3s_assist.js";
        class E {{}} installAssist(E, {{ C, h: () => null, ICON: {{}} }});
        const out = [];
        for (const c of JSON.parse(process.argv[2])) {{
          const e = Object.create(E.prototype); e.p = C.normalizeProject(c); e.sel = c.sel || 0; e.seg = (i) => e.p.segments[i]; e._ast = {{ uploads: [] }};
          out.push({{ att: e.astAttachments(), ctx: e.astContext() }});
        }}
        console.log(JSON.stringify(out));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(drv), json.dumps(cases)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def _proj(control, kf=None, sel=0):
    # two segments of 121 frames (~5 s each at 24 fps); the second starts where the first ends
    segs = [{"id": "s1", "frames": 121, "refs": ["i1"]}, {"id": "s2", "frames": 121, "refs": ["i1"], **({"kf": kf} if kf else {})}]
    return {"id": "t", "assets": ASSETS, "segments": segs, "control": control, "sel": sel}


CTL = {"on": True, "mode": "pose", "strength": 0.8, "clips": [{"id": "cc1", "asset": "v1", "start": 1, "in": 2, "length": 2, "audio": True}]}


@need_node
def test_control_context_and_frames(tmp_path):
    part, whole, off, none, flf = _run([
        _proj(CTL),
        _proj({**CTL, "mode": "depth", "clips": [{"id": "cc1", "asset": "v1", "start": 0, "in": 0, "length": 9}]}),
        _proj({**CTL, "on": False}),
        _proj({**CTL, "clips": [{"id": "cc1", "asset": "v1", "start": 7, "in": 0, "length": 1}]}),   # under segment 2 only
        _proj({**CTL, "clips": [{"id": "cc1", "asset": "v1", "start": 6, "in": 0, "length": 2}]}, kf={"mode": "flf", "first": "i1", "last": "i3"}, sel=1),
    ], tmp_path)
    ctl = lambda r: [a for a in r["att"] if a["kind"] == "video_frame"]
    # part of the segment: type, strength, window 1–3 s = 2–4 s of the video, sound on, 4 frames inside the window
    assert "ControlNet: поза (скелет), сила 0.8" in part["ctx"] and "«Танец»" in part["ctx"]
    assert "Управляет частью отрезка: 1.00–3.00 с" in part["ctx"] and "(это 2.00–4.00 с видео)" in part["ctx"]
    assert "Звук в H3: вкл" in part["ctx"] and "motion/control reference" in part["ctx"] and "do not invent conflicting movement" in part["ctx"]
    fr = ctl(part)
    assert [a["token"] for a in fr] == [f"<Control frame {k}> motion/control reference (pose)" for k in range(1, 5)]
    assert [a["t"] for a in fr] == [2.25, 2.75, 3.25, 3.75] and all(a["asset"]["file"] == "motion.mp4" for a in fr)
    assert [a["label"] for a in part["att"] if a["kind"] == "asset"] == ["Аня"]   # the REF picture still comes first
    # whole segment, sound off
    assert "глубина" in whole["ctx"] and "Управляет всем отрезком" in whole["ctx"] and "Звук в H3: выкл" in whole["ctx"] and len(ctl(whole)) == 4
    # track off: said so, no frames; no clip under the segment: nothing at all
    assert "дорожка ControlNet выключена" in off["ctx"] and not ctl(off)
    assert "ControlNet" not in none["ctx"] and not ctl(none)
    # FLF clip: the frames first (generation numbering), then the control frames of its window (6–8 s → 1.04.. of seg 2)
    assert [a["token"] for a in flf["att"]][:2] == ["<Picture 1> first frame", "<Picture 2> last frame"] and len(ctl(flf)) == 4
    assert "FLF (fl2va)" in flf["ctx"] and "ControlNet: поза" in flf["ctx"]


def _video(path, seconds=10, fps=24):
    import av
    import numpy as np
    out = av.open(str(path), mode="w")
    st = out.add_stream("libx264", rate=fps); st.width, st.height, st.pix_fmt = 320, 240, "yuv420p"
    for n in range(seconds * fps):
        sec = n // fps   # a solid colour per second: red channel = 25 * second
        arr = np.zeros((240, 320, 3), np.uint8); arr[..., 0] = 25 * sec; arr[..., 2] = 200
        for p in st.encode(av.VideoFrame.from_ndarray(arr, format="rgb24")):
            out.mux(p)
    for p in st.encode():
        out.mux(p)
    out.close()


@need_node
def test_control_frames_reach_the_outgoing_request(tmp_path, monkeypatch, capsys):
    import folder_paths
    from PIL import Image
    from h3s import h3s_llm as llm
    inp = tmp_path / "in"; (inp / "h3labstudio").mkdir(parents=True)
    Image.new("RGB", (64, 48), (0, 255, 0)).save(inp / "h3labstudio" / "a.png")
    _video(inp / "h3labstudio" / "motion.mp4")
    monkeypatch.setattr(folder_paths, "get_input_directory", lambda: str(inp))
    (r,) = _run([_proj(CTL)], tmp_path)
    body = llm._with_images([{"role": "system", "content": "s"}, {"role": "user", "content": "промпт под движение"}], r["att"])
    parts = body[-1]["content"]
    imgs = [p for p in parts if p.get("type") == "image_url"]
    labels = [p["text"] for p in parts if p.get("type") == "text"][1:]
    assert len(imgs) == 5 and labels[0] == "<Picture 1> — Аня"
    assert labels[1] == "<Control frame 1> motion/control reference (pose) — Танец @ 1.25 s of the segment"
    reds = []
    for p in imgs[1:]:
        url = p["image_url"]["url"]; assert url.startswith("data:image/jpeg;base64,")
        im = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")
        assert max(im.size) <= 512
        reds.append(im.getpixel((10, 10))[0])
    # source seconds 2.25, 2.75, 3.25, 3.75 → seconds 2, 2, 3, 3 of the video (red 50, 50, 75, 75)
    assert all(abs(r_ - e) < 15 for r_, e in zip(reds, (50, 50, 75, 75))), reds
    assert "5 image(s) attached" in capsys.readouterr().out


def test_control_frame_path_is_confined_to_the_roots(tmp_path, monkeypatch):
    import folder_paths
    from h3s import h3s_llm as llm
    inp = tmp_path / "in"; inp.mkdir(); (tmp_path / "x.mp4").write_bytes(b"0"); (inp / "p.png").write_bytes(b"0")
    monkeypatch.setattr(folder_paths, "get_input_directory", lambda: str(inp))
    assert llm._attachment_path({"kind": "video_frame", "asset": {"file": "../x.mp4"}}) is None
    assert llm._attachment_path({"kind": "video_frame", "asset": {"file": "p.png"}}) is None   # not a video
