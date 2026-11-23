"""Serial pi-H3 Ref2VA benchmark for H3ZeroStudio Lab. Never interrupts another run."""
import json
import os
import struct
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

API = "http://127.0.0.1:8188"
BASE = Path(r"H:\ComfyUI-Easy-Install\ComfyUI")
REPORT = Path(__file__).with_name("pi_ref2va_matrix_status.json")
MODELS = {
    "10eros": r"video\H3\10Eros_Max_8stepTurbo_v1.0_hybrid-int8_HQ.safetensors",
    "b25": r"video\H3\minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors",
}
PROMPTS = {
    10: """subject_definitions: <Subject 1> is the adult blonde woman in <Picture 1>, with precisely her recognizable face, blonde hairstyle, black leather jacket, black boots and original body proportions. <Picture 1> is the single identity reference.
summary: One continuous 10-second photorealistic shot in a softly lit green-walled living room. <Subject 1> speaks clear Russian, moves energetically around a sofa and shows two high-contrast text signs to the camera.
retention_analysis: Preserve exact facial identity, eyes, nose, lips, jaw, hairstyle, clothing, body proportions, lighting and room through movement and head turns. No cuts, captions or extra people.
detailed_scene_description: [0-3s] <Subject 1> quickly steps forward and turns around the sofa, looking at the camera. [3-6s] She holds a flat rigid white placard face-on toward the lens; its only large black Cyrillic writing reads exactly 'ТЕСТ 01'. She speaks in Russian with visible natural lip sync: <d>[Russian] Проверка связи! Я двигаюсь быстро.</d> [6-10s] She turns, raises a second flat white sign bearing only the black letters 'H3 LAB', points to it and says: <d>[Russian] Посмотрите на таблички!</d> Clear stable lettering, realistic fingers, convincing head and body movement.
overall_soundscape: Clear natural female Russian voice and synchronized mouth movement, footsteps, leather rustle, rigid sign taps, quiet indoor ambience.
non_diegetic_music: None.""",
    15: """subject_definitions: <Subject 1> is exactly the adult blonde woman in <Picture 1>, preserving her face, eyes, hair, black leather jacket, boots and body proportions.
summary: One continuous photorealistic 15-second shot in a green-walled living room. <Subject 1> speaks Russian naturally, moves briskly around a sofa and presents two readable text placards.
retention_analysis: Preserve facial identity, eye shape, mouth, jawline, skin, hairstyle, leather outfit, proportions, lighting and room through every head turn and movement; no cuts or captions.
detailed_scene_description: [0-4s] She moves rapidly across the room, ducks behind the sofa and returns to face the lens. [4-8s] She raises a rigid white sign and holds it steady for three seconds, facing the camera. The only large bold black Cyrillic text is exactly 'ТЕСТ 01'. She says in synchronized Russian: <d>[Russian] Проверка связи! Первый тест движения. Вот первая табличка.</d> [8-12s] She turns and raises a second rigid white sign, with only large clear black Latin letters 'H3 LAB'. She says: <d>[Russian] А это вторая.</d> [12-15s] She circles back and points at the sign, saying: <d>[Russian] Надписи должны быть чёткими!</d> Smooth realistic full-body action and fingers.
overall_soundscape: Clear female Russian speech with accurate lip sync, footsteps, leather movement, cardboard taps, quiet room tone.
non_diegetic_music: None.""",
}


def api(path, data=None):
    payload = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = Request(API + path, data=payload, headers={"Content-Type": "application/json"} if data is not None else {})
    with urlopen(req, timeout=20) as response:
        return json.load(response)


def verified_model(which):
    name = MODELS[which]
    path = BASE / "models" / "diffusion_models" / name
    with path.open("rb") as f:
        size = struct.unpack("<Q", f.read(8))[0]
        if not 0 < size < 16_000_000:
            raise ValueError("Invalid model header: " + name)
        header = json.loads(f.read(size))
    if not all(header.get(f"blocks.{i}.adaln_proj.linear.weight", {}).get("shape") == [96768, 8] for i in range(48)):
        raise ValueError("Not a 48-block pruned H3 model: " + name)
    return name


def idle():
    q = api("/queue")
    if q.get("queue_running") or q.get("queue_pending"):
        return False
    runs = api("/h3lab/runs")
    current = (runs.get("data") or {}).get("current") or {}
    return current.get("status") != "running"


def build(which, mode, duration):
    name = verified_model(which)
    project_id = f"pi_matrix_{which}_{mode}_{duration}s_{uuid.uuid4().hex[:9]}"
    frames = 243 if duration == 10 else 362
    settings = {
        "res_mode": "custom", "width": 768, "height": 1344, "aspect": "9:16",
        "quality": "final", "final_mode": "full", "steps": 2, "piflow_steps": 2,
        "cfg": 1, "sampler": "euler", "scheduler": "simple", "shift_video": 12,
        "shift_audio": 3, "seed": 752885648701, "cache": True, "preview_suppress": True,
        "model_preset": "pi0", "ref_size": "match",
        "accel": {"attention": "kitchen", "veda": mode == "veda",
                  "veda_predictor": "minimax_h3_r2va_veda_preview_fp8.safetensors",
                  "teacache": False, "compile": False},
    }
    preset = {
        "name": which + " pi test", "base": "unet", "model": name, "dtype": "default",
        "clip": "Minimaxh3QPFixed_comfyQuants_int8.safetensors",
        "vae": "minimax_h3_video_vae_fp16.safetensors",
        "audio_vae": "minimax_h3_audio_vae_fp32.safetensors", "loras": [],
    }
    project = {
        "id": project_id, "name": f"pi Ref2VA {which} {mode} {duration}s",
        "run": {"only": 0, "upto": 0, "kind": "full", "operation": "generate"},
        "settings": settings, "model_presets": {"pi0": preset},
        "assets": [{"id": "refwoman", "name": "Reference woman", "file": "hunter_ref.png",
                    "type": "input", "subfolder": "", "category": "character"}],
        "segments": [{"id": "seg01", "link": "cut", "frames": frames,
                      "prompt": PROMPTS[duration], "refs": ["refwoman"]}],
    }
    return {"prompt": {"88": {"class_type": "ZL_H3ZeroStudioLab",
                              "inputs": {"project": json.dumps(project, ensure_ascii=False)}}},
            "client_id": "h3lab-pi-matrix-" + str(uuid.uuid4())}


def save(rows):
    draft = REPORT.with_suffix(".json.tmp")
    draft.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(draft, REPORT)


def wait_until_idle():
    while True:
        try:
            if idle():
                return
        except Exception as error:
            print("WAIT_SERVER", str(error)[:160], flush=True)
        time.sleep(15)


def run():
    if not (BASE / "input" / "hunter_ref.png").is_file():
        raise FileNotFoundError("Missing source image: input/hunter_ref.png")
    for which in MODELS:
        verified_model(which)
    rows, failed_10s = [], set()
    cases = [(which, mode, seconds) for seconds in (10, 15)
             for mode in ("dense", "veda") for which in ("10eros", "b25")]
    for which, mode, seconds in cases:
        if seconds == 15 and which in failed_10s:
            print(f"SKIP {which} {mode} {seconds}s: model failed 10s", flush=True)
            continue
        wait_until_idle()
        print(f"START {which} {mode} {seconds}s", flush=True)
        try:
            result = api("/prompt", build(which, mode, seconds))
            prompt_id = result["prompt_id"]
        except Exception as error:
            print(f"SUBMIT_FAILED {which} {mode} {seconds}s: {error}", flush=True)
            rows.append({"model": which, "mode": mode, "seconds": seconds, "status": "submit_error",
                         "error": str(error)})
            save(rows)
            if seconds == 10:
                failed_10s.add(which)
            continue
        row = {"model": which, "mode": mode, "seconds": seconds, "frames": 243 if seconds == 10 else 362,
               "prompt_id": prompt_id, "status": "running", "started": time.time()}
        rows.append(row)
        save(rows)
        print(f"QUEUED {prompt_id}", flush=True)
        for _ in range(540):  # 3 hours max per case
            time.sleep(20)
            try:
                history = api("/history/" + prompt_id).get(prompt_id)
            except Exception:
                continue
            if not history:
                continue
            status = (history.get("status") or {}).get("status_str")
            if status not in ("success", "error"):
                continue
            row["status"] = status
            events = (history.get("status") or {}).get("messages") or []
            begin = next((event[1].get("timestamp") for event in events if event[0] == "execution_start"), None)
            end = next((event[1].get("timestamp") for event in reversed(events)
                        if event[0] in ("execution_success", "execution_error")), None)
            row["runtime_s"] = round((end - begin) / 1000, 2) if begin and end else None
            row["outputs"] = len(history.get("outputs") or {})
            bad = next((event[1] for event in reversed(events) if event[0] == "execution_error"), None)
            if bad:
                row["error"] = str(bad.get("exception_message") or "")[:800]
                row["error_node"] = bad.get("node_id")
            print(f"DONE {which} {mode} {seconds}s status={status} runtime={row['runtime_s']}s" +
                  (" ERROR " + row["error"] if bad else ""), flush=True)
            if status != "success" and seconds == 10:
                failed_10s.add(which)
            break
        else:
            row["status"] = "timeout"
            print(f"TIMEOUT {which} {mode} {seconds}s", flush=True)
            failed_10s.add(which)
        save(rows)
    print("MATRIX_COMPLETE", str(REPORT), flush=True)


if __name__ == "__main__":
    run()
