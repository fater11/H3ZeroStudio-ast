"""Opt-in real-GPU smoke probe for Swap SAM3 tracking (no H3 run, no files written).
Run from ComfyUI root with its embedded Python:
  python custom_nodes/ComfyUI-H3ZeroStudio-Lab/tests/manual_sam3_track_probe.py --video PATH
CUDA_VISIBLE_DEVICES can select a non-busy GPU before starting Python.
"""
import argparse
import os
import sys
import tempfile
import time
import types
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--video", required=True)
parser.add_argument("--frames", type=int, default=8)
parser.add_argument("--block-test", action="store_true", help="Track through 64-frame handoff and test background composite")
parser.add_argument("--gpu", type=str, default="0", help="ComfyUI CUDA device index, e.g. 1 for RTX 3090")
parser.add_argument("--width", type=int, default=576)
parser.add_argument("--height", type=int, default=1024)
parser.add_argument("--point", nargs=2, type=float, default=[0.45, 0.55])
parser.add_argument("--box", nargs=4, type=float, default=[0.083, 0.1848, 0.7362, 0.8139])
args = parser.parse_args()

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root))
os.chdir(root)
sys.argv = [sys.argv[0], "--cuda-device", args.gpu]
import comfy.options
comfy.options.enable_args_parsing()
import cv2
import numpy as np
import torch

# Load only the module we are testing, without registering H3 routes or nodes.
pkg_path = Path(__file__).resolve().parents[1]
pkg = types.ModuleType("h3s")
pkg.__path__ = [str(pkg_path)]
sys.modules["h3s"] = pkg
from h3s import h3s_swap_mask as sm, h3s_media
from comfy_extras.nodes_sam3 import SAM3_VideoTrack, SAM3_TrackToMask

start = time.monotonic()
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "unavailable", flush=True)
print("frames:", args.frames, "source:", os.path.basename(args.video), flush=True)
tw, th = sm._scaled_size(args.width, args.height)
if args.block_test:
    if args.frames <= sm.BLOCK:
        raise ValueError("Block handoff test needs more than 64 frames")
    with tempfile.TemporaryDirectory(prefix="h3zs_sam3_probe_") as scratch:
        with torch.inference_mode():
            folder, shape = sm.prepare(args.video, args.point, args.frames,
                                       args.width, args.height, scratch, box=args.box)
        sizes, coverages = [], []
        for block_id in range((args.frames + sm.BLOCK - 1) // sm.BLOCK):
            masks = sm._load_block(sm._block_path(folder, block_id))
            sizes.append(len(masks))
            coverages.extend([float((m > .5).mean()) for m in masks])
        print("block-sizes:", sizes, "mask-size:", shape, flush=True)
        print("boundary-coverage:", [round(x, 4) for x in coverages[61:67]], flush=True)
        assert sum(sizes) == args.frames
        if any(x < .01 for x in coverages):
            raise RuntimeError("SAM3 tracking lost the subject within a block")
        # Test the second block's actual compositing path, with a synthetic black
        # replacement and the original source pixels outside the tracked person.
        count = min(6, args.frames - sm.BLOCK)
        generated = torch.zeros(count, args.height, args.width, 3)
        with torch.inference_mode():
            result, info = sm.composite(args.video, sm.BLOCK, generated,
                                        {"at": 0, "point": args.point, "box": args.box}, scratch)
        origin = h3s_media.load_video_frames(args.video, sm.BLOCK, count,
                                             args.width, args.height, mode="crop")
        first_mask = sm._load_block(sm._block_path(folder, 1))[0]
        full_mask = cv2.resize(first_mask, (args.width, args.height),
                               interpolation=cv2.INTER_LINEAR)
        bg = full_mask < .01
        person = full_mask > .99
        bg_delta = float(np.abs(result[0].numpy()[bg] - origin[0][bg]).mean())
        person_delta = float((origin[0][person] - result[0].numpy()[person]).mean())
        print("composite:", info["frames"], "active:", info["active"],
              "background-mean-delta:", round(bg_delta, 5),
              "replaced-person-mean-delta:", round(person_delta, 5), flush=True)
        if bg_delta > .015 or person_delta < .02:
            raise RuntimeError("SAM3 compositing failed to preserve background or replace person")
    print("block-and-composite PASS", "seconds", round(time.monotonic() - start, 1), flush=True)
    sys.exit(0)

source = h3s_media.load_video_frames(args.video, 0, args.frames, args.width, args.height, mode="crop")
rgb = np.stack([cv2.resize(frame, (tw, th), interpolation=cv2.INTER_AREA) for frame in source]).astype(np.float32)
model = sm._model()
print("model-loaded", round(time.monotonic() - start, 1), "s", flush=True)
with torch.inference_mode():
    seed = sm._seed(model, rgb[0], args.point, args.box)
    print("seed-coverage", round(float(seed.mean()), 4), flush=True)
    tracked = SAM3_VideoTrack.execute(torch.from_numpy(rgb), model,
                                      initial_mask=seed, max_objects=1, detect_interval=1)[0]
    masks = SAM3_TrackToMask.execute(tracked, object_indices="0")[0].float().cpu().numpy()
if masks.shape != (args.frames, th, tw):
    raise RuntimeError(f"Tracking shape {masks.shape}, expected {(args.frames, th, tw)}")
areas = [round(float((m > .5).mean()), 4) for m in masks]
print("track-coverage", areas, flush=True)
print("total-seconds", round(time.monotonic() - start, 1), flush=True)
if any(a < .01 for a in areas):
    raise RuntimeError("SAM3 tracking lost the subject in the short probe")
