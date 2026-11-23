"""v6n: on-demand model-server launcher (h3s_launcher) against a fake OpenAI-compatible server script."""
import json
import os
import socket
import subprocess
import sys
import time

import pytest

from h3s import h3s_launcher as L

FAKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "fake_llm_server.py")


def _port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def _alive(pid):
    if os.name == "nt":
        # bytes: the console codepage (cp866 on a Russian Windows) must not break decoding
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"], capture_output=True).stdout or b""
        return f'"{pid}"'.encode() in out
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:   # a zombie (killed, not yet reaped by its parent) is dead for our purposes
        with open(f"/proc/{pid}/stat") as f:
            return f.read().split(")")[-1].split()[0] != "Z"
    except OSError:
        return True


def _wait_dead(pids, t=10):
    end = time.time() + t
    while time.time() < end and any(_alive(p) for p in pids):
        time.sleep(0.1)
    return not any(_alive(p) for p in pids)


def _cmd(port, pidfile, *extra):
    return subprocess.list2cmdline([sys.executable, FAKE, str(port), str(pidfile), *map(str, extra)])


@pytest.fixture(autouse=True)
def cfgfile(tmp_path, monkeypatch):
    monkeypatch.setattr(L, "config_path", lambda: str(tmp_path / "_launcher.json"))
    monkeypatch.setattr(L, "log_path", lambda: str(tmp_path / "server.log"))
    yield
    L.stop("test teardown")
    L.STATE.update(state="idle", error="", reason="")


def test_default_is_exactly_the_old_behaviour(monkeypatch):
    """No command (default) or toggle off: no probe, no process, no wait, nothing killed."""
    calls = []
    monkeypatch.setattr(L, "probe", lambda *a, **k: calls.append("probe") or "down")
    monkeypatch.setattr(L, "start", lambda *a, **k: calls.append("start"))
    assert L.get_config() == {"cmd": "", "on_demand": False, "timeout": 180}
    t = time.monotonic()
    assert L.ensure("http://127.0.0.1:9/v1") == {"launched": False, "enabled": False}
    L.set_config({"cmd": "llama-server -m x.gguf", "on_demand": False})
    assert L.ensure("http://127.0.0.1:9/v1")["enabled"] is False
    L.set_config({"cmd": "", "on_demand": True})
    assert L.ensure("http://127.0.0.1:9/v1")["enabled"] is False
    assert calls == [] and time.monotonic() - t < 0.5
    assert L.stop("generation start") == {"stopped": False, "state": "idle"}


def test_launch_on_demand_then_kill_the_whole_tree(tmp_path):
    port, pidfile = _port(), tmp_path / "pids.json"
    L.set_config({"cmd": _cmd(port, pidfile, 1.0), "on_demand": True, "timeout": 30})
    base = f"http://127.0.0.1:{port}/v1"
    assert L.probe(base) == "down"
    seen = []
    r = L.ensure(base, on_launch=lambda: seen.append("launching"))
    assert r["launched"] is True and seen == ["launching"] and L.probe(base) == "up"
    st = L.status()
    assert st["owned"] and st["state"] == "running" and st["enabled"]
    pids = json.loads(pidfile.read_text())
    assert _alive(pids["server"]) and _alive(pids["child"])
    assert L.ensure(base)["launched"] is False   # already up: no second process
    out = L.stop("generation start")
    assert out["stopped"] and _wait_dead([pids["server"], pids["child"]]), "server and its child must be gone"
    assert L.probe(base) == "down"
    st = L.status()
    assert not st["owned"] and st["state"] == "stopped" and st["reason"] == "generation start"


def test_never_touches_a_server_lab_did_not_start(tmp_path, monkeypatch):
    port, pidfile = _port(), tmp_path / "pids.json"
    foreign = subprocess.Popen([sys.executable, FAKE, str(port), str(pidfile), "0"])
    try:
        base = f"http://127.0.0.1:{port}/v1"
        end = time.time() + 15
        while L.probe(base) != "up" and time.time() < end:
            time.sleep(0.1)
        L.set_config({"cmd": _cmd(_port(), tmp_path / "x.json"), "on_demand": True})
        monkeypatch.setattr(L, "start", lambda *a, **k: pytest.fail("must not start a second server"))
        assert L.ensure(base) == {"launched": False, "enabled": True, "running": True}
        assert L.stop("generation start")["stopped"] is False
        assert foreign.poll() is None and L.probe(base) == "up"
    finally:
        foreign.kill(); foreign.wait()
        try:
            os.kill(json.loads(pidfile.read_text())["child"], 9)
        except Exception:
            pass


def test_foreign_server_still_loading_is_waited_for_not_relaunched(tmp_path, monkeypatch):
    port, pidfile = _port(), tmp_path / "pids.json"
    foreign = subprocess.Popen([sys.executable, FAKE, str(port), str(pidfile), "0", "1.5"])   # 503 for 1.5 s
    try:
        base = f"http://127.0.0.1:{port}/v1"
        end = time.time() + 15
        while L.probe(base) == "down" and time.time() < end:
            time.sleep(0.05)
        assert L.probe(base) == "loading"
        L.set_config({"cmd": "never-run-me", "on_demand": True, "timeout": 20})
        monkeypatch.setattr(L, "start", lambda *a, **k: pytest.fail("must not start while a foreign server loads"))
        assert L.ensure(base)["launched"] is False and L.probe(base) == "up"
    finally:
        foreign.kill(); foreign.wait()
        try:
            os.kill(json.loads(pidfile.read_text())["child"], 9)
        except Exception:
            pass


def test_timeout_closes_what_was_started(tmp_path):
    port = _port()
    cmd = subprocess.list2cmdline([sys.executable, "-c", "import time; time.sleep(120)"])
    cfg = {"cmd": cmd, "on_demand": True, "timeout": 2}
    with pytest.raises(RuntimeError, match="не ответила за 2 с"):
        L.ensure(f"http://127.0.0.1:{port}/v1", cfg=cfg)
    st = L.status()
    assert st["state"] == "error" and not st["owned"]


def test_process_that_exits_reports_its_log(tmp_path):
    cmd = subprocess.list2cmdline([sys.executable, "-c", "import sys; print('model file not found: x.gguf'); sys.exit(3)"])
    with pytest.raises(RuntimeError, match="model file not found"):
        L.ensure(f"http://127.0.0.1:{_port()}/v1", cfg={"cmd": cmd, "on_demand": True, "timeout": 20})


@pytest.mark.skipif(os.name == "nt", reason="POSIX script variant (the .bat path is the same code path on Windows)")
def test_script_file_path_runs_in_its_folder(tmp_path):
    port, pidfile = _port(), tmp_path / "pids.json"
    sh = tmp_path / "start model.sh"
    sh.write_text(f"cd \"$(dirname \"$0\")\" && exec {_cmd(port, pidfile, 0.3)}\n")
    args, shell, cwd = L.build_command(f'"{sh}"')
    assert not shell and cwd == str(tmp_path) and args[-1] == str(sh)
    assert L.ensure(f"http://127.0.0.1:{port}/v1", cfg={"cmd": f'"{sh}"', "on_demand": True, "timeout": 30})["launched"]
    pids = json.loads(pidfile.read_text())
    L.stop("button")
    assert _wait_dead([pids["server"], pids["child"]])


@pytest.mark.skipif(os.name != "nt", reason="Windows .bat")
def test_bat_file_hidden_and_tree_killed(tmp_path):
    port, pidfile = _port(), tmp_path / "pids.json"
    bat = tmp_path / "start model.bat"
    bat.write_text("@echo off\r\n" + _cmd(port, pidfile, 0.3) + "\r\n", encoding="utf-8")
    args, shell, cwd = L.build_command(str(bat))
    assert args[:2] == ["cmd.exe", "/d"] and not shell and cwd == str(tmp_path)
    assert L.ensure(f"http://127.0.0.1:{port}/v1", cfg={"cmd": str(bat), "on_demand": True, "timeout": 30})["launched"]
    assert L.STATE["job"], "the tree is in a kill-on-close job"
    pids = json.loads(pidfile.read_text())
    L.stop("button")
    assert _wait_dead([pids["server"], pids["child"]])


def test_generation_start_closes_the_launched_server(monkeypatch):
    from h3s import h3s_gen, h3s_vram
    calls = []
    monkeypatch.setattr(L, "stop", lambda reason="": calls.append(reason) or {"stopped": True})
    monkeypatch.setattr(h3s_vram, "acquire", lambda *a, **k: None)
    monkeypatch.setattr(h3s_gen, "_run_begin", lambda p: {})
    monkeypatch.setattr(h3s_gen, "_run_end", lambda *a, **k: None)
    monkeypatch.setattr(h3s_gen, "_run_project", lambda *a, **k: ("ok",))
    assert h3s_gen.run_project(None, None, None, {"id": "t"}) == ("ok",)
    assert calls == ["generation start"]


def test_config_is_local_and_normalized(tmp_path):
    c = L.set_config({"cmd": "  run.bat  ", "on_demand": 1, "timeout": 5, "evil": "x"})
    assert c == {"cmd": "run.bat", "on_demand": False, "timeout": 10}   # on_demand only for a real True
    assert json.loads((tmp_path / "_launcher.json").read_text(encoding="utf-8")) == c
