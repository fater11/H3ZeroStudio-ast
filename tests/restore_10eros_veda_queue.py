"""Restore the three prepared jobs after a ComfyUI restart; keep active work running."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

API = "http://127.0.0.1:8188"
RECORD = Path(__file__).with_name("restore_10eros_veda_queue_status.json")
IDS = [
    "q_dance_10eros_pi2_veda_20261123",
    "q_dance_10eros_pi4_veda_20261123",
    "q_kotel_v2_10eros_pi4_veda_20261123",
]
MODEL = r"video\H3\10Eros_Max_8stepTurbo_v1.0_hybrid-int8_HQ.safetensors"
STEPS = [2, 4, 4]
COUNTS = [6, 6, 26]

def api(path, data=None):
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None
    req = Request(API + path, data=raw, headers={"Content-Type": "application/json"} if raw else {})
    with urlopen(req, timeout=30) as resp:
        return json.load(resp)

def pending_ids():
    q = api("/queue")
    return {str(item[1]) for item in q.get("queue_running", []) + q.get("queue_pending", [])}

def save(record):
    RECORD.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")

def main():
    record = json.loads(RECORD.read_text("utf-8")) if RECORD.exists() else {}
    active = pending_ids()
    print("EXISTING_QUEUE", len(active), flush=True)
    for id_, steps, n in zip(IDS, STEPS, COUNTS):
        p = api("/h3lab/project?id=" + id_)["data"]
        s = p["settings"]
        main_preset = s["model_preset"]
        assert len(p["segments"]) == n and s["steps"] == steps and s["piflow_steps"] == steps
        assert s["accel"]["veda"] is True
        assert p["model_presets"][main_preset]["model"] == MODEL
        assert len(p["model_presets"]) == 1
        assert all(not seg.get("model_preset") or seg["model_preset"] == main_preset
                   for seg in p["segments"])
        previous = record.get(id_, {}).get("prompt_id")
        if previous and (previous in active or api("/history/" + previous).get(previous)):
            print("ALREADY_PRESENT", id_, previous, flush=True)
            continue
        payload = {"prompt": {"88": {"class_type": "ZL_H3ZeroStudioLab",
                  "inputs": {"project": json.dumps(p, ensure_ascii=False)}}},
                  "client_id": "h3lab-restore-10eros-veda"}
        result = api("/prompt", payload)
        prompt_id = result.get("prompt_id")
        if not prompt_id:
            raise RuntimeError("Submit rejected: " + id_ + " " + str(result)[:500])
        record[id_] = {"prompt_id": prompt_id, "segments": n, "steps": steps, "veda": True}
        save(record)
        active.add(prompt_id)
        print("ENQUEUED", id_, prompt_id, flush=True)
    q = api("/queue")
    print("QUEUE_NOW", "running", len(q.get("queue_running", [])),
          "pending", len(q.get("queue_pending", [])), flush=True)

if __name__ == "__main__":
    main()
