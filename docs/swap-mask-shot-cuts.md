# Swap mask on a real shot cut (SAM 3.1)

Real footage, the same code path the Swap run uses (`h3s_swap_mask.prepare`), no synthetic
frames.

## Setup

- Source: `ComfyUI/input/20261009_173139__Scene_1__479ba7a93b7f44bd.clean.mp4`
  (608 × 1056, 362 frames, 24 fps). The pack's own detector found cuts at
  **138** and 224.
- Frame 100 is a close-up of a man's face; frame 138 starts another shot — a person seen
  from behind in the foreground with a concert crowd behind him.
- Selection: point `[0.50, 0.30]` (the man's face), 170 frames, canvas 768 × 1344,
  track grid 640 × 352, no explicit anchors (the auto path).
- Cache: `…/swap_probe/project/cache/swap_sam3/a0e180b2d94d7d7291ba`, three blocks
  (64 + 64 + 42), about 60 s on the 5060 Ti.

## Result

| frame | mask area | what it is |
|---|---|---|
| 60 | 0.078 | the man's face, the mask grows with the push-in |
| 100 | 0.171 | face |
| 130 | 0.254 | face |
| **137** (last frame of the shot) | 0.259 | the face, see `screenshots/swap_cut_prev137.jpg` |
| **138** (first frame of the new shot) | 0.513 | **the person of the new shot**, crowd untouched — `screenshots/swap_cut_new138.jpg` |
| 145 | 0.426 | the same person, the mask follows the head/shoulder — `swap_cut_new145.jpg` |
| 160 | 0.245 | the same person, the mask shrinks as he recedes — `swap_cut_new160.jpg` |

- Empty frames in 170: **0** — the mask never disappears and never blanks the shot.
- The transition at the cut is a re-seed (area 0.259 → 0.513 in one frame), not a slide:
  the mask covers the new shot's person instead of dragging the old face silhouette onto
  the crowd.
- At 160 the mask wraps around the foreground arm (a background hole between arm and
  torso) — the silhouette of that person, not a leak onto the stage crowd.

## Notes for the next session

- The auto path re-seeds on the **only** person YOLO finds on the new shot
  (`_auto_shot_seed`). With several people it returns `None` and the shot is left
  unchanged instead of swapping a bystander — the explicit anchor is the way to pick a
  person there: `mask_config["shots"] = [{"frame": 138, "point": [x, y]}]`, covered by
  `tests/test_swap_sam3.py`.
- Same fix, other half: `_restart_index()` catches a mid-block identity jump (a missed
  cut) and re-seeds or blanks the rest of the block.

## `noise_mask` polarity (for the video-ramp step)

`sample_segment` builds `w_*` as the **lock weight** (1 = take the finished latent) and
hands the sampler `noise_mask = 1 − w_*` (`h3s_gen.py`: `amask = 1.0 - w_a`,
`vmask = 1.0 - w_v`). So in ComfyUI's convention the mask means *denoise amount*:
**0 = keep the latent, 1 = sample freely**. Independent evidence from production runs:
the kept audio overlap comes out sample-exact (`audio seam 1->2: kept sound,
sample-exact splice … corr 1.0`) with `w_a = 1` on exactly that span.

A video ramp therefore has to lower `w_v` across the first frames of the overlap
(1 → 0), which lowers the mask 0 → 1 there — no sign flip needed.
