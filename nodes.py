import json

from . import h3s_core as core

NODE_ID = "ZL_H3ZeroStudioLab"  # unique id: other packs already use "H3Studio*" names


class ZL_H3ZeroStudioLab:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "H3ZeroStudio project (JSON). Edited in the full-screen editor, stored inside the workflow."}),
            },
            "optional": {
                # optional since the model & LoRA presets: a connected input always wins over the preset's file
                "model": ("MODEL", {"tooltip": "MiniMax H3 model (Ref2VA, turbo LoRA optional). Optional when a model preset is selected; a wired model wins over the preset (the preset's LoRAs are applied on top)."}),
                "clip": ("CLIP", {"tooltip": "H3 text encoder (Qwen3-VL): encodes the segment prompt together with the references. Optional when the preset sets an encoder; a wire wins."}),
                "vae": ("VAE", {"tooltip": "H3 video VAE: encodes references, decodes segments. Optional when the project's preset sets a VAE; a wire wins."}),
                "audio_vae": ("VAE", {"tooltip": "H3 audio VAE (minimax_h3_audio_vae). Needed for sound in the preview and the AUDIO output, and for the audio track."}),
                "audio": ("AUDIO", {"tooltip": "Timeline audio track: “reference” mode (<Audio 1> in every segment) or “main” (the sound stays as is, video follows it). Needs audio_vae."}),
                "global_seed": ("INT", {"default": -1, "min": -1, "max": 0x7FFFFFFFFFFFFFFF, "forceInput": True, "tooltip": "-1: use project/segment seeds. A connected nonnegative seed overrides every segment seed, including locked segment overrides."}),
                # Kept for old workflows but hidden in ComfyUI's node view; Save Video owns the switch.
                "assembly_mode": (["Обычный (IMAGE)", "Потоковый (MP4, экономия RAM)"], {"default": "Обычный (IMAGE)", "tooltip": "Legacy workflow setting; now select streaming assembly in Save Video."}),
                "sampler": ("SAMPLER", {"tooltip": "Custom sampler (e.g. KSamplerSelect). When wired it wins over the project's sampler for every pass."}),
                "model_pass2": ("MODEL", {"tooltip": "Optional model for Stage 2 (clean/refine and segment upscale); does not replace the draft model."}),
                "sampler_pass2": ("SAMPLER", {"tooltip": "Optional sampler for Stage 2 only."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "LATENT")
    RETURN_NAMES = ("images", "audio", "latent")
    OUTPUT_TOOLTIPS = ("Full/Assemble: all movie frames (24 fps). Generate/Colour: one preview frame; the complete movie is built separately.",
                       "Full/Assemble: movie sound. Generate/Colour: last clip sound (or silence if not cached).",
                       "Full/Assemble: stitched H3 AV latent. Generate/Colour: last clip AV checkpoint.")
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "MiniMax H3/H3ZeroStudio Lab"
    DESCRIPTION = ("H3ZeroStudio: a full-screen timeline editor for MiniMax H3. Segments with their own prompts and references, "
                   "continuation that keeps characters consistent, a cache of finished segments. Click “Expand” on the node.")

    # assembly_mode remains a Python argument for existing workflows; the user-facing
    # switch now lives in Save Video and is passed in project.run.export_stream.
    def run(self, project, model=None, clip=None, vae=None, audio_vae=None, audio=None, sampler=None, model_pass2=None, sampler_pass2=None, global_seed=-1, assembly_mode="Обычный (IMAGE)", unique_id=None):
        from . import h3s_gen
        factory = None  # live preview comes from h3s_gen.LivePreview (ComfyUI's own pbar would fight ours)
        images, out_audio, latent, info = h3s_gen.run_project(model, clip, vae, project, audio_vae, audio,
                                                              unique_id, factory, sampler=sampler, model_pass2=model_pass2, sampler_pass2=sampler_pass2, global_seed=global_seed, stream_output=assembly_mode.startswith("Потоковый"))
        return {"ui": {"h3s": [json.dumps(info, ensure_ascii=False)]}, "result": (images, out_audio, latent)}


LEGACY_NODE_ID = "ZL_H3StudioLab"  # first MVP name ("H3 Studio"), kept so old workflows still load


class ZL_H3StudioLegacy(ZL_H3ZeroStudioLab):
    DEPRECATED = True


NODE_CLASS_MAPPINGS = {NODE_ID: ZL_H3ZeroStudioLab, LEGACY_NODE_ID: ZL_H3StudioLegacy}
# same title for both ids; the legacy node (hidden from search by DEPRECATED) offers an "upgrade node" button in its compact view.
# English here; ComfyUI shows locales/ru/nodeDefs.json to users with a Russian ComfyUI (Comfy.Locale = ru).
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: "H3ZeroStudio Lab · Timeline (experiment)", LEGACY_NODE_ID: "H3ZeroStudio Lab · Timeline (experiment)"}
