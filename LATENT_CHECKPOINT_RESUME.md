# Latent Checkpoint Resume (v27 experimental)

Enable **Settings → Cache → Latent Checkpoint Resume**. The existing per-segment `cache/seg_*.pt` contains the joint video/audio latent. The runtime finds the longest contiguous cached prefix, loads only its final segment as the `prev` anchor, and generates the suffix. It does **not** replay or decode older segments. `cache/resume_latest.json` is an atomic diagnostic pointer, not the source of truth.

**Important:** the output MP4, IMAGE, AUDIO and LATENT in Resume Only mode contain the anchor and subsequent segments, **not the entire timeline**. Switch Resume Only off to assemble the complete timeline from cached segments. The anchor is included in the suffix for conservative stitching; it is not newly sampled. Resume Only requires cache enabled and does not support Draft → Upscale → Refine or region/audio/face-only runs.

No claim of GPU testing.
