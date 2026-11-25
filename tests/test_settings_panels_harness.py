"""jsdom harness: Settings tabs / Studio / welcome must render without ReferenceError."""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")
HARNESS = os.path.join(ROOT, "tests", "harness", "settings_panels.mjs")
# Prefer tests/harness/node_modules (symlink) then /tmp install
NODE_PATHS = [
    os.path.join(ROOT, "tests", "harness", "node_modules"),
    "/tmp/h3ls-jsdom/node_modules",
]


def _jsdom_ready():
    for p in [*filter(None, os.environ.get("NODE_PATH", "").split(os.pathsep)), *NODE_PATHS]:
        if os.path.isdir(os.path.join(p, "jsdom")):
            return p
    return None


@pytest.mark.parametrize("args", [(), ("--settings-shortcut",)], ids=["all-panels", "settings-shortcut"])
def test_settings_panels_jsdom_harness(args: tuple[str, ...]):
    jsdom_path = _jsdom_ready()
    if NODE is None or jsdom_path is None:
        pytest.skip("node.js and jsdom are required")
    env = os.environ.copy()
    env["NODE_PATH"] = jsdom_path
    r = subprocess.run([NODE, HARNESS, *args], capture_output=True, text=True, timeout=120, env=env, cwd=ROOT)
    # last JSON object in stdout
    lines = [ln for ln in (r.stdout or "").splitlines() if ln.strip().startswith("{")]
    assert lines, f"no JSON from harness\nstdout={r.stdout!r}\nstderr={r.stderr!r}"
    # parse from first { to end (pretty-printed)
    raw = (r.stdout or "")[ (r.stdout or "").find("{") :]
    out = json.loads(raw)
    if out.get("skipped"):
        pytest.skip(out.get("reason") or "skipped")
    assert r.returncode == 0, r.stderr or r.stdout
    assert out.get("ok") is True, out
    assert not out.get("errors"), out.get("errors")
