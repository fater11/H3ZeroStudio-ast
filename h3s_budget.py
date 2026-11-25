"""Token budget for H3 runs: the DiT token count decides whether a shot fits the GPU.

A shot that overflows VRAM does not fail loudly — it starts paging and slows down several times over.
The budget is measured, not guessed: H3MD hit the wall at ~215k tokens on a 31.84 GiB card with the
standard reserves, so the same number is scaled by the VRAM this machine actually has.

Tokens counted: the canvas latents (one token per 16x16 pixel patch per latent frame), every reference
image, the reference video latents and the cards' own `tokens` field.
"""
import math, re

PATCH = 32                     # H3 costs one token per 32x32 px patch: 1088x1920 is 2040 tokens/frame,
                              # and the measured 215k ceiling then lands on the trained 362-frame shot
CALIBRATION_TOKENS = 215_000   # measured: a shot above this started paging on the calibration card
CALIBRATION_VRAM_GB = 31.84 - 0.68 - 2.0   # card total - ComfyUI reserve - headroom
DEFAULT_SAFETY = 0.85          # the measured good/bad gap was under 1%


def canvas_tokens(w, h, latent_frames):
    """Tokens of the generated canvas: one per 16x16 patch per latent frame."""
    per_frame = max(1, math.ceil(int(w) / PATCH)) * max(1, math.ceil(int(h) / PATCH))
    return int(per_frame * max(1, int(latent_frames)))


def image_tokens(w, h, count=1):
    return canvas_tokens(w, h, 1) * max(0, int(count))


def card_tokens(cards):
    """Cards carry their own token cost (h3s_core stores `tokens` in every card snapshot)."""
    return int(sum(int((c or {}).get("tokens") or 0) for c in (cards or [])))


def budget_tokens(vram_total_gb=None, reserve_gb=0.68, headroom_gb=2.0, extra_gb=0.0,
                  safety=DEFAULT_SAFETY, calibration_tokens=CALIBRATION_TOKENS,
                  calibration_vram_gb=None):
    """Token budget for this card: the calibration number scaled by the usable VRAM ratio."""
    if vram_total_gb is None:
        vram_total_gb = available_vram_gb()
    cal = CALIBRATION_VRAM_GB if calibration_vram_gb is None else float(calibration_vram_gb)
    usable = max(0.5, float(vram_total_gb) - float(reserve_gb) - float(headroom_gb) - float(extra_gb))
    return int(calibration_tokens * (usable / cal) * float(safety))


def available_vram_gb():
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception:
        pass
    return CALIBRATION_VRAM_GB


def tokens_per_frame(w, h):
    return max(1, math.ceil(int(w) / PATCH)) * max(1, math.ceil(int(h) / PATCH))


def segment_tokens(segment, w, h, ref_images=0, ref_video_frames=0, ref_video_w=None,
                   ref_video_h=None, cards=()):
    """Total DiT tokens of one shot: canvas + reference images + reference video + cards."""
    from . import h3s_core as core
    frames = int(segment.get("frames") or 0)
    total = canvas_tokens(w, h, core.latent_t(frames))
    total += image_tokens(w, h, ref_images)
    if ref_video_frames:
        total += canvas_tokens(ref_video_w or w, ref_video_h or h, core.latent_t(int(ref_video_frames)))
    total += card_tokens(cards)
    return int(total)


def fits(tokens, budget):
    return int(tokens) <= int(budget)


def _snap_down(frames, low, high, grid=17):
    k = (int(frames) - 5) // grid
    k = max((int(low) - 5) // grid, min((int(high) - 5) // grid, k))
    return grid * k + 5


def _snap_up(frames, low, high, grid=17):
    k = -(-(int(frames) - 5) // grid)
    k = max((int(low) - 5) // grid, min((int(high) - 5) // grid, k))
    return grid * k + 5


def parts_for(frames, tokens, budget, overlap=22, min_frames=124, max_frames=362):
    """Tile `frames` with the fewest parts that each fit the budget.

    Part lengths are on the H3 grid (5+17n) and inside the trained range; every part after the first
    repeats the previous `overlap` frames, and the parts cover the shot exactly — nothing after it moves.
    """
    frames = int(frames)
    if frames <= 0:
        return []
    if fits(tokens, budget) and frames <= max_frames:
        n = _snap_up(frames, min(min_frames, frames), max_frames) if frames % 17 != 5 else frames
        n = min(n, max_frames)
        return [{"index": 0, "start": 0, "frames": n, "overlap": 0, "new": n, "tail": n - frames}]
    per_frame = max(1e-9, tokens / frames)
    budget_len = int(budget / per_frame)
    max_len = _snap_down(min(max_frames, budget_len), min_frames, max_frames)
    min_len = _snap_up(min(frames, min_frames), min(5, min_frames), max_frames)
    parts, cursor = [], 0
    while cursor < frames:
        left = frames - cursor
        if not parts:
            new = _snap_up(min(left, max_len), min_len, max_len)
        else:
            cap = max(min_len - overlap, 5 + 17)          # a part must still add new frames
            new = _snap_up(min(left, max(max_len - overlap, cap)), cap, max(max_len, cap))
            new = min(new, max_len - overlap) if max_len - overlap >= cap else new
        length = new + (overlap if parts else 0)
        length = min(length, max_len + (overlap if parts else 0))
        start = max(0, cursor - (overlap if parts else 0))
        parts.append({"index": len(parts), "start": start, "frames": length,
                      "overlap": overlap if parts else 0, "new": length - (overlap if parts else 0)})
        cursor += parts[-1]["new"]
        if len(parts) > 512:
            break
    if parts and cursor > frames:                          # trim the tail so the shot ends where it did
        over = cursor - frames
        last = parts[-1]
        cut = min(over, max(0, last["new"] - 5))
        last["frames"] -= cut
        last["new"] -= cut
    for part in parts:
        part["tail"] = (part["start"] + part["frames"]) - min(frames, part["start"] + part["new"]
                                                              + (part["overlap"] if part["index"] else 0))
    return parts


TIME_RE = re.compile(r"\[\s*(\d+(?:[.,]\d+)?)\s*s\s*\]|At\s+(\d{1,2}):(\d{2})(?:\.(\d+))?")


def _mark_seconds(match):
    if match.group(1) is not None:
        return float(match.group(1).replace(",", "."))
    return int(match.group(2)) * 60 + int(match.group(3)) + float("0." + (match.group(4) or "0"))


def retime_prompt(prompt, part_start_s, part_end_s, fallback=""):
    """Keep the actions that fall inside this part, re-timed from the part's own start.

    An action outside the part is dropped with its sentence: leaving its text in would ask the model for
    something that belongs to another part.
    """
    text = str(prompt or "")
    pieces, cursor, hits = [], 0, []
    marks = list(TIME_RE.finditer(text))
    for n, match in enumerate(marks):
        head = text[cursor:match.start()]
        body_end = marks[n + 1].start() if n + 1 < len(marks) else len(text)
        body = text[match.end():body_end]
        t = _mark_seconds(match)
        local = t - float(part_start_s)
        if 0 <= local <= (float(part_end_s) - float(part_start_s)):
            hits.append(local)
            pieces.append(f"{head}[{local:.1f}s]{body}")
        cursor = body_end
    if not marks:
        return text.strip()
    tail = text[cursor:]
    out = " ".join(" ".join(pieces).split() + [tail.strip()]).strip()
    out = re.sub(r"\s{2,}", " ", out).strip(" .,")
    if not hits:
        return "No new action in this part." + (f" {fallback}" if fallback else "")
    if not out:
        return fallback or ""
    return out


def plan_parts(project, index, w, h, budget, **refs):
    """Parts for one segment of a project (uses the segment's own frames and the given reference load)."""
    from . import h3s_core as core
    segment = project["segments"][index]
    tokens = segment_tokens(segment, w, h, **refs)
    return {"tokens": tokens, "budget": budget, "parts": parts_for(segment.get("frames"), tokens, budget)}
