"""Optional ComfyUI-native text-generation backend for the H3ZeroStudio assistant.

Uses installed CLIPLoader / TextGenerateV2 nodes through ComfyUI's normal queue.
No video model, checkpoint, or global decoder is silently replaced.
"""

import base64
import io
import json
import os
import re
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import uuid


COMFY_BASE = "http://127.0.0.1:8188"
MAX_ENCODER_IMAGES = 4  # bound peak VRAM on smaller cards


class EncoderError(RuntimeError):
    pass


def _api(path, body=None, timeout=60):   # 15 с мало: /object_info на этой сборке отвечает дольше, особенно под загрузкой
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(COMFY_BASE + path, data=payload,
                                 headers={"Content-Type": "application/json"} if payload else {})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as reply:
            return json.loads(reply.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:1500]
        raise EncoderError(f"ComfyUI HTTP {exc.code}: {detail}") from exc
    except TimeoutError as exc:
        raise EncoderError(f"ComfyUI не ответил за {int(timeout)} с ({path}) — сервер занят: идёт загрузка модели, скан ассетов или рендер. Повторите через минуту.") from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise EncoderError(f"ComfyUI не принял запрос {path}: {exc}") from exc


def available_encoders():
    """Only advertise text-generation checkpoints, not H3 diffusion encoders."""
    info = _api("/object_info/CLIPLoader", timeout=120).get("CLIPLoader", {})
    textgen = _api("/object_info/TextGenerateV2", timeout=120)
    if "TextGenerateV2" not in textgen:
        raise EncoderError("Узел TextGenerateV2 не установлен в ComfyUI")
    names = info.get("input", {}).get("required", {}).get("clip_name", [[]])[0]
    models = [str(name) for name in names if re.search(r"gemma4|qwen3[._]|qwen_3_", str(name), re.I)
              and "minimax_h3" not in str(name).lower()]
    models.sort(key=lambda n: ("h3_pe" not in n.lower(), "gemma4" not in n.lower(), n.lower()))
    return {"connected": True, "base": "comfyui", "models": models}


def _flatten_messages(messages):
    system = "\n\n".join(str(m.get("content") or "") for m in messages if m.get("role") == "system")[-18000:]
    dialogue = []
    for message in [m for m in messages if m.get("role") in ("user", "assistant")][-9:]:
        content = message.get("content") or ""
        if isinstance(content, list):
            content = "\n".join(str(p.get("text") or "") for p in content if isinstance(p, dict))
        dialogue.append(("User: " if message["role"] == "user" else "Assistant: ") + str(content))
    return system, "\n\n".join(dialogue)[-45000:]


def _prepare_images(attachments):
    """Copy only validated, downscaled references into a private Comfy input folder."""
    from PIL import Image, ImageOps
    import folder_paths
    from . import h3s_llm
    folder = None
    rows = []
    skipped = 0
    for item in attachments or []:
        if len(rows) >= MAX_ENCODER_IMAGES:
            skipped += 1
            continue
        if not isinstance(item, dict):
            continue
        try:
            source = h3s_llm._attachment_path(item)
            if not source:
                skipped += 1
                continue
            if item.get("kind") == "video_frame":
                data_url = h3s_llm._video_frame_data_url(source, item.get("t"), size=768)
                source_image = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1])))
            else:
                source_image = Image.open(source)
            with source_image:
                image = ImageOps.exif_transpose(source_image).convert("RGB")
                image.thumbnail((768, 768), Image.Resampling.LANCZOS)
                if folder is None:
                    folder = tempfile.mkdtemp(prefix="h3zs_encoder_", dir=folder_paths.get_input_directory())
                filename = f"ref_{len(rows) + 1}.jpg"
                image.save(os.path.join(folder, filename), "JPEG", quality=85)
                rows.append((os.path.basename(folder) + "/" + filename, str(item.get("token") or "Picture"),
                             str(item.get("label") or "")))
        except Exception:
            skipped += 1
    return folder, rows, skipped


def _graph(model, system, prompt, images, max_tokens, sampling, thinking):
    inputs = {"clip": ["1", 0], "prompt": prompt, "max_length": max(16, min(8192, int(max_tokens))),
              "sampling_mode": "on", "thinking": bool(thinking), "use_default_template": True,
              "mtp": "off", "system_prompt": system}
    defaults = {"temperature": 0.7, "top_k": 64, "top_p": 0.95, "min_p": 0.05,
                "repetition_penalty": 1.05, "presence_penalty": 0.0, "seed": int(time.time_ns() & 0xFFFFFFFF)}
    limits = {"temperature": (0.01, 2), "top_k": (0, 1000), "top_p": (0, 1), "min_p": (0, 1),
              "repetition_penalty": (0, 5), "presence_penalty": (0, 5)}
    for k, default in defaults.items():
        raw = (sampling or {}).get(k, default)
        try:
            value = max(limits[k][0], min(limits[k][1], float(raw))) if k in limits else int(raw)
        except (ValueError, TypeError):
            value = default
        inputs["sampling_mode." + k] = int(value) if k in ("top_k", "seed") else value
    graph = {"1": {"class_type": "CLIPLoader", "inputs": {"clip_name": model,
                                                              "type": "stable_diffusion", "device": "default"}}}
    for index, (filename, _token, _label) in enumerate(images, 1):
        node_id = str(10 + index)
        graph[node_id] = {"class_type": "LoadImage", "inputs": {"image": filename}}
        inputs[f"images.image{index}"] = [node_id, 0]
    if images and "gemma4" in model.lower():
        prompt = "".join("<|image><|image|><image|>" for _ in images) + "\n" + prompt
        inputs["prompt"] = prompt
    graph["2"] = {"class_type": "TextGenerateV2", "inputs": inputs}
    graph["3"] = {"class_type": "PreviewAny", "inputs": {"source": ["2", 0]}}
    graph["4"] = {"class_type": "PreviewAny", "inputs": {"source": ["2", 1]}}
    return graph


def stream_chat(messages, model, attachments=None, max_tokens=4200, sampling=None, thinking=False,
                stream_timeout=600):
    """Yield the same event tuples as h3s_llm.stream_chat, without another API server."""
    started = time.monotonic()
    models = available_encoders()["models"]
    if model not in models:
        raise EncoderError("Текстовый энкодер не найден. Обновите список моделей в настройках.")
    queue = _api("/queue")
    if queue.get("queue_running") or queue.get("queue_pending"):
        raise EncoderError("Очередь ComfyUI занята. Дождитесь окончания текущей генерации.")
    folder, images, skipped = _prepare_images(attachments)
    completed, submitted = False, False
    try:
        if skipped:
            yield "notice", f"Энкодеру передано {len(images)} изображений; пропущено {skipped} (лимит {MAX_ENCODER_IMAGES})."
        system, prompt = _flatten_messages(messages)
        if not prompt.strip():
            raise EncoderError("Введите запрос для энкодера")
        if images:
            prompt += "\n\nOrdered references:\n" + "\n".join(
                f"<Picture {i}>: {token} {label}" for i, (_file, token, label) in enumerate(images, 1))
        job = _api("/prompt", {"prompt": _graph(model, system, prompt, images, max_tokens, sampling, thinking),
                               "client_id": str(uuid.uuid4())})
        prompt_id = job.get("prompt_id")
        if not prompt_id:
            raise EncoderError("ComfyUI не поставил энкодер в очередь")
        submitted = True
        yield "notice", "Текстовый энкодер работает через ComfyUI; видеомодель не заменяется."
        yield "status", "Генерация текста…"
        deadline = time.monotonic() + max(30, float(stream_timeout))
        while time.monotonic() < deadline:
            record = _api("/history/" + prompt_id).get(prompt_id)
            if record is None:
                time.sleep(0.5)
                continue
            completed = True
            state = record.get("status", {})
            if state.get("status_str") != "success":
                errors = [str(x)[:400] for kind, x in state.get("messages", []) if kind == "execution_error"]
                raise EncoderError("Ошибка текстового энкодера: " + ("; ".join(errors) or str(state)))
            outputs = record.get("outputs", {})
            result = "".join(str(x) for x in outputs.get("3", {}).get("text", []))
            reasoning = "".join(str(x) for x in outputs.get("4", {}).get("text", []))
            if reasoning:
                yield "reasoning", reasoning
            if not result.strip():
                raise EncoderError("Текстовый энкодер вернул пустой результат")
            yield "token", result
            yield "stats", {"elapsed": round(time.monotonic() - started, 2), "finish": "stop"}
            return
        raise EncoderError("Таймаут ожидания энкодера; задача могла остаться в очереди ComfyUI")
    finally:
        # Never delete inputs while a submitted Comfy job may still be decoding them.
        if folder and (completed or not submitted):
            shutil.rmtree(folder, ignore_errors=True)


def unload_if_idle():
    """Return VRAM to the next H3 job; never unload while any Comfy job is running."""
    try:
        queue = _api("/queue", timeout=3)
        if queue.get("queue_running") or queue.get("queue_pending"):
            return
        import comfy.model_management as mm
        mm.unload_all_models()
        mm.soft_empty_cache()
    except Exception:
        pass
