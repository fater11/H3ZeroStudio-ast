"""Lab: the timeline must never cover the side panels (rects + hit-testing at 4 resolutions x 3 UI scales)."""
import os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))


def test_timeline_never_overlaps_panels():
    if not shutil.which("google-chrome") and not shutil.which("chromium"):
        import pytest
        pytest.skip("chrome/chromium not installed")
    r = subprocess.run(["node", os.path.join(HERE, "layout_overlap.mjs")], cwd=os.path.dirname(HERE), capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-2000:]
