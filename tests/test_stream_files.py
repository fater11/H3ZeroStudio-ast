"""Streaming export temp files: a run sweeps what earlier runs left behind, and retries its own removal."""
import ast
import os
import pathlib
import time

import pytest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def _fns():
    """sweep_stream_files / remove_stream_file from h3s_gen, which needs the pack package to import."""
    src = (ROOT / "h3s_gen.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    out = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in ("sweep_stream_files", "remove_stream_file"):
            mod = ast.Module(body=[node], type_ignores=[])
            ns = {"os": os, "time": time}
            exec(compile(ast.fix_missing_locations(mod), "h3s_gen.py", "exec"), ns)
            out.update({k: v for k, v in ns.items() if k in ("sweep_stream_files", "remove_stream_file")})
    return out["sweep_stream_files"], out["remove_stream_file"]


sweep_stream_files, remove_stream_file = _fns()


def test_a_stale_file_is_swept_and_the_current_one_is_kept(tmp_path):
    stale = tmp_path / ".stream_111_222.frames"
    stale.write_bytes(b"0" * 4096)
    ours = tmp_path / ".stream_333_444.frames"
    ours.write_bytes(b"0" * 2048)
    fresh = tmp_path / ".stream_555_666.frames"
    fresh.write_bytes(b"0" * 1024)
    other = tmp_path / "seg_abc.mp4"
    other.write_bytes(b"1" * 16)
    old = time.time() - 3600
    os.utime(stale, (old, old))
    os.utime(ours, (old, old))
    got = sweep_stream_files(str(tmp_path), keep=str(ours))
    assert got["freed"] == 4096 and got["kept"] >= 1
    assert not stale.exists() and ours.exists() and fresh.exists() and other.exists()


def test_a_recent_foreign_file_is_left_alone(tmp_path):
    live = tmp_path / ".stream_777_888.frames"
    live.write_bytes(b"0" * 512)                     # may belong to a run started a moment ago
    got = sweep_stream_files(str(tmp_path), min_age=300.0)
    assert got["freed"] == 0 and live.exists()
    got = sweep_stream_files(str(tmp_path), min_age=0.0)
    assert got["freed"] == 512 and not live.exists()


def test_removal_retries_and_reports_honestly(tmp_path):
    path = tmp_path / ".stream_999_000.frames"
    path.write_bytes(b"0" * 32)
    assert remove_stream_file(str(path), tries=3, delay=0.01) is True and not path.exists()
    assert remove_stream_file(str(path), tries=1, delay=0.01) is True      # already gone is fine
