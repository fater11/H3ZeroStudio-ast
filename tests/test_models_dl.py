"""Model downloads: presence-only status, alternatives, subfolders. No real downloads."""
import os
import pytest
from h3s import h3s_models_dl as mdl


def test_manifest_schema_and_alts():
    assert mdl.MANIFEST
    ids = set()
    for m in mdl.MANIFEST:
        for k in ("id", "group", "label", "folder", "filename", "url", "size_bytes", "size_label"):
            assert k in m
        assert isinstance(m.get("alternatives"), list)
        assert m["id"] not in ids; ids.add(m["id"])
        assert m.get("verified") is True
    up = mdl.by_id("latent_upscaler")
    assert "conv_v1_fp16" in up["filename"]
    assert "minimax_h3_latent_upscaler_3d_bf16.safetensors" in up["alternatives"]


def test_safe_target_path_rejects_traversal(tmp_path, monkeypatch):
    root = tmp_path / "diffusion_models"; root.mkdir()
    monkeypatch.setattr(mdl, "_folder_roots", lambda kind: [str(root)] if kind == "diffusion_models" else [])
    assert mdl.safe_target_path("diffusion_models", "a.safetensors").endswith("a.safetensors")
    with pytest.raises(ValueError):
        mdl.safe_target_path("diffusion_models", "../x.safetensors")


def test_status_presence_ignores_size_alts_subfolder(tmp_path, monkeypatch):
    roots = {}
    for folder in ("vae", "loras", "latent_upscale_models", "diffusion_models", "text_encoders", "vae_approx", "veda"):
        d = tmp_path / folder; d.mkdir(); roots[folder] = str(d)
    monkeypatch.setattr(mdl, "_folder_roots", lambda kind: [roots[kind]] if kind in roots else [])

    va = mdl.by_id("vae_video")
    with open(os.path.join(roots["vae"], va["filename"]), "wb") as f:
        f.write(b"x" * 100)  # tiny vs ~2.8GB — still installed
    scan = mdl.status_scan([va])
    assert scan["models"][0]["status"] == "installed"

    up = mdl.by_id("latent_upscaler")
    with open(os.path.join(roots["latent_upscale_models"], "MiniMax_H3_Latent_Upscaler_3D_BF16.safetensors"), "wb") as f:
        f.write(b"bf16")
    scan = mdl.status_scan([up])
    assert scan["models"][0]["status"] == "installed"
    assert scan["models"][0]["found_alt"] is True

    lo = mdl.by_id("lora_turbo")
    sub = os.path.join(roots["loras"], "Minimax H3"); os.makedirs(sub)
    with open(os.path.join(sub, lo["filename"]), "wb") as f:
        f.write(b"lora")
    scan = mdl.status_scan([lo])
    assert scan["models"][0]["status"] == "installed"


def test_start_rejects_unknown():
    assert mdl.start("no_such")["ok"] is False


def test_routes_wired():
    root = os.path.dirname(os.path.dirname(__file__))
    assert "/h3lab/models/downloads" in open(os.path.join(root, "routes.py"), encoding="utf-8").read()
    js = open(os.path.join(root, "web", "js", "h3s_settings.js"), encoding="utf-8").read()
    assert "mdlDownloadsPanel" in js


# ---------------------------------------------------------------- v6l: pause / cancel (delete .part) / strict finish
class _Resp:
    def __init__(self, data, start=0, total=None, delay=0.0, cut=None):
        self.data, self.pos, self.delay = data[start:], 0, delay
        self.cut = cut   # the server stops early after this many bytes (connection drop)
        self.status = 206 if start else 200
        tot = len(data) if total is None else total
        self.headers = {"Content-Range": f"bytes {start}-{tot - 1}/{tot}"} if start else {"Content-Length": str(tot)}

    def read(self, n):
        import time as _t
        if self.delay:
            _t.sleep(self.delay)
        end = len(self.data) if self.cut is None else min(len(self.data), self.cut)
        chunk = self.data[self.pos:min(end, self.pos + min(n, 64 * 1024))]
        self.pos += len(chunk)
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _dl_env(tmp_path, monkeypatch, data, **kw):
    import time as _t
    root = tmp_path / "mp"
    root.mkdir()
    monkeypatch.setattr(mdl, "_folder_roots", lambda kind: [str(root)])
    m = dict(mdl.by_id("control_patch_int8"), size_bytes=len(data))
    monkeypatch.setattr(mdl, "by_id", lambda mid: m if mid == m["id"] else None)
    calls = []

    def urlopen(req, timeout=60):
        rng = req.headers.get("Range") or ""
        start = int(rng.split("=")[1].rstrip("-")) if rng else 0
        calls.append(start)
        return _Resp(data, start, **kw)
    monkeypatch.setattr(mdl.urllib.request, "urlopen", urlopen)
    mdl._jobs.clear()

    def wait(states, t=10):
        t0 = _t.time()
        while _t.time() - t0 < t:
            j = mdl.job_status(m["id"])["job"]
            if j and j["state"] in states:
                return j
            _t.sleep(0.02)
        raise AssertionError(f"timeout, job {mdl.job_status(m['id'])['job']}")
    dest = os.path.join(str(root), m["filename"])
    return m, dest, wait, calls


def _wait_bytes(path, n=1):
    import time as _t
    t0 = _t.time()
    while _t.time() - t0 < 10:
        if os.path.isfile(path) and os.path.getsize(path) >= n:
            return
        _t.sleep(0.01)


def test_pause_keeps_part_and_resumes(tmp_path, monkeypatch):
    data = os.urandom(2 * 1024 * 1024)
    m, dest, wait, calls = _dl_env(tmp_path, monkeypatch, data, delay=0.02)
    assert mdl.start(m["id"])["ok"]
    _wait_bytes(dest + ".part", 64 * 1024)
    assert mdl.pause(m["id"])["ok"]
    j = wait({"paused"})
    assert os.path.isfile(dest + ".part") and not os.path.exists(dest) and j["downloaded"] > 0
    assert mdl.status_scan([m])["models"][0]["status"] == "partial"
    monkeypatch.setattr(mdl.urllib.request, "urlopen", lambda req, timeout=60: (calls.append(int(req.headers["Range"].split("=")[1].rstrip("-"))), _Resp(data, calls[-1]))[1])
    assert mdl.start(m["id"])["ok"]
    wait({"done"})
    assert calls[-1] > 0 and open(dest, "rb").read() == data and not os.path.exists(dest + ".part")


def test_cancel_stops_and_deletes_the_partial_file(tmp_path, monkeypatch):
    data = os.urandom(2 * 1024 * 1024)
    m, dest, wait, _ = _dl_env(tmp_path, monkeypatch, data, delay=0.02)
    assert mdl.start(m["id"])["ok"]
    _wait_bytes(dest + ".part", 64 * 1024)
    assert mdl.cancel(m["id"], discard=True)["ok"]
    j = wait({"cancelled"})
    assert not os.path.exists(dest + ".part") and not os.path.exists(dest) and j["downloaded"] == 0
    assert mdl.status_scan([m])["models"][0]["status"] == "missing"


def test_cancel_a_paused_download_deletes_its_part(tmp_path, monkeypatch):
    data = os.urandom(1024)
    m, dest, wait, _ = _dl_env(tmp_path, monkeypatch, data)
    open(dest + ".part", "wb").write(b"x" * 100)   # left from an earlier session
    r = mdl.cancel(m["id"], discard=True)
    assert r["ok"] and r["deleted"] and not os.path.exists(dest + ".part")


def test_a_short_download_is_never_renamed_to_the_model(tmp_path, monkeypatch):
    data = os.urandom(512 * 1024)
    m, dest, wait, _ = _dl_env(tmp_path, monkeypatch, data, cut=len(data) - 1000)   # connection drops 1000 bytes early
    assert mdl.start(m["id"])["ok"]
    j = wait({"error"})
    assert "incomplete" in j["error"] and not os.path.exists(dest) and os.path.getsize(dest + ".part") == len(data) - 1000


def test_cancel_route_passes_discard():
    src = open(os.path.join(os.path.dirname(__file__), "..", "routes.py"), encoding="utf-8").read()
    assert 'mdl.cancel, str(b.get("id") or ""), bool(b.get("discard"))' in src
