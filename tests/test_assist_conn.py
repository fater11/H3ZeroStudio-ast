"""The assistant connection kept outside the project: remembered in the browser, filled into empty projects."""
import json
import pathlib
import subprocess
import textwrap

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
JS = ROOT / "web" / "js"
NODE = "node"


def _node():
    try:
        subprocess.run([NODE, "--version"], capture_output=True, timeout=30, check=True)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _node(), reason="node is not installed")
def test_remember_recall_and_forget(tmp_path):
    drv = tmp_path / "conn.mjs"
    drv.write_text(textwrap.dedent(f"""
        const store = new Map();
        globalThis.localStorage = {{
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: (k) => store.delete(k),
        }};
        const M = await import({json.dumps((JS / "h3s_assist_conn.js").as_uri())});
        const r = {{}};
        r.empty = M.stored();
        M.remember({{ api_base: "http://localhost:20128/v1", api_key: "sk-1", api_model: "openrouter/deepseek/x",
                      temperature: 0.6, styles: ["ignored"] }});
        r.saved = M.stored();
        r.only = Object.keys(r.saved).sort();
        // a new project comes with empty fields: they are filled from the store
        const fresh = M.recall({{ api_base: "", api_key: null, api_model: undefined, temperature: 0.9, pages: 3 }});
        r.filled = fresh.cfg; r.changed = fresh.changed;
        // a project with its own values keeps them
        const mine = M.recall({{ api_base: "http://127.0.0.1:1234/v1", api_model: "local", api_key: "" }},
                              globalThis.localStorage);
        r.kept = mine.cfg;
        // an empty value never erases what is remembered
        M.remember({{ api_base: "http://localhost:20128/v1", api_key: "" }});
        r.afterBlank = M.stored().api_key;
        r.describe = M.describe(M.stored());
        M.forget();
        r.gone = [M.stored(), M.recall({{ api_base: "" }}).changed];
        console.log(JSON.stringify(r));
    """), encoding="utf-8")
    out = subprocess.run([NODE, str(drv)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout.strip().splitlines()[-1])
    assert got["empty"] == {}
    assert got["only"] == ["api_base", "api_key", "api_model", "temperature"]     # styles stay in the project
    assert got["changed"] is True and got["filled"]["api_key"] == "sk-1"
    assert got["filled"]["api_model"] == "openrouter/deepseek/x" and got["filled"]["temperature"] == 0.9
    assert got["filled"]["api_base"] == "http://localhost:20128/v1"
    assert got["kept"]["api_base"] == "http://127.0.0.1:1234/v1"                  # a project's own value wins
    assert got["kept"]["api_model"] == "local" and got["kept"]["api_key"] == "sk-1"
    assert got["afterBlank"] == "sk-1"                                            # a blank never erases it
    assert "localhost:20128" in got["describe"] and got["describe"].endswith("key")
    assert got["gone"] == [{}, False]


def test_every_project_open_fills_the_connection():
    """The editor and the project loader both call the fill, and the panel offers remember / forget."""
    editor = (JS / "h3s_editor.js").read_text(encoding="utf-8")
    projects = (JS / "h3s_projects.js").read_text(encoding="utf-8")
    assist = (JS / "h3s_assist.js").read_text(encoding="utf-8")
    assert "this.p = C.normalizeProject(host.load());\n    this.astConnApply?.();" in editor
    assert "this.astConnApply?.();" in projects and "loadProject(p, msg)" in projects
    assert "rememberConn({ ...this.p.assistant.cfg, ...patch })" in assist
    assert "astConnRememberNow" in assist and "astConnForgetNow" in assist and "astConnApply()" in assist
    assert 'from "./h3s_assist_conn.js"' in assist
