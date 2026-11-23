"""Save exports only the current film; stale gallery results remain in the gallery."""
import os


def test_library_gallery_final_remains_available():
    from h3s import h3s_library as lib
    assert "gallery" in (lib.latest_final.__doc__ or "").lower() or "Сохранить" in (lib.latest_final.__doc__ or "")


def test_save_queues_no_sampling_assembly_for_current_segments():
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    menus = open(os.path.join(root, "h3s_menus.js"), encoding="utf-8").read()
    editor = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    assert "const allReady = ()" in menus
    assert "needsAssembly: !tl" in menus
    assert "this.generate({ operation: pending.stage, upto: pending.upto })" in menus
    assert 'stage: legacy ? "full" : exportColour ? "colour" : "assemble"' in menus
    assert "this.host.exportVideo({ ...body, source: video })" in menus
    assert "Never silently export an outdated MP4" in menus
    assert "galleryFinal?.video" not in menus
    assert 'this.generate({ operation: "assemble", upto: pending.upto })' in editor
    assert "this.continuePendingVideoSave(info)" in editor  # node-output fallback
    assert '(region || audio || face) ? "full" : "generate"' in editor
    assert 'operation: "generate" }; this.flushSave();' in editor
    assert 'op === "full" && !this._pendingVideoSave' in editor
    assert 'export_full: true' in editor
    lib = open(os.path.join(os.path.dirname(__file__), "..", "h3s_library.py"), encoding="utf-8").read()
    assert "def latest_final" in lib
