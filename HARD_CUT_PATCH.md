# Hard Cut — per-segment overlap

Select **Hard Cut · 0 s** in the incoming segment’s Overlap dropdown (v6 inspector, classic editor, or context menu). This saves `overlap_blocks: -2` for that segment. `-1` continues to mean project default; `0` is the legacy “last frame only” mode.

Hard Cut sets the temporal overlap to zero, so the full generated frames of both segments are retained and the overlap-based audio crossfade is not applied. The segment remains in `extend` mode: the last frame of the previous segment can still serve as a continuity reference. For an independent new scene, select **New scene** instead.

This changes the *generation dependency* as well as the final timeline layout when switching from nonzero overlap; an already generated take may require regeneration. It does not magically preserve a take that was generated using overlapping latent context.
