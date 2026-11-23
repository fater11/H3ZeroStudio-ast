# Continuous Two-Pass — build 26

Select **Continuous 2-pass** in Settings → Generation. Connect **SIGMAS** and **SIGMAS (stage 2)** to the generator node. Stage 1 must end at positive sigma and Stage 2 must start at exactly the same sigma and end at 0. Example: Stage 1 `1.0, 0.8, 0.69`; Stage 2 `0.69, 0.4, 0.0`. Set denoise to 1.0.

Optional MODEL (stage 2) and SAMPLER (stage 2) override stage 2. Stage 1 samples joint video/audio; Stage 2 receives the exact partially denoised joint latent with zero noise, without VAE decode or upscaling.

Existing full and draft/refine paths are unchanged. Runtime integration with ComfyUI has not been tested.
