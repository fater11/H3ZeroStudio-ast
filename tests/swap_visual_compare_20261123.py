"""Read-only source/generated-frame comparison for the completed Swap test."""
from pathlib import Path
import cv2
from PIL import Image, ImageOps, ImageDraw

root = Path(r"H:\ComfyUI-Easy-Install\ComfyUI\output\h3labstudio\pd07cvya27o")
src = root / "assets" / "Video by wesleyribeiro10x [De53qJ-Rp97].mp4"
out_files = [
    root / "seg_368eafff4cac96d1_uncorrected.mp4",
    root / "seg_6588c41d062f4ff8_uncorrected.mp4",
    root / "seg_cb9d611010846e18_uncorrected.mp4",
    root / "seg_ce9139043d3e780e_uncorrected.mp4",
]
starts = [0, 170, 340, 494]
sizes = [(0, 50), (0, 110), (1, 25), (1, 95), (2, 30), (2, 85), (3, 30), (3, 155)]
def frame(path, at):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(at))
    ok, arr = cap.read()
    cap.release()
    if not ok: raise ValueError((str(path), at))
    return Image.fromarray(cv2.cvtColor(arr,cv2.COLOR_BGR2RGB))
def thumb(img, w=185, h=245):
    return ImageOps.fit(img, (w,h))
W,H = 185,245
sheet=Image.new("RGB",(W*len(sizes),H*2+50),"#ffffff")
draw=ImageDraw.Draw(sheet)
for i,(seg,local) in enumerate(sizes):
    global_idx = starts[seg] + local
    a=thumb(frame(src,global_idx))
    b=thumb(frame(out_files[seg],local))
    sheet.paste(a,(i*W,25))
    sheet.paste(b,(i*W,H+25))
    draw.text((i*W+4,6),str(global_idx),fill="black")
draw.text((5,H+25-16),"generated below",fill="black")
sheet.save(root/"swap_visual_compare_small.jpg",quality=73)
for name in ["h3_sheet_00016.png","IMG_20261023_221239.jpg"]:
    p=root/"assets"/name
    im=Image.open(p).convert("RGB")
    im.thumbnail((460,640))
    im.save(root/("preview_"+name.split(".")[0]+".jpg"),quality=70)
print("OUTPUT",str(root/"swap_visual_compare_small.jpg"),flush=True)
