"""Experimental, opt-in fixed speaker reference from the first H3 clip in a chain.

It only supplies a reference to subsequent REF-style continuations. It never
changes the original audio latent, the audio lock, or the sampled seed.
"""
import json

import torch

VOICE_KEY_VERSION = "first_voice_ref_v1"
MAX_VOICE_SECONDS = 15
VOICE_INSTRUCTION = (
    "Voice continuity: <Audio 1> is the original speaker's voice from the first "
    "generated segment of this scene. Keep the speaker's vocal identity, "
    "timbre, accent and language. Do not repeat the words of the reference."
)


def first_voice_latent(previous, seconds=MAX_VOICE_SECONDS):
    """Bounded CPU latent. Prefer the original anchor, never the rolling voice."""
    if not isinstance(previous, dict):
        return None
    source = previous.get("voice_anchor")
    if not isinstance(source, torch.Tensor):
        source = previous.get("a")
    if not isinstance(source, torch.Tensor) or source.ndim != 4 or source.shape[1:3] != (32, 2):
        return None
    # H3 audio latents run at 40 Hz. Keep no more than the first 15 seconds.
    count = min(source.shape[-1], max(1, int(seconds * 40)))
    if count < 1:
        return None
    return source[..., :count].detach().float().cpu().clone()


def carry_voice_anchor(previous, current_audio, link):
    """Reset the anchor after a cut; keep the first voice across extensions."""
    if link == "extend":
        anchor = first_voice_latent(previous)
        if anchor is not None:
            return anchor
    return first_voice_latent({"a": current_audio})


def reference_prompt(prompt):
    """Add the Audio 1 instruction without breaking a structured H3 JSON prompt."""
    text = str(prompt or "")
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        data = None
    if isinstance(data, dict):
        for key in ("integrated_multimodal_description", "detailed_multimodal_description",
                    "detailed_description", "retention_analysis", "summary"):
            if isinstance(data.get(key), str):
                data[key] = data[key].rstrip() + "\n" + VOICE_INSTRUCTION
                return json.dumps(data, ensure_ascii=False)
    return (text.rstrip() + "\n" if text.strip() else "") + VOICE_INSTRUCTION
