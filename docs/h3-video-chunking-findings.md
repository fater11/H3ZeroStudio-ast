# H3 video chunking: seam measurements (MiniMax H3)

Notes behind the continuation work of H3ZeroStudio Lab. Numbers are from the local
measurements of the H3 chunking experiments (ContextAnchoredTile) and from the Lab's own
segment runs on the 5060 Ti.

## Overlap length

| overlap | pixel frames | latent frames | seam |
|---------|--------------|---------------|------|
| 1 block | 22 | 7 | **best** — the locked tail carries the transition |
| 2 blocks | 39 | 12 | visible dip at the join (level drop in the overlap) |
| 3 blocks | 56 | 17 | dip as well, longer and weaker |

The overlap is `17·k + 5` pixel frames (`5k + 2` latent frames): `core.overlap_frames()`.
Longer overlaps do not help — the extra frames are re-sampled inside a locked region, which
costs quality and shows up as a dip on the stitch. The UI warns when a segment uses more
than 22 frames (see `h3s_editor.js`, "Перекрытие … даёт просадку на склейке").

## Noise on the seam

`comfy.sample.prepare_noise(samples, seed)` restarts the generator for every segment, so
each clip got an unrelated noise field. Measured DC level of the sampled latent around the
stitch:

| noise | DC jump at the seam |
|-------|--------------------|
| fresh field per segment (before) | blue +1.37 |
| one field for the whole film (now) | blue +0.13 |

Implementation: `h3s_gen.position_noise(video, audio, seed, start)` — every latent step draws
its own block from a generator seeded by `(seed, absolute pixel frame of the step, stream)`.
A step therefore gets the same noise wherever it lands in the film, and a continued clip
continues its predecessor's field instead of restarting it.

### Measured A/B (real H3 runs, RTX 5060 Ti, ref2va int8)

Two clips of 124 frames (the trained range 124–362) with the same prompt, overlap 22,
640×352, 10 steps, seed 4242. The only difference: the second clip either shares the film's
field or carries its own seed (4243) and therefore its own field. The first clip is
bit-identical in both runs (max |diff| = 0.0), so the comparison isolates the second clip.

| | shared field | own field |
|---|---|---|
| DC step at the seam (latent) | **+0.0169** | +0.0299 |
| … as a share of a typical step inside a clip | **0.41×** | 0.69× |
| RMS at the seam (seg1 → seg2) | 0.998 → 1.159 | 0.998 → 1.164 |
| visual drift vs clip 1: brightness | **+0.025** | −0.101 |
| … contrast | **×1.068** | ×0.692 |
| … detail | **×1.04** | ×0.737 |
| seam rating of the Lab (luma step / typical) | ×3.65 | ×2.79 |

The shared field halves the DC step of the seam and keeps the tone of the second clip
(contrast 7 % off instead of 31 % off). The Lab's own seam rating is a single-frame
statistic and went the other way in this pair — it reacts mostly to the content step
between the two prompts, not to the noise field; read it together with the drift numbers.

### Chain of four clips (the realistic case)

Four clips of 124 frames, one prompt, overlap 22, 640 × 352, 8 steps, seed 4242, one shared
field (the new default). Measured from the cached latents:

| seam | DC step | share of a typical step inside a clip |
|---|---|---|
| 1 → 2 | +0.0157 | 0.41× |
| 2 → 3 | +0.0298 | 0.77× |
| 3 → 4 | +0.0308 | 0.80× |

- the DC of every clip stays in a tight band (≈ −0.03 … +0.09), the RMS settles at ≈ 1.15 —
  the field does not run away over a chain;
- every seam adds a small **positive** DC step (≈ +0.03, under one typical step), so the
  step accumulates slowly along a long episode (+0.076 over three seams here). That is the
  residual the video-ramp idea was meant to remove — see the polarity note in
  `docs/swap-mask-shot-cuts.md`;
- the decoded-frame drift over the same chain is far bigger (by clip 3: luma −0.148,
  contrast ×0.659) — the model's own content drift, not the noise field.

### Why pixel frames, not indices

* the video grid repeats every 17 pixel frames (5 latent steps): the latent steps sit on
  pixel frames `17k + {0, 1, 5, 9, 13}`;
* the audio stream is a uniform 40 Hz tick (24 fps video → 1.667 ticks per pixel frame);
* clip starts are multiples of 17 (both `17k+5` frame counts and `17o+5` overlaps), so the
  grids of two neighbouring clips coincide and the field is continuous step by step.

Indexing by `offset + i` (a latent or audio index) drifts by the grid head exactly at the
seams — that was the trap of the first attempt.

## The seed belongs to the film

The field is one field, so the seed is one seed: the seed of the project (the node's
`global_seed` wins). A segment with its own seed (a new take, Seed Hunter) starts a new
field, and the segments that continue it inherit that field. An independent final-pass seed
(`settings.refine_seed`) is its own field as well.

Consequences:
* `core.seg_param` no longer adds the segment number to the seed (py and JS mirror);
* the segment cache key carries the absolute place of the clip (`"at"`), because the same
  clip at another place on the timeline samples other noise;
* `core.KEY_VERSION` is 2 — every take resamples once.
