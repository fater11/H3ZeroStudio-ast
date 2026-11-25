"""Small HTTP API for the editor (prefix /h3lab)."""
import os
import re
import shutil


def model_paths():
    """Folders ComfyUI searches (incl. extra_model_paths.yaml) — shown in «Настройки» → «Модели»."""
    import folder_paths
    out = {}
    for k in ("latent_upscale_models", "vae_approx", "diffusion_models", "text_encoders", "vae", "loras", "veda"):
        try:
            out[k] = list(folder_paths.get_folder_paths(k))
        except Exception:
            out[k] = []
    return out


def tiny_vaes():
    try:
        from . import h3s_preview
        return h3s_preview.tiny_vae_names()
    except Exception:
        return []


def upscale_caps():
    """What «Апскейл отрезка» can use on this machine (learned H3 latent upscaler)."""
    try:
        from . import h3s_upscale
        return h3s_upscale.capabilities()
    except Exception as e:
        return {"learned": False, "learned_models": [], "learned_node": False, "error": str(e)}


def accel_caps():
    """What Settings→Ускорение can use on this machine (no hard deps)."""
    try:
        from . import h3s_accel
        return h3s_accel.capabilities()
    except Exception as e:
        return {"kitchen": False, "sage": False, "flash": False, "pytorch": True,
                "veda": False, "veda_predictors": [], "teacache": False, "compile": False,
                "attention_backends": ["pytorch"], "error": str(e)}


def register():
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return False
    inst = getattr(PromptServer, "instance", None)
    if inst is None:
        return False
    routes = inst.routes

    @routes.get("/h3lab/options")
    async def options(request):
        import comfy.samplers
        return web.json_response({"samplers": list(comfy.samplers.KSampler.SAMPLERS),
                                  "schedulers": list(comfy.samplers.KSampler.SCHEDULERS),
                                  "tiny_vaes": tiny_vaes(), "upscale": upscale_caps(), "accel": accel_caps(), "paths": model_paths()})

    @routes.get("/h3lab/settings")
    async def settings_get(request):
        from . import h3s_library as lib
        return await _json_call(lib.settings_get)

    @routes.post("/h3lab/settings")
    async def settings_set(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.settings_set, b.get("settings") or {}, bool(b.get("replace")))

    @routes.get("/h3lab/generation-presets")
    async def generation_presets_get(request):
        from . import h3s_library as lib
        return await _json_call(lib.generation_presets_get)

    @routes.post("/h3lab/generation-presets")
    async def generation_presets_change(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.generation_presets_change, b.get("action"),
                                b.get("id") or "", b.get("name") or "", b.get("settings"))

    # ---- model downloads + welcome prefs
    @routes.get("/h3lab/models/downloads")
    async def models_dl_status(request):
        from . import h3s_models_dl as mdl
        return await _json_call(mdl.status_scan)

    @routes.get("/h3lab/models/downloads/jobs")
    async def models_dl_jobs(request):
        from . import h3s_models_dl as mdl
        mid = request.query.get("id")
        return await _json_call(mdl.job_status, mid or None)

    @routes.post("/h3lab/models/downloads/start")
    async def models_dl_start(request):
        from . import h3s_models_dl as mdl
        b = await request.json()
        if b.get("all"):
            return await _json_call(mdl.start_all, bool(b.get("optional")))
        return await _json_call(mdl.start, str(b.get("id") or ""))

    @routes.post("/h3lab/models/downloads/cancel")
    async def models_dl_cancel(request):
        from . import h3s_models_dl as mdl
        b = await request.json()
        return await _json_call(mdl.cancel, str(b.get("id") or ""), bool(b.get("discard")))

    @routes.post("/h3lab/models/downloads/reveal")
    async def models_dl_reveal(request):
        """Open the installed file / its destination folder / models root in the OS file manager."""
        from . import h3s_models_dl as mdl
        b = await request.json()
        return await _json_call(mdl.reveal, str(b.get("id") or ""))

    @routes.post("/h3lab/models/downloads/remove")
    async def models_dl_remove(request):
        """Delete a downloaded model file (or its .part) and rescan the statuses."""
        from . import h3s_models_dl as mdl
        b = await request.json()
        return await _json_call(mdl.remove, str(b.get("id") or ""))

    @routes.get("/h3lab/ui")
    async def ui_prefs_get(request):
        from . import h3s_models_dl as mdl
        return await _json_call(mdl.ui_prefs_get)

    @routes.get("/h3lab/inflight")
    async def inflight_get(request):
        from . import h3s_inflight as inf
        tok = request.query.get("token", "")
        def go():
            return {"inflight": inf.lookup(tok)}
        return await _json_call(go)

    @routes.post("/h3lab/ui")
    async def ui_prefs_set(request):
        from . import h3s_models_dl as mdl
        b = await request.json()
        return await _json_call(mdl.ui_prefs_set, b or {})

    # ---- model & LoRA presets
    @routes.get("/h3lab/models")
    async def models_get(request):
        from . import h3s_models as hm
        refresh = request.query.get("refresh") == "1"

        def go():
            presets = hm.load_presets()
            return {"files": hm.list_models(refresh), "presets": presets, "cache": hm.status(),
                    "missing": {p["id"]: [list(m) for m in hm.preset_status(p)] for p in presets}}
        return await _json_call(go)

    @routes.post("/h3lab/models/presets")
    async def models_presets_set(request):
        from . import h3s_models as hm
        b = await request.json()

        def go():
            presets = hm.save_presets(b.get("presets") or [])
            return {"presets": presets, "missing": {p["id"]: [list(m) for m in hm.preset_status(p)] for p in presets}}
        return await _json_call(go)

    @routes.post("/h3lab/models/release")
    async def models_release(request):
        from . import h3s_models as hm
        from . import h3s_gen

        def go():
            if any(st.get("active") for st in list(h3s_gen.STATUS.values())):
                raise RuntimeError("идёт генерация — модели выгрузятся после неё")
            hm.release_all()
            return hm.status()
        return await _json_call(go)

    # ---- LLM assistant: OpenAI-compatible remote API only
    @routes.post("/h3lab/llm/connect")
    async def llm_connect(request):
        from . import h3s_llm, h3s_launcher
        b = await request.json()
        if b.get("backend") == "comfy":
            from . import h3s_comfy_encoder
            return await _json_call(h3s_comfy_encoder.available_encoders)
        base, key = str(b.get("api_base") or ""), str(b.get("api_key") or "")

        def go():
            # v6n: with «Запускать по требованию» on, a silent API gets the configured model server started (models
            # of ComfyUI released first — the LLM needs the VRAM). Launcher off: exactly the old single call.
            if h3s_launcher.enabled() and h3s_launcher.probe(base, key) != "up":
                h3s_llm.release_comfy_models()
                try:
                    h3s_launcher.ensure(base, key)
                finally:
                    h3s_llm.release_llm_vram()
            return h3s_llm.connect(base, key)
        return await _json_call(go)

    # v6n: the local model-server launcher (config in output/h3labstudio/_launcher.json, never in a project)
    @routes.post("/h3lab/llm/launcher/state")
    async def llm_launcher_state(request):
        from . import h3s_launcher
        return await _json_call(h3s_launcher.status)

    @routes.post("/h3lab/llm/launcher/set")
    async def llm_launcher_set(request):
        from . import h3s_launcher
        b = await request.json()

        def go():
            h3s_launcher.set_config({k: b[k] for k in ("cmd", "on_demand", "timeout") if k in b})
            return h3s_launcher.status()
        return await _json_call(go)

    @routes.post("/h3lab/llm/launcher/stop")
    async def llm_launcher_stop(request):
        from . import h3s_launcher

        def go():
            h3s_launcher.stop("button")
            return h3s_launcher.status()
        return await _json_call(go)

    @routes.post("/h3lab/llm/unload")
    async def llm_unload(request):
        from . import h3s_llm
        b = await request.json()
        return await _json_call(h3s_llm.unload, str(b.get("api_base") or ""), str(b.get("api_key") or ""),
                                str(b.get("api_model") or ""), str(b.get("unload_endpoint") or ""))

    @routes.post("/h3lab/llm/chat")
    async def llm_chat(request):
        import asyncio
        from . import h3s_llm
        b = await request.json()
        native_encoder = b.get("backend") == "comfy"
        if native_encoder:
            from . import h3s_comfy_encoder
            try:
                queue = h3s_comfy_encoder._api("/queue")
                if queue.get("queue_running") or queue.get("queue_pending"):
                    return web.json_response({"ok": False, "error": "ComfyUI занят генерацией — дождитесь свободной очереди"}, status=409)
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=409)
        # Both backends can release Comfy's loaded models before calling the LLM.
        # Never evict an active video render just because a vision/text request arrived.
        if not native_encoder:
            try:
                from server import PromptServer
                running, pending = PromptServer.instance.prompt_queue.get_current_queue()
                if running or pending:
                    return web.json_response({"ok": False,
                                              "error": "ComfyUI занят генерацией — анализ фото доступен после окончания очереди"}, status=409)
            except Exception as e:
                return web.json_response({"ok": False,
                                          "error": "Не удалось проверить очередь ComfyUI: " + str(e)}, status=503)
        messages = b.get("messages") if isinstance(b.get("messages"), list) else []

        def number(key, default):
            try:
                return float(b.get(key)) if b.get(key) is not None else default
            except (TypeError, ValueError):
                return default

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, h3s_llm.release_comfy_models)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=409)
        resp = web.StreamResponse()
        resp.headers["Content-Type"] = "text/event-stream; charset=utf-8"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Accel-Buffering"] = "no"
        await resp.prepare(request)
        gen = None
        try:
            from . import h3s_launcher
            base, key = str(b.get("api_base") or ""), str(b.get("api_key") or "")
            # v6n: start the configured model server when the API is silent (launcher off → skipped, no probe)
            if not native_encoder and h3s_launcher.enabled() and await loop.run_in_executor(None, h3s_launcher.probe, base, key) != "up":
                await resp.write(h3s_llm.sse_payload("status", "launching"))
                await loop.run_in_executor(None, h3s_launcher.ensure, base, key)
                await resp.write(h3s_llm.sse_payload("status", "ready"))
            try:
                max_tokens = int(b.get("max_tokens") or 32768)
            except (TypeError, ValueError):
                max_tokens = 32768
            max_tokens = max(16, min(32768, max_tokens))
            attachments = b.get("attachments") if isinstance(b.get("attachments"), list) else []
            sampling = b.get("sampling") if isinstance(b.get("sampling"), dict) else None
            if native_encoder:
                gen = h3s_comfy_encoder.stream_chat(
                    messages, str(b.get("comfy_encoder") or ""), attachments=attachments,
                    max_tokens=max_tokens, sampling=sampling, thinking=b.get("thinking") is not False,
                    stream_timeout=number("stream_timeout", 600))
            else:
                gen = h3s_llm.stream_chat(messages, number("temperature", 0.7), number("top_p", 0.9),
                                          max_tokens, str(b.get("api_base") or ""), str(b.get("api_key") or ""),
                                          str(b.get("api_model") or ""), attachments, bool(b.get("engine_defaults")),
                                          sampling=sampling, thinking=b.get("thinking") is not False,
                                          stream_timeout=number("stream_timeout", 600))
            while True:
                kind, text = await loop.run_in_executor(None, next, gen, (None, None))
                if kind is None:
                    break
                await resp.write(h3s_llm.sse_payload(kind, text))
            await resp.write(b"data: {\"kind\": \"end\"}\n\n")
        except Exception as e:
            try:
                await resp.write(h3s_llm.sse_payload("error", str(e)))
            except Exception:
                pass
        finally:
            if gen is not None:
                gen.close()
            if native_encoder:
                await loop.run_in_executor(None, h3s_comfy_encoder.unload_if_idle)
            try:
                h3s_llm.release_llm_vram()
            except Exception:
                pass
        return resp

    @routes.get("/h3lab/runs")
    async def runs(request):
        from . import h3s_gen
        return await _json_call(h3s_gen.runs_state)

    # ---------------------------------------------------------------- AI TV Studio
    @routes.get("/h3lab/tv/state")
    async def tv_state(request):
        from . import h3s_tv as tv
        return await _json_call(lambda: {"brands": tv.brands(), "orders": tv.orders(),
                                         "pace": sorted(tv.PACE), "trained": list(tv.TRAINED)})

    @routes.post("/h3lab/tv/brand/save")
    async def tv_brand_save(request):
        from . import h3s_tv as tv
        b = await request.json()
        return await _json_call(tv.brand_save, b.get("brand") or {})

    @routes.post("/h3lab/tv/brand/delete")
    async def tv_brand_delete(request):
        from . import h3s_tv as tv
        b = await request.json()
        return await _json_call(tv.brand_delete, b.get("id") or "")

    @routes.post("/h3lab/tv/order/create")
    async def tv_order_create(request):
        from . import h3s_tv as tv
        b = await request.json()
        return await _json_call(tv.order_create, b.get("name") or "", b.get("brand") or "",
                                b.get("minutes") or 3, b.get("pace") or "medium",
                                b.get("cast") or [], b.get("prompt_prefix") or "")

    @routes.post("/h3lab/tv/order/run")
    async def tv_order_run(request):
        from . import h3s_tv as tv
        b = await request.json()
        return await _json_call(tv.order_run, b.get("id") or "", b.get("limit"))

    @routes.get("/h3lab/tv/order")
    async def tv_order_get(request):
        from . import h3s_tv as tv
        oid = request.rel_url.query.get("id", "")
        return await _json_call(lambda: {"order": tv.order_get(oid), "status": tv.status(tv.order_get(oid) or {})})

    @routes.post("/h3lab/tv/order/delete")
    async def tv_order_delete(request):
        from . import h3s_tv as tv
        b = await request.json()
        return await _json_call(tv.order_delete, b.get("id") or "")

    @routes.post("/h3lab/tv/order/dupes")
    async def tv_order_dupes(request):
        from . import h3s_tv as tv
        b = await request.json()

        def work():
            order = tv.order_get(b.get("id") or "")
            files = [f for f in tv.scene_media(order or {}) if f and os.path.isfile(f)]
            return tv.dupes(files, int(b.get("threshold") or 6))
        return await _json_call(work)

    @routes.post("/h3lab/tv/overlay")
    async def tv_overlay(request):
        from . import h3s_tv as tv
        b = await request.json()
        out = os.path.join(tv.root(), "export", (b.get("out") or "overlay") + ".mp4")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        return await _json_call(tv.overlay_export, b.get("video") or "", out, b.get("brand") or {},
                                b.get("logo") or "", b.get("seconds"))

    @routes.post("/h3lab/tv/loop")
    async def tv_loop(request):
        from . import h3s_tv as tv
        b = await request.json()
        out = os.path.join(tv.root(), "export", (b.get("out") or "loop") + ".mp4")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        return await _json_call(tv.loop_export, b.get("video") or "", out, float(b.get("crossfade") or 0.4))

    @routes.post("/h3lab/tv/playlist")
    async def tv_playlist(request):
        from . import h3s_tv as tv
        b = await request.json()

        def work():
            files = [f for f in tv.scene_media(tv.order_get(b.get("id") or "") or {}) if f]
            out = os.path.join(tv.root(), "export", (b.get("out") or "playlist") + ".mp4")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            return tv.playlist_export(files, out)
        return await _json_call(work)

    # ------------------------------------------------- дрейф яркости/цвета по всему ролику
    @routes.post("/h3lab/drift/analyze")
    async def drift_analyze(request):
        from . import h3s_drift as drift
        b = await request.json()

        def work():
            path = b.get("video") or ""
            if not path or not os.path.isfile(path):
                raise ValueError("Дрейф: нет файла видео")
            res = drift.analyze_video(path, side=int(b.get("side") or drift.SAMPLE_SIDE),
                                      cuts=b.get("cuts") or None, mode=str(b.get("mode") or "scenes"),
                                      strength=float(b.get("strength") or 1.0),
                                      trend_window=int(b["trend_window"]) if b.get("trend_window") else None)
            res.pop("p995", None)
            res["gains"] = [round(g, 4) for g in res["gains"]]
            return res
        return await _json_call(work)

    @routes.post("/h3lab/drift/fix")
    async def drift_fix(request):
        from . import h3s_drift as drift
        b = await request.json()

        def work():
            path = b.get("video") or ""
            if not path or not os.path.isfile(path):
                raise ValueError("Дрейф: нет файла видео")
            out = b.get("out") or ""
            if not out:
                folder = os.path.dirname(path)
                out = os.path.join(folder, os.path.splitext(os.path.basename(path))[0] + "_drift.mp4")
            res = drift.correct_video(path, out, mode=str(b.get("mode") or "scenes"),
                                      strength=float(b.get("strength") or 1.0),
                                      cuts=b.get("cuts") or None, audio=b.get("audio", True) is not False,
                                      side=int(b.get("side") or drift.SAMPLE_SIDE))
            res.pop("p995", None)
            return res
        return await _json_call(work)

    @routes.get("/h3lab/drift/state")
    async def drift_state(request):
        from . import h3s_drift as drift
        q = request.rel_url.query
        return await _json_call(drift.state_of, q.get("video", ""))

    # ------------------------------------------------------- серия связанных отрезков из одной идеи
    @routes.post("/h3lab/series/plan")
    async def series_plan(request):
        from . import h3s_series as series
        b = await request.json()

        def work():
            return series.plan_beats(b.get("idea") or "", b.get("seconds") or 30,
                                     w=int(b.get("width") or 1344), h=int(b.get("height") or 768),
                                     budget=int(b["budget"]) if b.get("budget") else None,
                                     beats=int(b["beats"]) if b.get("beats") else None,
                                     overlap_blocks=int(b.get("overlap_blocks")) if b.get("overlap_blocks") is not None else 1,
                                     ref_images=int(b.get("ref_images") or 0))
        return await _json_call(work)

    @routes.post("/h3lab/series/write")
    async def series_write(request):
        import asyncio
        from . import h3s_series as series, h3s_llm
        b = await request.json()

        def work():
            plan = b.get("plan") or series.plan_beats(b.get("idea") or "", b.get("seconds") or 30,
                                                      w=int(b.get("width") or 1344), h=int(b.get("height") or 768),
                                                      budget=int(b["budget"]) if b.get("budget") else None,
                                                      beats=int(b["beats"]) if b.get("beats") else None,
                                                      overlap_blocks=int(b.get("overlap_blocks"))
                                                      if b.get("overlap_blocks") is not None else 1)
            fetch = None
            if b.get("api_model") and b.get("use_llm", True):
                def fetch(messages):
                    return h3s_llm.collect_chat(messages, temperature=float(b.get("temperature") or 0.6),
                                                max_tokens=int(b.get("max_tokens") or 12000),
                                                api_base_url=str(b.get("api_base") or ""),
                                                api_key=str(b.get("api_key") or ""),
                                                api_model=str(b.get("api_model") or ""),
                                                thinking=False)
            only = b.get("only")
            return series.write_series(plan, fetch=fetch, style=str(b.get("style") or ""),
                                       refs=list(b.get("refs") or []), language=str(b.get("language") or "ru"),
                                       extra=str(b.get("extra") or ""), sound=str(b.get("sound") or ""),
                                       allow_fallback=b.get("allow_fallback", True),
                                       only=int(only) if only is not None else None)
        return await _json_call(work)

    @routes.post("/h3lab/series/project")
    async def series_project(request):
        from . import h3s_series as series
        b = await request.json()

        def work():
            plan = b.get("plan") or {}
            if not plan.get("beats"):
                raise ValueError("Серия: нет плана отрезков")
            project = series.build_project(plan, b.get("written") or {}, settings=b.get("settings") or {},
                                           name=b.get("name") or None)
            saved = None
            if b.get("save"):
                from . import h3s_library as lib
                saved = lib.project_save(project, {"name": project["name"], "series": True})
            return {"project": project, "saved": saved, "new_frames": series.total_new_frames(project)}
        return await _json_call(work)

    # ------------------------------------------------------------------- ref splice (движения из видео)
    def _splice_source(b):
        """Абсолютный путь исходного видео: либо путь, либо ассет проекта (файл в папке input)."""
        if b.get("video"):
            return str(b["video"])
        a = b.get("asset") or {}
        from . import h3s_gen
        return h3s_gen.asset_path({"file": a.get("file") or a.get("filename"), "subfolder": a.get("subfolder") or "",
                                   "type": a.get("type") or "input", "name": a.get("name") or ""})

    def _splice_chars(b):
        """Картинки персонажей из выбора в интерфейсе — как абсолютные пути (ассеты проекта)."""
        from . import h3s_gen
        out = []
        for a in b.get("char_assets") or []:
            try:
                out.append(h3s_gen.asset_path({"file": a.get("file"), "subfolder": a.get("subfolder") or "",
                                               "type": a.get("type") or "input", "name": a.get("name") or ""}))
            except Exception:
                continue
        return out or [str(p) for p in (b.get("characters") or [])]

    def _splice_size(b, info):
        """Размер референс-видео: короткая сторона из интерфейса, пропорции — как в исходнике."""
        side = float(b.get("side") or 0)
        if side <= 0:
            return None, None
        w, h = int(info.get("width") or 0), int(info.get("height") or 0)
        if w <= 0 or h <= 0:
            return None, None
        scale = side / max(1, min(w, h))
        return max(2, int(w * scale) // 2 * 2), max(2, int(h * scale) // 2 * 2)

    @routes.post("/h3lab/splice/draft")
    async def splice_draft(request):
        from . import h3s_splice as splice
        b = await request.json()

        def work():
            text = splice.draft_script(_splice_source(b), duration=b.get("duration"),
                                       cuts=b.get("cuts") or None, min_clip=float(b.get("min_clip") or 1.5),
                                       max_clips=int(b.get("max_clips") or 8))
            return {"script": text, "video": _splice_source(b)}
        return await _json_call(work)

    @routes.post("/h3lab/splice/plan")
    async def splice_plan(request):
        from . import h3s_splice as splice
        b = await request.json()

        def work():
            src = _splice_source(b)
            info = splice.media.video_info(src)
            script = splice.parse_script(b.get("script") or "")
            timeline = splice.build_timeline(script, src_dur=info.get("duration"))
            w, h = _splice_size(b, info)
            plan = splice.plan_shots(script, timeline, b.get("name") or "splice", src, characters=_splice_chars(b),
                                     w=w or int(b.get("width") or 1344), h=h or int(b.get("height") or 768),
                                     budget=int(b["budget"]) if b.get("budget") else None)
            return {"plan": plan, "script": script,
                    "shots": [{"kind": s["kind"], "frames": s["length"], "overlap": s["overlap"],
                               "prompt": seg["prompt"]} for s, seg in zip(timeline["shots"], plan["segments"])]}
        return await _json_call(work)

    @routes.post("/h3lab/splice/render")
    async def splice_render(request):
        from . import h3s_splice as splice
        b = await request.json()

        def work():
            script = splice.parse_script(b.get("script") or "")
            src = _splice_source(b)
            info = splice.media.video_info(src)
            timeline = splice.build_timeline(script, src_dur=info.get("duration"))
            import os
            from . import h3s_tv as tv
            folder = os.path.join(tv.root(), "splice")
            os.makedirs(folder, exist_ok=True)
            w, h = _splice_size(b, info)
            out = splice.write_splice(b.get("script") or "", src, folder,
                                      name=b.get("name") or "splice", w=w, h=h, characters=_splice_chars(b))
            out["script"] = splice.script_to_text(out["script"])
            out["plan"]["reference"] = out["reference"]
            return out
        return await _json_call(work)

    @routes.post("/h3lab/splice/to_order")
    async def splice_to_order(request):
        from . import h3s_splice as splice
        b = await request.json()

        def work():
            name = b.get("name") or "splice"
            src = _splice_source(b)
            info = splice.media.video_info(src)
            script = splice.parse_script(b.get("script") or "")
            timeline = splice.build_timeline(script, src_dur=info.get("duration"))
            import os
            from . import h3s_tv as tv
            folder = os.path.join(tv.root(), "splice")
            os.makedirs(folder, exist_ok=True)
            ref = os.path.join(folder, f"{tv.slug(name, 'splice')}_ref.mp4")
            w, h = _splice_size(b, info)
            if b.get("script") and not os.path.isfile(ref):
                splice.render(timeline["ops"], src, ref, w=w, h=h, audio=timeline["audio"])
            chars = _splice_chars(b)
            plan = splice.plan_shots(script, timeline, name, ref, characters=chars,
                                     w=w or 1344, h=h or 768)
            order = splice.to_order(plan, ref, name, b.get("brand") or "", characters=chars)
            return {"order": order, "plan": plan, "reference": ref}
        return await _json_call(work)

    # ---------------------------------------------------------------- multi-person cast + keyframes
    @routes.post("/h3lab/cast/analyse")
    async def cast_analyse(request):
        from . import h3s_cast as cast
        b = await request.json()

        def work():
            import numpy as np
            from . import h3s_media as media
            path = b.get("video") or ""
            info = media.video_info(path)
            frames = media.sample_video_frames(
                path, [k / cast.SAMPLE_FPS for k in range(int(info["frames"] / 24 * cast.SAMPLE_FPS))],
                480, int(480 * info["height"] / max(1, info["width"])))
            boxes = cast.detect_boxes(np.asarray(frames))
            if not boxes:
                raise ValueError("Каст: не найден детектор людей (модель YOLO person) или в кадре никого нет")
            report = cast.analyse(boxes, keyframes=int(b.get("keyframes") or 4),
                                  cuts=b.get("cuts") or ())
            report["video"] = path
            return report
        return await _json_call(work)

    @routes.post("/h3lab/cast/package")
    async def cast_package(request):
        from . import h3s_cast as cast
        b = await request.json()

        def work():
            import numpy as np
            from . import h3s_media as media
            video = b.get("video") or ""
            keyframes = b.get("keyframes") or []
            characters = b.get("characters") or []
            info = media.video_info(video)
            frames = media.sample_video_frames(
                video, [kf.get("at_seconds", 0.0) for kf in keyframes], 960,
                int(960 * info["height"] / max(1, info["width"])))
            request_json = cast.build_request(b.get("package") or "cast", keyframes, characters,
                                             b.get("describe") or {})
            import os
            from . import h3s_tv as tv
            folder = os.path.join(tv.root(), "keyframes")
            os.makedirs(folder, exist_ok=True)
            out = os.path.join(folder, (b.get("package") or "cast") + "_keyframes.zip")
            res = cast.export_package(out, {i: np.asarray(f) for i, f in enumerate(frames)}, keyframes,
                                      characters, request_json)
            res["request"] = request_json
            res["answer_file"] = cast.answer_file_for(out)
            return res
        return await _json_call(work)

    @routes.post("/h3lab/cast/import")
    async def cast_import(request):
        from . import h3s_cast as cast
        b = await request.json()

        def work():
            res = cast.import_answer(b.get("zip") or "", b.get("answer") or {})
            import json as _json, os
            path = cast.answer_file_for(b.get("zip") or "")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                _json.dump(res, f, ensure_ascii=False, indent=2)
            res["saved"] = path
            return res
        return await _json_call(work)

    @routes.get("/h3lab/status")
    async def status(request):
        try:
            from . import h3s_gen
            return web.json_response({"status": h3s_gen.run_status(request.query.get("node", ""))})
        except Exception as e:
            return web.json_response({"status": None, "error": str(e)})

    @routes.get("/h3lab/themes")
    async def themes_list(request):
        from . import h3s_themes
        return web.json_response(h3s_themes.list_themes())

    @routes.get("/h3lab/themes/{theme_id}/{path:.+}")
    async def themes_file(request):
        from . import h3s_themes
        theme_id = request.match_info.get("theme_id", "")
        rel = request.match_info.get("path", "")
        full = h3s_themes.resolve_file(theme_id, rel)
        if not full:
            return web.Response(status=404, text="theme file not found")
        return web.FileResponse(full, headers={"Content-Type": h3s_themes.content_type(full),
                                               "Cache-Control": "no-cache"})


    @routes.get("/h3lab/monitor")
    async def monitor(request):
        from . import h3s_monitor
        return await _json_call(h3s_monitor.payload, request.query.get("after", "0"))

    @routes.post("/h3lab/clear_cache")
    async def clear_cache(request):
        import folder_paths
        body = await request.json()
        pid = re.sub(r"[^A-Za-z0-9_-]", "", str(body.get("id") or ""))
        if not pid:
            return web.json_response({"ok": False, "error": "no id"}, status=400)
        from . import h3s_library
        try:
            d = h3s_library.project_root(pid)   # refuses _characters / _presets / … (global libraries are never a project)
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        from . import h3s_store   # finished takes (latent sidecars, masters, previews) survive unless takes=true
        n = h3s_store.clear(d, takes=bool(body.get("takes"))) if os.path.isdir(d) else 0
        return web.json_response({"ok": True, "removed": n})

    @routes.post("/h3lab/freeze")
    async def freeze(request):
        from . import h3s_gen
        body = await request.json()
        try:
            return web.json_response({"ok": True, "freeze": h3s_gen.freeze_segment(body.get("id"), body.get("key"))})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/video_info")
    async def video_info(request):
        from . import h3s_gen
        q = request.rel_url.query
        ref = {"filename": q.get("filename", ""), "subfolder": q.get("subfolder", ""), "type": q.get("type", "input")}
        try:
            import asyncio
            info = await asyncio.get_running_loop().run_in_executor(None, h3s_gen.video_asset_info, ref, q.get("strip", "1") != "0")
            return web.json_response({"ok": True, "info": info})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    # v6k ControlNet track: processed control video (pose / depth / canny / gray) for the timeline + model status
    @routes.post("/h3lab/control/process")
    async def control_process(request):
        from . import h3s_control, h3s_core
        from . import h3s_projfiles as pf
        try:
            q = await request.json()
            src = pf.ref_path(q.get("ref") or {})
            if not src or not os.path.isfile(src):
                raise ValueError("нет файла контрольного клипа")
            mode = q.get("mode") if q.get("mode") in h3s_core.CONTROL_MODES else "depth"
            params = h3s_core.normalize_control_params(q.get("params"))
            if mode == "ready":
                return web.json_response({"ok": True, "data": {"job": {"state": "done", "ref": None, "done": 1, "total": 1}}})
            miss = [f for (fo, f) in h3s_control.need_models(mode, params) if not h3s_control._find(fo, f)]
            if miss:
                return web.json_response({"ok": True, "data": {"job": {"state": "missing", "missing": miss, "done": 0, "total": 0}}})
            import asyncio
            job = await asyncio.get_running_loop().run_in_executor(None, h3s_control.start_job, src, mode, params)
            return web.json_response({"ok": True, "data": {"job": job}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/control/status")
    async def control_status(request):
        from . import h3s_control
        key = request.rel_url.query.get("key")
        try:
            if key:
                return web.json_response({"ok": True, "data": {"job": h3s_control.job_state(key)}})
            import asyncio
            st = await asyncio.get_running_loop().run_in_executor(None, h3s_control.status)
            return web.json_response({"ok": True, "data": {"status": st}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    # v6k «Рефайн лица»: faces in a finished clip for the picker (YuNet on a few frames, thumbnails) + readiness
    @routes.post("/h3lab/face/detect")
    async def face_detect(request):
        from . import h3s_face
        from . import h3s_projfiles as pf
        try:
            q = await request.json()
            src = pf.ref_path(q.get("ref") or {})
            if not src or not os.path.isfile(src):
                raise ValueError("нет файла клипа — сначала сгенерируйте отрезок")
            import asyncio
            data = await asyncio.get_running_loop().run_in_executor(None, h3s_face.detect_for_picker, src)
            return web.json_response({"ok": True, "data": data})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    # CPU-only camera-cut analysis on the same 24-fps timeline as guide-video decoding.
    @routes.post("/h3lab/swap/shots")
    async def swap_shots(request):
        from . import h3s_swap_mask, h3s_media
        from . import h3s_projfiles as pf
        try:
            q = await request.json()
            src = pf.ref_path(q.get("ref") or {})
            if not src or not os.path.isfile(src):
                raise ValueError("Не найден исходный видеофайл")
            frames = int(h3s_media.video_info(src)["frames"])
            if frames < 1 or frames > 100_000:
                raise ValueError("Видео слишком длинное для анализа планов (предел — 100000 кадров)")
            import asyncio
            cuts = await asyncio.get_running_loop().run_in_executor(
                None, h3s_swap_mask.detect_shot_cuts, src, frames)
            return web.json_response({"ok": True, "data": {"frames": frames, "cuts": cuts}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    # Experimental Swap: person selection (YOLO) and native SAM 3.1 verification.
    @routes.post("/h3lab/swap/people")
    async def swap_people(request):
        from . import h3s_swap_mask
        from . import h3s_projfiles as pf
        try:
            q = await request.json()
            src = pf.ref_path(q.get("ref") or {})
            if not src or not os.path.isfile(src):
                raise ValueError("Не найден исходный видеофайл")
            import asyncio
            data = await asyncio.get_running_loop().run_in_executor(
                None, h3s_swap_mask.picker, src, int(q.get("frame", 0)),
                int(q.get("width", 768)), int(q.get("height", 1344)))
            return web.json_response({"ok": True, "data": data})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/swap/mask-preview")
    async def swap_mask_preview(request):
        """SAM 3.1 preview on the selected shot frame (no project changes)."""
        from . import h3s_swap_mask
        from . import h3s_projfiles as pf
        try:
            from server import PromptServer
            running, pending = PromptServer.instance.prompt_queue.get_current_queue()
            if running or pending:
                raise ValueError("Дождитесь окончания текущих заданий ComfyUI перед проверкой SAM-маски")
            q = await request.json()
            src = pf.ref_path(q.get("ref") or {})
            if not src or not os.path.isfile(src):
                raise ValueError("Не найден исходный видеофайл")
            point = q.get("points") or q.get("point")
            flat = [point] if (isinstance(point, list) and len(point) == 2
                               and all(isinstance(v, (int, float)) for v in point)) else point
            if not isinstance(flat, list) or not flat:
                raise ValueError("Выберите человека на кадре")
            for one in flat:
                p = one.get("point") if isinstance(one, dict) else one
                if not isinstance(p, list) or len(p) != 2 or not all(0 <= float(v) <= 1 for v in p):
                    raise ValueError("Выберите человека на кадре")
            import asyncio
            data = await asyncio.get_running_loop().run_in_executor(
                None, h3s_swap_mask.mask_preview, src, point,
                int(q.get("width", 768)), int(q.get("height", 1344)), q.get("box"),
                int(q.get("frame", 0)))
            return web.json_response({"ok": True, "data": data})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/face/status")
    async def face_status(request):
        from . import h3s_face
        try:
            return web.json_response({"ok": True, "data": {"cv2": h3s_face.have_cv2(), "model": bool(h3s_face.yunet_path(download=False))}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    # «Персонажи»: card library (output/h3labstudio/_characters + models/refmods read-only)
    @routes.get("/h3lab/chars")
    async def chars_list(request):
        from . import h3s_chars
        try:
            import asyncio
            cards = await asyncio.get_running_loop().run_in_executor(None, h3s_chars.scan)
            return web.json_response({"ok": True, "data": {"cards": cards, "roots": [{"key": k, "path": p, "writable": w, "label": l} for k, p, w, l in h3s_chars.roots()],
                                      **h3s_chars.status()}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/lora/preview")
    async def lora_preview(request):
        """Serve a LoRA's local preview image (only under ComfyUI loras folders)."""
        from . import h3s_models as hm
        name = request.query.get("file") or request.query.get("name") or ""
        try:
            path = hm.lora_preview_path(name)
        except Exception:
            path = None
        if not path:
            return web.Response(status=404)
        # long cache: previews are static beside the weight file
        return web.FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})

    @routes.get("/h3lab/chars/preview")
    async def chars_preview(request):
        from . import h3s_chars
        try:
            p = h3s_chars.preview_path(request.query.get("id", ""))
        except Exception:
            p = None
        if not p:
            return web.Response(status=404)
        return web.FileResponse(p, headers={"Cache-Control": "no-cache"})

    @routes.post("/h3lab/chars/create")
    async def chars_create(request):
        from . import h3s_chars
        body = await request.json()
        try:
            import asyncio
            card = await asyncio.get_running_loop().run_in_executor(None, h3s_chars.create_from_editor, body)
            return web.json_response({"ok": True, "data": {"card": card}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/chars/upload")
    async def chars_upload(request):
        """multipart file -> the global card library's .uploads (never a project folder; cleaned after «Создать» / a day)."""
        from . import h3s_chars
        import asyncio, tempfile
        try:
            reader = await request.multipart()
            res = None
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name in ("file", "image"):
                    os.makedirs(h3s_chars.uploads_dir(), exist_ok=True)
                    fd, tmp = tempfile.mkstemp(prefix=".up-", suffix=".part", dir=h3s_chars.uploads_dir())
                    os.close(fd)
                    try:
                        with open(tmp, "wb") as f:
                            while True:
                                c = await part.read_chunk(1 << 20)
                                if not c:
                                    break
                                f.write(c)
                        res = await asyncio.get_running_loop().run_in_executor(None, h3s_chars.save_upload, tmp, part.filename)
                    finally:
                        if os.path.exists(tmp):
                            os.remove(tmp)
            if not res:
                raise ValueError("no file")
            return web.json_response({"ok": True, "data": res})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/chars/update")
    async def chars_update(request):
        from . import h3s_chars
        body = await request.json()
        try:
            import asyncio
            card = await asyncio.get_running_loop().run_in_executor(None, h3s_chars.update, str(body.get("id") or ""), body.get("fields") or {})
            return web.json_response({"ok": True, "data": {"card": card}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/chars/delete")
    async def chars_delete(request):
        from . import h3s_chars
        body = await request.json()
        try:
            return web.json_response({"ok": True, "data": {"removed": h3s_chars.delete(str(body.get("id") or ""))}})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/pick_folder")
    async def pick_folder(request):
        """Native «choose folder» dialog on the machine ComfyUI runs on (tkinter in a child process)."""
        body = await request.json()
        try:
            import asyncio
            path = await asyncio.get_running_loop().run_in_executor(None, _pick_folder, str(body.get("initial") or ""), str(body.get("title") or ""))
            return web.json_response({"ok": True, "path": path})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/export")
    async def export(request):
        from . import h3s_gen
        body = await request.json()
        try:
            import asyncio
            r = await asyncio.get_running_loop().run_in_executor(None, h3s_gen.export_video, body)
            return web.json_response({"ok": True, **r})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3lab/asset_edit")
    async def asset_edit(request):
        from . import h3s_gen, h3s_assets
        body = await request.json()
        try:
            import asyncio
            r = await asyncio.get_running_loop().run_in_executor(None, h3s_assets.run, body, h3s_gen.asset_path)
            if r.get("file") and body.get("kind") == "video" and body.get("action", "edit") == "edit":
                r["info"].update({k: v for k, v in h3s_gen.video_asset_info(r["file"], strip=False).items() if k in ("poster", "strip", "strip_n")})
            return web.json_response({"ok": True, **r})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/peaks")
    async def peaks(request):
        """Waveform peaks of an audio file in input/output/temp (cached by size+mtime)."""
        from . import h3s_gen, h3s_media
        q = request.rel_url.query
        ref = {"file": q.get("filename", ""), "subfolder": q.get("subfolder", ""), "type": q.get("type", "input")}
        if not ref["file"]:
            return web.json_response({"error": "no filename"}, status=400)
        try:
            path = h3s_gen.asset_path(ref)
            bins = max(16, min(8000, int(q.get("bins", 2000))))
            key = (path, h3s_gen.file_sig(path), bins)
            if key not in _PEAKS:
                import asyncio
                _PEAKS.clear() if len(_PEAKS) > 64 else None
                _PEAKS[key] = await asyncio.get_running_loop().run_in_executor(None, h3s_media.audio_peaks, path, bins)
            return web.json_response(_PEAKS[key])
        except (ValueError, FileNotFoundError) as e:
            return web.json_response({"error": str(e)}, status=404)
        except Exception as e:
            return web.json_response({"error": f"не удалось прочитать аудио: {e}"}, status=500)

    # ---------------------------------------------------------------- «Галерея» / «Проекты»
    async def _json_call(fn, *args):
        import asyncio
        try:
            return web.json_response({"ok": True, "data": await asyncio.get_running_loop().run_in_executor(None, fn, *args)})
        except FileNotFoundError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=404)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3lab/gallery")
    async def gallery(request):
        from . import h3s_library as lib
        q = request.rel_url.query
        return await _json_call(lib.gallery_list, None if q.get("all") == "1" else q.get("id", ""))

    @routes.post("/h3lab/gallery/update")
    async def gallery_update(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.gallery_update, b.get("pid"), b.get("id"), b.get("fields") or {})

    @routes.post("/h3lab/gallery/delete")
    async def gallery_delete(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.gallery_delete, b.get("pid"), b.get("id"))

    @routes.get("/h3lab/projects")
    async def projects(request):
        from . import h3s_library as lib
        return await _json_call(lib.project_list)

    @routes.get("/h3lab/project")
    async def project_get(request):
        from . import h3s_library as lib
        return await _json_call(lib.project_get, request.rel_url.query.get("id", ""))

    @routes.post("/h3lab/project/save")
    async def project_save(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_save, b.get("project") or {}, b.get("meta") or {})

    @routes.post("/h3lab/project/rename")
    async def project_rename(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_rename, b.get("id"), b.get("name"))

    @routes.post("/h3lab/project/delete")
    async def project_delete(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_delete, b.get("id"), bool(b.get("files")))

    # ---- self-contained projects: uploads, migration, size, shared leftovers
    @routes.post("/h3lab/asset_upload")
    async def asset_upload(request):
        """multipart: project (id), file -> output/h3labstudio/<id>/assets (one copy per content)."""
        from . import h3s_projfiles as pf
        reader = await request.multipart()
        pid, res = "", None
        try:
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "project":
                    pid = pf.clean_id(await part.text())
                elif part.name in ("file", "image"):
                    if not pid:
                        raise ValueError("project id must come before the file")
                    import asyncio
                    tmp = pf.upload_tmp(pid)
                    try:
                        with open(tmp, "wb") as f:   # streamed to disk (videos can be large)
                            while True:
                                c = await part.read_chunk(1 << 20)
                                if not c:
                                    break
                                f.write(c)
                        res = await asyncio.get_running_loop().run_in_executor(None, pf.finish_upload, pid, tmp, part.filename)
                    finally:
                        if os.path.exists(tmp):
                            os.remove(tmp)
            if not res:
                raise ValueError("no file")
            return web.json_response(res)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.post("/h3lab/project/localize")
    async def project_localize(request):
        from . import h3s_projfiles as pf
        b = await request.json()
        return await _json_call(pf.localize, b.get("project") or {})

    @routes.get("/h3lab/project/size")
    async def project_size(request):
        from . import h3s_projfiles as pf
        return await _json_call(pf.project_size, request.rel_url.query.get("id", ""))

    @routes.get("/h3lab/unused")
    async def unused_get(request):
        from . import h3s_projfiles as pf
        return await _json_call(pf.unused_shared)

    @routes.post("/h3lab/unused/clean")
    async def unused_clean(request):
        from . import h3s_projfiles as pf
        return await _json_call(pf.clean_unused)

    @routes.post("/h3lab/project/duplicate")
    async def project_duplicate(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_duplicate, b.get("project") or {}, b.get("new_id"), b.get("name"))

    @routes.post("/h3lab/project/export_zip")
    async def project_export_zip(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.export_zip, b.get("project") or {}, b.get("include_cache", True), b.get("folder") or "")

    @routes.post("/h3lab/project/import_zip")
    async def project_import_zip(request):
        """multipart: file (zip), new_id (used when the project id already exists here). Streamed to disk."""
        import tempfile
        from . import h3s_library as lib
        reader = await request.multipart()
        new_id, tmp = "", None
        try:
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "new_id":
                    new_id = (await part.text()).strip()
                elif part.name == "file":
                    fd, tmp = tempfile.mkstemp(suffix=".zip")
                    with os.fdopen(fd, "wb") as f:
                        while True:
                            chunk = await part.read_chunk(1 << 20)
                            if not chunk:
                                break
                            f.write(chunk)
            if not tmp:
                return web.json_response({"ok": False, "error": "нет файла"}, status=400)
            return await _json_call(lib.import_zip, tmp, new_id)
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    return True


_PEAKS = {}

_PICK_SCRIPT = """
import sys
import tkinter as tk
from tkinter import filedialog
r = tk.Tk(); r.withdraw()
try:
    r.attributes("-topmost", True)
except Exception:
    pass
import os
p = filedialog.askdirectory(title=os.environ.get("H3_TITLE") or "Save folder", initialdir=sys.argv[1] or None, mustexist=False)
sys.stdout.write(p or "")
"""


_PS_SCRIPT = (
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
    "Add-Type -AssemblyName System.Windows.Forms;"
    "$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.Opacity=0;"
    "$o.StartPosition='CenterScreen';$o.Show();"
    "$f=New-Object System.Windows.Forms.FolderBrowserDialog;$f.Description=$env:H3_TITLE;$f.ShowNewFolderButton=$true;"
    "if($env:H3_INIT){$f.SelectedPath=$env:H3_INIT};"
    "if($f.ShowDialog($o) -eq 'OK'){[Console]::Out.Write($f.SelectedPath)};$o.Close()")

def _pick_folder(initial, title=""):
    """tkinter (child process) -> on Windows PowerShell's folder dialog (portable ComfyUI's Python has no tkinter)
    -> macOS osascript -> zenity / kdialog."""
    import subprocess
    import sys
    import folder_paths
    ini = os.path.expanduser(initial.strip().strip('"')) if initial.strip() else ""
    if ini and not os.path.isabs(ini):
        ini = os.path.join(folder_paths.get_output_directory(), ini)
    while ini and not os.path.isdir(ini):
        ini = os.path.dirname(ini)
    ini = ini or folder_paths.get_output_directory()
    title = (title or "Save folder").replace('"', "").replace("\n", " ")[:120]   # the UI sends it in its language
    env = dict(os.environ, H3_INIT=ini, H3_TITLE=title)
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    attempts = [[sys.executable, "-c", _PICK_SCRIPT, ini]]
    if sys.platform == "win32":
        attempts.append(["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", _PS_SCRIPT])
    elif sys.platform == "darwin":
        attempts.append(["osascript", "-e", f'POSIX path of (choose folder with prompt "{title}")'])
    else:
        attempts += [["zenity", "--file-selection", "--directory", "--filename=" + ini + "/"], ["kdialog", "--getexistingdirectory", ini]]
    errs = []
    for cmd in attempts:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=900, encoding="utf-8", errors="replace", env=env, creationflags=flags)
        except subprocess.TimeoutExpired:
            raise RuntimeError("диалог выбора папки не был закрыт")
        except OSError as e:
            errs.append(f"{os.path.basename(cmd[0])}: {e}")
            continue
        out = r.stdout.strip()
        if r.returncode == 0:
            return os.path.normpath(out) if out else ""   # empty = cancelled
        errs.append(f"{os.path.basename(cmd[0])}: {(r.stderr or '').strip().splitlines()[-1:] or r.returncode}")
    raise RuntimeError("не удалось открыть диалог выбора папки (" + "; ".join(errs)[:300] + ") — введите путь вручную")
