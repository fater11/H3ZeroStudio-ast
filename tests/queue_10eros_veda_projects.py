"""Queue cloned Lab projects on 10Eros pi-H3 + VEDA without altering originals."""
import copy
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

API = "http://127.0.0.1:8188"
MODEL = r"video\H3\10Eros_Max_8stepTurbo_v1.0_hybrid-int8_HQ.safetensors"
VEDA = "minimax_h3_r2va_veda_preview_fp8.safetensors"
ROOT = Path(r"H:\ComfyUI-Easy-Install\ComfyUI")
STATUS = Path(__file__).with_name("queue_10eros_veda_projects_status.json")
TASKS = [
    ("pbjfes7k2s5", "q_dance_10eros_pi2_veda_20261123", 2, 6),
    ("pbjfes7k2s5", "q_dance_10eros_pi4_veda_20261123", 4, 6),
    ("kotel_ep01_v2", "q_kotel_v2_10eros_pi4_veda_20261123", 4, 26),
]

def api(path, payload=None):
    raw = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(API + path, data=raw,
                  headers={"Content-Type": "application/json"} if raw is not None else {})
    with urlopen(req, timeout=30) as resp:
        return json.load(resp)

def build(source_id, dest_id, steps, expected):
    response = api("/h3lab/project?id=" + source_id)
    if not response.get("ok"):
        raise RuntimeError("Source project unavailable: " + source_id)
    project = copy.deepcopy(response["data"])
    assert len(project["segments"]) == expected, (source_id, len(project["segments"]))
    main = project["settings"]["model_preset"]
    assert main in project["model_presets"], (source_id, main)
    preset = project["model_presets"][main]
    preset["name"] = "10Eros pi-H3 VEDA"
    preset["model"] = MODEL
    preset["base"] = "unet"
    # Every scene must use 10Eros, including the Kotel segment with a legacy PRISM override.
    project["model_presets"] = {main: preset}
    project["id"] = dest_id
    project["name"] = project["name"] + f" · 10Eros pi-H3 {steps} шага · VEDA"
    s = project["settings"]
    s.update({"model_preset": main, "quality": "final", "final_mode": "full",
              "steps": steps, "piflow_steps": steps, "cfg": 1,
              "sampler": "euler", "scheduler": "simple",
              "resume_only": False, "cache": True})
    accel = dict(s.get("accel") or {})
    accel.update({"veda": True, "veda_predictor": VEDA,
                  "teacache": False, "compile": False})
    s["accel"] = accel
    project["run"] = {"only": -1, "upto": -1, "kind": "full",
                      "region": "", "operation": "generate"}
    project["result"] = {}
    project["stats"] = {}
    for i, seg in enumerate(project["segments"]):
        if seg.get("model_preset"):
            seg["model_preset"] = main
        ov = seg.get("overrides") or {}
        for key in ("model", "model_preset", "steps", "piflow_steps", "accel", "scheduler"):
            if key in ov:
                raise ValueError(f"Unexpected per-segment override {i + 1}: {key}")
        seg["takes"] = []
        seg["active_take"] = ""
        seg["result"] = {}
        seg["approved"] = False
        seg["locked"] = False
        seg["pin"] = None
        seg["freeze"] = None
    assert all((not x.get("model_preset") or x["model_preset"] == main) for x in project["segments"])
    assert all(x["model"] == MODEL for x in project["model_presets"].values())
    assert s["accel"]["veda"] and s["piflow_steps"] == steps
    assert all(a.get("subfolder", "").startswith("h3labstudio/" + source_id + "/")
               for a in project.get("assets", [])), "Unexpected asset path; inspect before queue"
    return project

def commit_record(record):
    STATUS.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    if not (ROOT / "models" / "diffusion_models" / MODEL).is_file():
        raise FileNotFoundError(MODEL)
    prepared = [build(*task) for task in TASKS]
    for p in prepared:
        print("CHECK", json.dumps({"id": p["id"], "segments": len(p["segments"]),
              "steps": p["settings"]["steps"], "piflow_steps": p["settings"]["piflow_steps"],
              "veda": p["settings"]["accel"]["veda"],
              "model": next(iter(p["model_presets"].values()))["model"]}, ensure_ascii=True), flush=True)
    if "--commit" not in sys.argv:
        print("DRY_RUN_OK", flush=True)
        return
    record = json.loads(STATUS.read_text("utf-8")) if STATUS.exists() else {}
    for p in prepared:
        pid = p["id"]
        if record.get(pid, {}).get("prompt_id"):
            print("ALREADY_QUEUED", pid, record[pid]["prompt_id"], flush=True)
            continue
        if not record.get(pid, {}).get("saved"):
            existing = api("/h3lab/projects")
            rows = existing.get("data") or []
            if isinstance(rows, dict):
                rows = rows.get("projects") or []
            if any(x.get("id") == pid for x in rows):
                raise RuntimeError("Destination already exists, refusing overwrite: " + pid)
            saved = api("/h3lab/project/save", {"project": p, "meta": {"name": p["name"]}})
            if not saved.get("ok"):
                raise RuntimeError("Cannot save " + pid + ": " + str(saved)[:500])
            verify = api("/h3lab/project?id=" + pid)
            if not verify.get("ok") or len(verify["data"]["segments"]) != len(p["segments"]):
                raise RuntimeError("Cloned project verification failed: " + pid)
            record[pid] = {"saved": True, "segments": len(p["segments"]),
                           "steps": p["settings"]["steps"], "veda": True}
            commit_record(record)
            print("SAVED", pid, flush=True)
        prompt = {"prompt": {"88": {"class_type": "ZL_H3ZeroStudioLab",
                  "inputs": {"project": json.dumps(p, ensure_ascii=False)}}},
                  "client_id": "lab-10eros-veda-queue"}
        q = api("/prompt", prompt)
        prompt_id = q.get("prompt_id")
        if not prompt_id:
            raise RuntimeError("Prompt not accepted for " + pid + ": " + str(q)[:600])
        record[pid]["prompt_id"] = prompt_id
        commit_record(record)
        print("QUEUED", pid, prompt_id, flush=True)
    print("QUEUE_COMPLETED", flush=True)

if __name__ == "__main__":
    main()
