"""Read-only diagnostics for the last 4-segment SAM swap."""
from pathlib import Path
import numpy as np

root = Path(r"H:\ComfyUI-Easy-Install\ComfyUI\output\h3labstudio\pd07cvya27o\cache\swap_sam3")
folders = [p for p in root.iterdir() if p.is_dir()]
for folder in folders:
    masks = []
    for block in sorted(folder.glob("mask_*.npz")):
        with np.load(block, allow_pickle=False) as z:
            width = int(z["width"])
            a = np.unpackbits(z["bits"], axis=-1, count=width).astype(bool)
            masks.extend(a.mean(axis=(1, 2)).tolist())
    masks = np.array(masks)
    print("MASK_FOLDER", folder.name, "FRAMES", len(masks), "ACTIVE", int((masks >= .001).sum()), flush=True)
    for start, end in [(0,115),(115,170),(170,234),(234,340),(340,345),(345,475),(475,494),(494,720)]:
        t = masks[start:min(end,len(masks))]
        if len(t):
            print("WINDOW", start, end, "active",int((t>=.001).sum()),"/",len(t),
                "mean_coverage",round(float(t.mean()),4),"max",round(float(t.max()),4),flush=True)
    print("FIRST_NONZERO",np.flatnonzero(masks>=.001)[:15].tolist(),flush=True)
    print("LAST_NONZERO",np.flatnonzero(masks>=.001)[-15:].tolist(),flush=True)
