# LAST FRAME + hidden context (experimental)

Settings → Продление и звук → Способ продолжения видео → LAST FRAME + скрытый контекст.

For an extended scene with a positive overlap, the decoded final RGB frame of the previous scene is encoded as a MiniMax keyframe at `overlap - 1` (pixel index). The hidden prefix is generated, not copied or locked. The existing stitcher drops all `overlap` hidden frames, and audio continuation retains its native locked audio overlap. A user-specified last frame remains at the end of the new scene. An explicit first frame prevents continuation, as before.

The old overlap mode remains the default. Existing caches keep their keys in the default mode; the experimental handover has a separate cache fingerprint. Native model runtime and FLF model selection still require ComfyUI integration testing. Use at least one overlap block; no hidden handover occurs for a zero-overlap join.

Unlike the old reference-picture method, this mode uses ImageToVideo conditioning, so normal REF images/videos and character cards are not included for the continued scene. Audio reference tracks and explicit audio lock continue through the existing audio path.
