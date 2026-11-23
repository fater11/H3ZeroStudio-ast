"""Single-shot pi-H3 VEDA probe: isolate the close-up after hard cut at frame 475."""
import copy
import json
import sys
from urllib.request import Request, urlopen

API = "http://127.0.0.1:8188"
SOURCE_ID = "pd07cvya27o"
TEST_ID = "pswap_closeup475_pi4_veda_231126"
def api(url, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = Request(API+url,data=data,headers={"Content-Type":"application/json"} if data else {})
    with urlopen(request,timeout=30) as response: return json.load(response)
def build():
    p=copy.deepcopy(api("/h3lab/project?id="+SOURCE_ID)["data"])
    s=copy.deepcopy(p["segments"][3])
    s["id"]="s_closeup475"
    s["name"]="SAM 3.1 closeup 475-598 | isolated 4-step"
    s["frames"]=124
    s["link"]="cut"
    s["source"]["in"]=475
    s["result"]={}
    s["takes"]=[]
    s["active_take"]=""
    s["pin"]=None
    s["freeze"]=None
    s["approved"]=False
    p["id"]=TEST_ID
    p["name"]="Swap 10Eros VEDA 4-step | isolated close-up at frame 475"
    p["segments"]=[s]
    p["end_mode"]="fixed"
    p["end"]=124
    p["settings"]["steps"]=4
    p["settings"]["piflow_steps"]=4
    p["settings"]["quality"]="final"
    p["settings"]["final_mode"]="full"
    p["settings"]["accel"]["veda"]=True
    p["run"]={"upto":-1,"only":-1,"kind":"full","operation":"generate"}
    p["result"]={}
    p["stats"]={}
    assert s["source"]["swap_mask"]["shots"][-1]["frame"] == 475
    assert s["source"]["swap_lora"] and len(s["refs"])==2
    return p
if __name__ == "__main__":
    p=build()
    print("DRY_CHECK",json.dumps({"id":p["id"],"src_in":p["segments"][0]["source"]["in"],
          "frames":p["segments"][0]["frames"],"steps":p["settings"]["steps"],
          "veda":p["settings"]["accel"]["veda"],"mask":bool(p["segments"][0]["source"]["swap_mask"]),
          "refs":p["segments"][0]["refs"]}),flush=True)
    if "--submit" not in sys.argv: sys.exit(0)
    q=api("/queue")
    if q.get("queue_running") or q.get("queue_pending"): raise RuntimeError("Other work active")
    prev=api("/h3lab/projects").get("data") or []
    if any(item.get("id")==TEST_ID for item in prev): raise RuntimeError("Duplicate test ID")
    print("SAVED",api("/h3lab/project/save",{"project":p,"meta":{"name":p["name"]}}),flush=True)
    payload={"prompt":{"88":{"class_type":"ZL_H3ZeroStudioLab",
             "inputs":{"project":json.dumps(p,ensure_ascii=False)}}},
             "client_id":"h3lab-swap-scene-isolation-probe"}
    print("QUEUED",api("/prompt",payload),flush=True)
