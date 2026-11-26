"""Opt-in bounded-memory Save Video path inspired by LongForge streaming export.

Use immutable take masters / prepared Studio RGB8 caches; never write a full
float32 timeline to disk. This is a Save-only, non-sampling fast path.
Unsupported projects keep the classic H3 assembly.
"""
from __future__ import annotations

import os
import time
import wave
import tempfile
import subprocess
import hashlib
import json

import torch

from . import h3s_media as media
from . import h3s_store as store
from . import h3s_studio_cache as studio_cache

TAIL = 32  # enough for Studio bridge's 16 before + 28 after


def select_encoder():
    """Automatically use a usable NVENC, never just a compiled-in codec name."""
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        test = subprocess.run(
            [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
             "-filter_threads", "1", "-f", "lavfi",
             "-i", "color=size=256x256:rate=24", "-frames:v", "1",
             "-c:v", "h264_nvenc", "-preset", "p4", "-pix_fmt", "yuv420p",
             "-threads", "1", "-f", "null", "-"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=20)
        if test.returncode == 0:
            return "nvenc"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "cpu"


def prepare(project_dir, project, keys, items, width, height, fps, studio_mode=False):
    """Return (plan, reason). Never touch incomplete / visually modified takes."""
    if not items or len(keys) != len(items):
        return None, "неполная цепочка отрезков"
    if any(int(it.get("gap") or 0) for it in items):
        return None, "на таймлайне есть пустые интервалы"
    if any(bool(project["segments"][it["index"]].get("freeze")) for it in items):
        return None, "есть зафиксированные дубли"
    from . import h3s_core as core
    if core.lock_clips(project):
        return None, "звуковая дорожка с блокировкой требует совместимой сборки"
    sources, waves, rate, prev_studio, no_colour = [], [], None, None, []
    for i, it in enumerate(items):
        key = keys[i]
        segment = project["segments"][it["index"]]
        if (core.is_footage(segment) or segment.get("upscale")
                or segment.get("fr") or segment.get("ar")):
            return None, f"отрезок {i + 1} имеет дополнительную обработку"
        filename = store.master_path(project_dir, key, width, height)
        if not os.path.isfile(filename):
            return None, f"нет мастер-файла отрезка {i + 1}"
        try:
            meta = media.video_info(filename, fps)
        except (OSError, ValueError) as exc:
            return None, f"не читается мастер отрезка {i + 1}: {exc}"
        if (meta["frames"] != int(it["frames"])
                or meta["width"] != int(width) or meta["height"] != int(height)
                or abs(meta["src_fps"] - fps) > 0.01):
            return None, f"отрезок {i + 1}: несовместимые кадры или разрешение"
        wav = store.load_wave(project_dir, key)
        if wav is None:
            return None, f"нет аудиокэша отрезка {i + 1}"
        if rate is None:
            rate = int(wav[1])
        if int(wav[1]) != rate:
            return None, f"частота звука отрезка {i + 1} отличается"
        waves.append(wav[0])
        colour_key = None
        if studio_mode:
            colour_key = studio_cache.identity(key, keys[0], prev_studio, it, width, height, fps)
            if not os.path.isfile(studio_cache.path_for(project_dir, colour_key)):
                # цветокоррекция не подготовлена: это не повод отказываться от потокового экспорта —
                # отрезок поедет без цветового слоя, а вызывающий скажет об этом в логе
                colour_key = None
                no_colour.append(i)
            else:
                prev_studio = colour_key
        sources.append({"path": filename, "overlap": int(it.get("overlap") or 0) if i else 0,
                        "link": it.get("link", "start"), "frames": int(it["frames"]),
                        "colour_key": colour_key})
    total = sum(s["frames"] - s["overlap"] for s in sources)
    end = int(project.get("end") or 0)
    if 0 < end < total:
        total = end
    if total <= 0:
        return None, "пустое видео после обрезки"
    tag = hashlib.sha256(json.dumps(
        {"keys": keys, "fps": fps, "frames": total, "studio": prev_studio,
         "sources": [(s["frames"], s["overlap"], s["link"]) for s in sources],
         "version": "ffmpeg-pipe-v1"}, sort_keys=True).encode()).hexdigest()[:16]
    return {"sources": sources, "waves": waves, "rate": rate, "frames": total, "fps": fps,
            "width": width, "height": height, "studio": bool(studio_mode), "tag": tag,
            "project_dir": project_dir, "no_colour": no_colour}, ""


def mixed_audio(plan, project, stitch_audio, normalize_level):
    """Use the existing H3 overlap, declick and loudness rules, not FFmpeg concat audio."""
    from . import h3s_core as core
    items = core.plan(project)
    seam = core.audio_seam_params(project)
    if len(plan["waves"]) > 1:
        sound, _gains = stitch_audio(plan["waves"], plan["rate"], items, plan["fps"],
                                    seam["xfade"], seam["match"], skip=seam.get("skip"),
                                    declick=seam.get("declick", True))
    else:
        sound = plan["waves"][0]
    result = normalize_level(sound[None])
    wanted = round(plan["frames"] / plan["fps"] * plan["rate"])
    if result.shape[-1] < wanted:
        result = torch.nn.functional.pad(result, (0, wanted - result.shape[-1]))
    else:
        result = result[..., :wanted]
    return {"waveform": result, "sample_rate": plan["rate"]}


def _write_audio(path, waveform, sample_rate):
    """Small, exact-length stereo/mono PCM16 input, removed with the stage directory."""
    samples = waveform.detach().float().cpu().clamp(-1, 1)
    if samples.ndim == 1:
        samples = samples[None]
    samples = samples[:2]
    with wave.open(path, "wb") as output:
        output.setnchannels(int(samples.shape[0]))
        output.setsampwidth(2)
        output.setframerate(int(sample_rate))
        for start in range(0, int(samples.shape[-1]), 65536):
            block = (samples[:, start:start + 65536].T.contiguous().numpy() * 32767).astype("<i2")
            output.writeframes(block.tobytes())


def render(plan, destination, out_audio, encoder="cpu", progress=None):
    """Encode one prepared take at a time, keeping only a 32-frame seam tail.

    The one temporary MP4 and PCM WAV live in the same removable staging folder.
    No decoded-frame .pt list, stitched float32 tensor or full-video mmap exists.
    """
    import imageio_ffmpeg
    from . import h3s_studio_color as studio

    total = int(plan["frames"])
    rate = int(plan["fps"])
    if encoder not in ("cpu", "nvenc"):
        raise ValueError("Unsupported pipe export encoder")
    started = time.perf_counter()
    reported = started
    os.makedirs(os.path.dirname(os.path.abspath(destination)), exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".h3zs_pipe_export_", dir=os.path.dirname(os.path.abspath(destination))) as directory:
        output = os.path.join(directory, "film.mp4")
        audio_file = os.path.join(directory, "sound.wav")
        error_file = os.path.join(directory, "ffmpeg.log")
        _write_audio(audio_file, out_audio["waveform"][0], int(out_audio["sample_rate"]))
        command = [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-y", "-hide_banner",
                   "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                   "-s:v", f"{plan['width']}x{plan['height']}", "-r", str(rate), "-i", "pipe:0",
                   "-i", audio_file, "-map", "0:v:0", "-map", "1:a:0",
                   "-vf", "scale=out_color_matrix=bt709:out_range=tv",
                   "-colorspace", "bt709", "-color_primaries", "bt709",
                   "-color_trc", "bt709", "-color_range", "tv"]
        if encoder == "nvenc":
            command += ["-c:v", "h264_nvenc", "-preset", "p4",
                        "-rc", "vbr", "-cq", "16", "-b:v", "0"]
        else:
            command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16"]
        command += ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    "-t", f"{total / rate:.9f}", "-movflags", "+faststart", output]
        process = None
        done = 0
        held = None
        preview = None
        with open(error_file, "w+b") as errors:
            try:
                process = subprocess.Popen(command, stdin=subprocess.PIPE,
                                           stdout=subprocess.DEVNULL, stderr=errors)

                def write_frames(frames):
                    nonlocal done, reported
                    if not len(frames):
                        return
                    for at in range(0, int(frames.shape[0]), 8):
                        try:
                            import comfy.model_management as mm
                            mm.throw_exception_if_processing_interrupted()
                        except ImportError:
                            pass  # standalone tests do not import ComfyUI
                        block = media.to_uint8(frames[at:at + 8])
                        process.stdin.write(block.tobytes())
                        done += int(block.shape[0])
                        now = time.perf_counter()
                        if progress and (now - reported > 0.7 or done == total):
                            try:
                                progress(done, total)
                            except Exception:
                                pass
                            reported = now

                for no, entry in enumerate(plan["sources"]):
                    if done >= total:
                        break
                    if held is not None and done + len(held) >= total:
                        # The video end marker falls inside the deferred tail:
                        # do not load or bridge a later scene after the cut.
                        write_frames(held[:total - done])
                        held = None
                        break
                    if entry["colour_key"]:
                        loaded = studio_cache.load(plan["project_dir"], entry["colour_key"], entry["frames"])
                        if loaded is None:
                            raise RuntimeError(f"Studio RGB8 cache of segment {no + 1} is missing or corrupt")
                        frames = loaded[0]
                    else:
                        frames = media.read_frames(entry["path"])
                    if int(frames.shape[0]) != entry["frames"]:
                        raise RuntimeError(f"Segment {no + 1} frames changed during export")
                    current = frames[entry["overlap"]:]
                    if held is not None:
                        if plan["studio"] and entry["link"] == "extend" and entry["overlap"]:
                            studio.bridge_pair(held, current)
                        write_frames(held)
                        held = None
                    if done + len(current) > total:
                        current = current[:total - done]
                    if preview is None and len(current):
                        preview = current[:1].clone()
                    if len(current) > TAIL:
                        write_frames(current[:-TAIL])
                        held = current[-TAIL:].clone()
                    elif len(current):
                        held = current.clone()
                    del current, frames
                if held is not None:
                    write_frames(held)
                    del held
                process.stdin.close()
                code = process.wait(timeout=max(180, int(total / rate * 15) + 120))
                if code:
                    errors.flush()
                    errors.seek(0)
                    raise RuntimeError("FFmpeg pipe encoder failed: " + errors.read().decode(errors="replace")[-2000:])
            finally:
                if process is not None:
                    if process.poll() is None:
                        process.kill()
                        process.wait()
                    if process.stdin is not None and not process.stdin.closed:
                        try:
                            process.stdin.close()
                        except (OSError, ValueError):
                            pass
        if done != total:
            raise RuntimeError(f"Pipe export emitted {done} instead of {total} frames")
        info = media.video_info(output, rate)
        if info["frames"] != total or not info["has_audio"]:
            raise RuntimeError(f"Pipe MP4 validation failed: {info['frames']} frames, audio={info['has_audio']}")
        media.replace_file(output, destination)
        if progress:
            progress(total, total)
        return preview if preview is not None else torch.zeros(1, plan["height"], plan["width"], 3)
