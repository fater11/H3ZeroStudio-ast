"""Read-only visual check of the tracked SAM silhouettes at each hard cut."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps, ImageDraw

root=Path(r"H:\ComfyUI-Easy-Install\ComfyUI\output\h3labstudio\pd07cvya27o")
source=root/"assets"/"Video by wesleyribeiro10x [De53qJ-Rp97].mp4"
folder=next((root/"cache"/"swap_sam3").iterdir())
times=[0,115,234,345,475,599,719]
colw,colh=195,320
sheet=Image.new("RGB",(len(times)*colw,colh+23),"white")
draw=ImageDraw.Draw(sheet)
cap=cv2.VideoCapture(str(source))
for k,frame in enumerate(times):
    cap.set(cv2.CAP_PROP_POS_FRAMES,frame)
    success,raw=cap.read()
    if not success: raise ValueError(frame)
    rgb=cv2.cvtColor(raw,cv2.COLOR_BGR2RGB)
    with np.load(folder/f"mask_{frame//64:06d}.npz",allow_pickle=False) as z:
        mask=np.unpackbits(z["bits"][frame%64:frame%64+1],axis=-1,count=int(z["width"]))[0]
    mask=cv2.resize(mask.astype(np.float32),(rgb.shape[1],rgb.shape[0]))>.5
    rgb[mask]=(rgb[mask]*.45+np.array([30,230,90])*.55).astype(np.uint8)
    im=ImageOps.fit(Image.fromarray(rgb),(colw,colh))
    sheet.paste(im,(k*colw,23))
    draw.text((k*colw+3,4),str(frame),fill="black")
cap.release()
dst=root/"swap_mask_cut_overlay_small.jpg"
sheet.save(dst,quality=70)
print(dst,flush=True)
