"""Compare conservative hole fill against convex hull for closeup person masks."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps, ImageDraw

root=Path(r"H:\ComfyUI-Easy-Install\ComfyUI\output\h3labstudio\pd07cvya27o")
folder=next((root/"cache"/"swap_sam3").iterdir())
src=root/"assets"/"Video by wesleyribeiro10x [De53qJ-Rp97].mp4"
cap=cv2.VideoCapture(str(src))
frames=[475,599,719]
methods=["raw","holes","close","hull"]
W,H=225,315
sheet=Image.new("RGB",(len(frames)*W,len(methods)*H),"white")
draw=ImageDraw.Draw(sheet)
for col,frame in enumerate(frames):
    cap.set(cv2.CAP_PROP_POS_FRAMES,frame)
    ok,img=cap.read()
    assert ok
    rgb=cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
    with np.load(folder/f"mask_{frame//64:06d}.npz") as z:
        mask=np.unpackbits(z["bits"][frame%64],count=int(z["width"]),axis=-1).astype(np.uint8)
    binary=(mask>0).astype(np.uint8)
    # Fill only fully surrounded holes, preserve all exterior/background regions.
    area=255*(1-binary)
    flood=area.copy()
    hh,ww=flood.shape
    cv2.floodFill(flood,np.zeros((hh+2,ww+2),np.uint8),(0,0),127)
    holes=((area==255)&(flood==255)).astype(np.uint8)
    fill=(binary|holes)
    k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(31,31))
    close=cv2.morphologyEx(fill,cv2.MORPH_CLOSE,k)
    where=np.column_stack(np.where(binary>0)).astype(np.int32)
    hull=np.zeros_like(binary)
    # cv2 points are x,y
    pts=np.column_stack((where[:,1],where[:,0])).astype(np.int32)
    cv2.fillConvexPoly(hull,cv2.convexHull(pts),1)
    for row,(method,what) in enumerate(zip(methods,[binary,fill,close,hull])):
        overlay=rgb.copy()
        big=cv2.resize(what,(rgb.shape[1],rgb.shape[0]),interpolation=cv2.INTER_NEAREST)>0
        overlay[big]=(overlay[big]*.55+np.array([30,225,85])*.45).astype(np.uint8)
        t=ImageOps.fit(Image.fromarray(overlay),(W,H))
        sheet.paste(t,(col*W,row*H))
        draw.text((col*W+2,row*H+2),f"{method} {frame} {float(what.mean()):.3f}",fill="yellow")
cap.release()
out=root/"swap_mask_holes_probe.jpg"
sheet.save(out,quality=75)
print(out)
