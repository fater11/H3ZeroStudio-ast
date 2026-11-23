import pathlib
"""Native H3 assistant left-rail: modes, compact UI, no PromptForge chrome."""
import os


def test_assist_studio_layout_and_modes():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    for mode in ("t2va", "i2va", "ref2va", "fl2va", "l2va", "lipsync"):
        assert f'id: "{mode}"' in js
    assert "h3l-ast-panel" in js and "h3l-ast-mode" in js
    assert "astNeighPill" in js and "ctx_neighbours" in js
    assert "astContextCard" in js  # stub only; no clip card in chat
    assert "Соседние отрезки" in js
    assert "h3l-ast-ctx" not in js and 'det(T("Клип")' not in js
    assert "astTranslateLast" in js and "astShowVersions" in js
    assert "astInsertPrompt" in js and "TTFT" in js
    assert 'tool = "assist"' in js
    assert 'tool("assist", ICON.spark, T("Ассистент"))' in ed
    assert 'T("<span>Ассистент</span>")' not in ed
    for bad in ("h3l-ast-modetab", "h3l-ast-box", "h3l-ast-setbox", "Prompt Studio", "h3l-ast-emptyicon"):
        assert bad not in js, bad
    assert "overflow-x:hidden" in js and "min-width:0" in js
    assert "renderAssistSettingsView" in js
    assert "h3l-settab" in js
    assert "h3l-ast-stylecard" in js
    assert "h3l-ast-emptyblurb" in js
    assert "h3l-ast-moderow" in js and 'T("Режим")' in js
    assert 'T("Диалог")' in js
    assert "h3l-ast-sugg" not in js
    assert 'type: "checkbox"' not in js



def test_assist_api_field_and_chat_selection():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    paint = js.split("astPaintStatus() {")[1].split("astOpenSettings")[0]
    assert "renderAssistHead" not in paint
    assert "h3l-ast-status" in paint
    assert 'class: "h3l-note h3l-ast-conn"' in js
    assert 'type: "text", inputmode: "url"' in js
    assert 'type: "url"' not in js
    assert "sel.isCollapsed" in ed
    assert ".h3l-ast-bubble,.h3l-ast-reasonbody,.h3l-final" in ed


def test_llm_stats_include_ttft():
    from h3s import h3s_llm as llm
    import inspect
    src = inspect.getsource(llm._stats)
    assert "ttft" in src
    assert "first_token_at" in inspect.getsource(llm._stream_once)


def test_assist_live_reasoning_and_draft_and_keys():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    js = open(os.path.join(root, "h3s_assist.js"), encoding="utf-8").read()
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    assert "astPaintStream" in js and "h3l-ast-content" in js
    assert "insertBefore(details" in js or "host.insertBefore(details" in js
    assert "astCaptureDraft" in js and "astRememberDraft" in js and "h3ls.ast.drafts" in js
    assert "astClearDraft" in js
    # On send: empty textarea before clear, cancel debounce, no restore after stream re-render
    assert "clearTimeout(this._astDraftT)" in js
    assert 'ta.value = ""; ta.style.height = "44px"' in js or 'ta.value = "";' in js
    assert "this.astClearDraft(cid)" in js
    assert "textarea.h3l-ast-input" in ed
    assert "Shift+Enter" in js or "shiftKey" in js
    assert "isComposing" in ed and "isComposing" in js
    style = open(os.path.join(root, "h3s_style.js"), encoding="utf-8").read()
    assert ".h3l-root .h3l-ast-bubble { background:transparent; }" in style


def test_assist_markdown_renderer():
    import subprocess, json, os
    root = os.path.join(os.path.dirname(__file__), "..")
    js = open(os.path.join(root, "web", "js", "h3s_assist.js"), encoding="utf-8").read()
    assert "export function astMd" in js and "astFillMd" in js
    assert "h3l-ast-pre" in js and "h3l-ast-code" in js
    r = subprocess.run(["node", "--input-type=module", "-e",
        "import { astMd } from './web/js/h3s_assist.js';"
        "const o=astMd('**a** `b`\\n\\n- x\\n\\n<script>z</script>');"
        "console.log(JSON.stringify({"
        "strong:o.includes('<strong>a</strong>'),"
        "code:o.includes('h3l-ast-code'),"
        "li:o.includes('h3l-ast-li'),"
        "esc:o.includes('&lt;script&gt;'),"
        "noRaw: !o.includes('<script>')"
        "}));"], cwd=root, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    data = json.loads(r.stdout.strip().splitlines()[-1])
    assert all(data.values()), data


def test_prompt_editor_uses_theme_vars():
    """Prompt editor surfaces must follow theme vars (no hardcoded navy/hex fills)."""
    import re
    js = pathlib.Path(__file__).resolve().parents[1].joinpath("web/js/h3s_prompted.js").read_text(encoding="utf-8")
    assert "export const PE_CSS" in js
    m = re.search(r"export const PE_CSS = String\.raw`(.*?)`;", js, re.S)
    assert m, "PE_CSS missing"
    css = m.group(1)
    assert "background:var(--panel2)" in css
    assert "background:var(--field)" in css
    assert "background:var(--panel)" in css
    assert "caret-color:var(--txt)" in css
    # LLM before/after review is an opaque, full editor layer; otherwise original
    # CodeMirror text bleeds through translucent theme surfaces (regression 2026-11-20).
    assert ".h3l-pe:has(> .pe-llm-review) > :not(.pe-llm-review) { visibility:hidden; }" in css
    assert ".pe-llm-review { position:absolute; inset:0;" in css
    assert "background:var(--bg2)" in css and "background:var(--bg1)" in css
    # strip var(...) then forbid leftover #hex / rgba surface paints
    stripped = re.sub(r"var\([^)]+\)", "", css)
    hard = re.findall(r"#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)", stripped)
    assert hard == [], f"hardcoded colors remain in PE_CSS: {hard[:12]}"


def test_welcome_has_ui_scale_picker():
    """Lab (pro): the UI scale picker lives in the header only; the welcome no longer duplicates it."""
    root = pathlib.Path(__file__).resolve().parents[1] / "web" / "js"
    settings = (root / "h3s_settings.js").read_text(encoding="utf-8")
    editor = (root / "h3s_editor.js").read_text(encoding="utf-8")
    assert "uiScaleSelect" in editor and "setUiScale" in editor
    assert "this.uiScaleSelect()" in editor            # header picker
    assert "h3l-welcome-scale" not in settings         # not repeated in the welcome
    assert 'class: "h3l-check"' in settings            # «Больше не показывать» is a styled checkbox



def test_assist_markdown_no_intraword_underscore():
    """snake_case H3 keys must not become italic / lose underscores."""
    import pathlib, json, subprocess, textwrap
    root = pathlib.Path(__file__).resolve().parents[1]
    driver = root / "tests" / "_tmp_md_snake.mjs"
    driver.write_text(textwrap.dedent("""        import { astMd } from "../web/js/h3s_assist.js";
        const samples = [
          "non_diegetic_music",
          "subject_definitions",
          "retention_analysis",
          "overall_soundscape",
          "use `non_diegetic_music` in code",
          "say _italic_ but keep non_diegetic_music",
          "**bold** and non_diegetic_music",
        ];
        const out = samples.map((s) => ({ s, html: astMd(s) }));
        console.log(JSON.stringify(out));
    """), encoding="utf-8")
    r = subprocess.run(["node", str(driver)], cwd=str(root / "tests"), capture_output=True, text=True, timeout=30)
    try:
        driver.unlink()
    except OSError:
        pass
    assert r.returncode == 0, r.stderr
    rows = json.loads(r.stdout.strip().splitlines()[-1])
    for row in rows:
        html = row["html"]
        if row["s"] in ("non_diegetic_music", "subject_definitions", "retention_analysis", "overall_soundscape"):
            assert row["s"] in html, (row["s"], html)
            assert "<em>" not in html, html
        if "code" in row["s"]:
            assert "non_diegetic_music" in html
            assert "<code" in html
        if "italic" in row["s"]:
            assert "<em>italic</em>" in html
            assert "non_diegetic_music" in html
        if "bold" in row["s"]:
            assert "<strong>bold</strong>" in html
            assert "non_diegetic_music" in html


def test_prompt_editor_llm_improvement_stream_and_apply():
    """A streamed suggestion must preserve FLF alignment and never overwrite before approval."""
    import pathlib
    import subprocess

    root = pathlib.Path(__file__).resolve().parents[1]
    editor_js = (root / "web/js/h3s_prompted.js").read_text(encoding="utf-8")
    assist_js = (root / "web/js/h3s_assist.js").read_text(encoding="utf-8")
    assert 'T("✨ Улучшить промпт")' in editor_js
    assert 'peImprovePrompt()' in editor_js
    assert 'peCloseReview()' in editor_js
    assert 'export function astImproveSystem' in assist_js
    script = r"""
import { installPromptEditor } from './web/js/h3s_prompted.js';
import { astImproveSystem } from './web/js/h3s_assist.js';
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.classList = { add(){}, toggle(){} }; }
  append(...xs) { this.children.push(...xs); }
  remove() { this.removed = true; }
  setAttribute() {}
  focus() {}
}
globalThis.document = { createElement: (tag) => new El(tag) };
const h = (tag, attrs, ...children) => {
  const el = new El(tag); el.attrs = attrs || {}; el.children = children;
  if (attrs?.onclick) el.onclick = attrs.onclick;
  return el;
};
class Editor {}
installPromptEditor(Editor, { C: { FPS: 24 }, h, ICON: {} });
const e = new Editor(), root = new El('root');
e.p = { assistant: { cfg: { api_model:'test-model', api_base:'http://localhost:1234/v1',
  api_key:'test', max_tokens:3200, top_p:.9, temperature:.3 } } };
e.items = () => [{ frames:49 }];
e.peKf = () => 'flf';
e.toast = () => {};
let content = 'How the reference pictures align with the target video — Picture 1 at 0s; Picture 2 at 2s.\n\nintegrated_multimodal_description: [Shot 1] A person waves.\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A';
const doc = { toString:() => content, get length(){return content.length;} };
const view = { state:{doc}, dispatch:(change) => { content = change.changes.insert; }, focus(){} };
e.pe = { view, refs:{items:[
  {token:'<Picture 1>',kind:'frame',name:'first'},
  {token:'<Picture 2>',kind:'frame',name:'last'}],
  valid:new Map([['<Picture 1>',null],['<Picture 2>',null]])},
  spec:{ctx:{kind:'seg',seg:0}}, el:{querySelector:() => root} };
const improved = 'How the reference pictures align with the target video — Picture 1 at 0s; Picture 2 at 2s.\n\nintegrated_multimodal_description: [Shot 1] A person slowly raises a hand and waves.\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A';
let fetchBody = null, sent = null, count = 0;
globalThis.fetch = async (url, options) => {
  sent = JSON.parse(options.body);
  fetchBody = url;
  return { ok:true, body:{ getReader:()=>({
    read:async()=> count++ ? {done:true} : {done:false,
      value:new TextEncoder().encode('data: '+JSON.stringify({kind:'token',text:improved})+'\n\n')},
  }) } };
};
if (!astImproveSystem('fl2va','seg').includes('Preserve EVERY dialogue')) throw Error('lost dialogue rules');
await e.peImprovePrompt();
if (fetchBody !== '/h3lab/llm/chat' || sent.api_model !== 'test-model') throw Error('LLM connection');
if (content.includes('slowly raises')) throw Error('automatic overwrite before approval');
const search = (node, test) => {
  if (node instanceof El && test(node)) return node;
  for (const child of node?.children || []) { const got = search(child, test); if (got) return got; }
  return null;
};
const proposal = search(e.pe.review, n => n.tag === 'textarea' && !n.readOnly);
const apply = search(e.pe.review, n => n.tag === 'button' && n.attrs?.class?.includes('pri'));
if (!proposal || !apply || apply.disabled) throw Error('review not ready');
if (!proposal.value.startsWith('How the reference pictures align')) throw Error('lost FLF alignment');
apply.onclick({preventDefault(){}});
if (!content.includes('slowly raises') || e.pe.review !== null) throw Error('review apply failed');
// Escape/cancel must abort the in-flight request and leave the edited document alone.
const afterApply = content;
globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name:'AbortError'})), {once:true});
});
const pending = e.peImprovePrompt();
const signal = e.pe.abort.signal;
e.peCloseReview();
await pending;
if (!signal.aborted || content !== afterApply || e.pe.review !== null) throw Error('cancel did not preserve editor');
console.log('LLM prompt editor stream, review, and cancellation passed');
"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=root,
                            capture_output=True, text=True, timeout=40)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "cancellation passed" in result.stdout

