"""Pure project / timeline logic for H3ZeroStudio (no torch, no comfy imports).

Mirrored 1:1 in web/js/h3s_core.js (tests/test_core_parity.py runs both and compares).

MiniMax H3 facts used here (comfy_extras/nodes_minimax_h3.py, comfy/ldm/minimax):
- 24 fps, valid clip lengths are 17k+5 pixel frames <-> 5k+2 latent frames;
- latent frame 5j is a standalone single-frame token at pixel frame 17j, so a tail of 5o+2
  latent frames of a 5m+2 latent starts at 5(m-o) (aligned) and decodes to the last 17o+5 frames;
- audio latent runs at 40 frames/s: length round(frames / 24 * 40);
- canvas multiple 32 (latent /16, DiT 2x2 patch); trained length range ~124-362 frames;
- at most 9 reference images per prompt (<Picture 1..9>).
"""
import copy
import hashlib
import json
import math
import re

FPS = 24
AUDIO_LATENT_FPS = 40
CANVAS_MULTIPLE = 32
MAX_REF_IMAGES = 9
TRAINED_MIN_FRAMES = 124
TRAINED_MAX_FRAMES = 362
MIN_FRAMES = 22
MAX_FRAMES = 17 * 56 + 5  # 957 frames ~ 40 s, hard UI limit
CATEGORY_ORDER = ("character", "location", "other")   # image references, in <Picture N> order
ASSET_CATEGORIES = CATEGORY_ORDER + ("audio", "video")
AUDIO_INPUT_ID = "input"           # the node's audio input, usable like an audio asset
MAX_REF_AUDIOS = 3                 # standalone <Audio j> references per segment (MiniMaxH3ReferenceToVideo)
REF_AUDIO_MAX_SEC = 20.0           # a reference audio is cut to its first seconds
MAX_REF_VIDEOS = 3                 # <Video k> references per segment (MiniMaxH3ReferenceToVideo ref_videos)
REF_VIDEO_MAX_SEC = 15.0           # H3 reference videos: 2-15 s
ASPECTS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1), "4:3": (4, 3), "3:4": (3, 4), "21:9": (21, 9)}
SCHEMA_VERSION = 1
KEY_VERSION = 2   # in every cache key — decoupled from the project schema, so a schema bump never re-samples clips
# 2: continuation noise is positioned on absolute film time (h3s_gen.position_noise) — every take resampled

DEFAULT_CONTINUITY = ("Continuity: <Picture {n}> is the last frame of the previous shot of this video; "
                      "continue seamlessly from it and keep characters, faces, clothing, lighting and details consistent with <Picture {n}>.")

DEFAULT_SETTINGS = {
    "kf_preset": "",           # v6h: preset for «Кадры» clips (image-to-video / first+last frame: the fl2va model); "" = as the project
    "model_preset": "",        # model & LoRA preset of the project (id in project["model_presets"]); "" = wired inputs
    "prompt": "",
    "negative": "",
    "aspect": "16:9",
    "res_mode": "mp",          # "mp" (megapixels + aspect) | "custom" (explicit w/h) | "ratio" (v6m: own W:H + megapixels)
    "ratio": "2.39:1",         # v6m «Своё соотношение»: W:H text ('2.39:1', '5:4', '1.85'), 1:4..4:1
    "image_ratio": 0.0,        # v6m aspect "image" («Как у изображения»): W/H of the FLF first (else last) frame
    "kf_fit": "crop",          # v6m «Вписать кадр» of FLF frames: crop (center) | pad (letterbox) | stretch | legacy (old projects: first stretched, last cropped)
    "kf_pad": "blur",          # v6m padding of kf_fit "pad": blur | black
    "megapixels": 0.5,
    "width": 960,
    "height": 544,
    "steps": 20,
    "cfg": 1.0,
    "sampler": "res_multistep",
    "scheduler": "simple",
    "shift_video": 12.0,
    "shift_audio": 3.0,
    "seed": 0,
    "fps": FPS,
    "denoise": 1.0,
    "overlap_blocks": 1,       # extend overlap: 5o+2 latent = 17o+5 pixel frames
    "audio_context_sec": 1.0,  # seconds of the previous sound the extension hears, ending where the overlap ends
                               # (reaches back before it, independent of the video overlap); 0 = just the overlap
    "self_anchor_voice": False,  # experimental: first generated voice as <Audio 1> on later full-pass extensions
    "lock_overlap": True,
    "continuation_method": "h3studio",  # h3studio (best on real seams: latent calibration + Lab tone) | protected | overlap
    "continuity_ref": True,    # last frame of previous segment as extra <Picture N>
    "continuity_phrase": DEFAULT_CONTINUITY,
    "ref_size": "match",
    "cache": True, "resume_only": False,
    # audio at extend seams (not used in the "locked" soundtrack mode)
    "audio_seam_lock": True,   # lock the overlap audio latent to the previous segment's tail (even without lock_overlap)
    "audio_xfade": True,       # equal-power crossfade inside the overlap when stitching the final audio
    "audio_xfade_sec": 0.4,    # crossfade length, 0.1-1.0 s (limited to the overlap)
    "audio_match": True,       # match the next segment's loudness (RMS) to the previous one around the seam
    "audio_declick": True,     # ~5 ms taper each side of hard audio cuts (new scene, footage, export edges)
    "level_lock": True,        # match brightness/colour on both sides of continuation joins (decoded frames only)
    "level_lock_frames": 12,   # blend window each side, 2-48 frames
    "magnet": False,           # timeline «🧲 Магнит»: off = a dragged clip leaves a gap; on = clips stick, drag reorders
    "vram_headroom_gb": 0.0,   # VRAM kept free while sampling / decoding (ComfyUI's reserve, never lowered); off by default: a reserve makes ComfyUI load the model partially (up to ~2x slower steps on 12 GB cards)
    # live preview while sampling (do not affect the cache keys)
    "preview_tiny_vae": "auto", "preview_max_res": 512, "preview_quality": 80, "preview_frames": 48,
    "swap_expand": 16,           # px the person mask grows before the paste (0 = off)
    "swap_feather": 12,          # px of the soft edge of the paste (0 = hard edge)
    "swap_fill_holes": True,     # close the holes inside the silhouette (glasses, gaps)
    "swap_temporal_expand": 2,   # frames the mask is unioned with (fast motion)
    "refine_prompt": "",          # the second pass prompt ("" = the segment prompt); a detail brief keeps the scene
    "export_grain": 0.0,         # film grain in the final MP4 only (0 = off; 0.005 is a good start)
    "export_preset": "",         # CPU x264 preset of the final MP4 ("" = medium), slower = better compression
    "preview_fps": 0, "preview_suppress": True, "preview_audio": True,
    "verbose_log": True,       # detailed [H3ZS] console log (run, segments, every step)
    # draft mode: «Черновик» samples every segment small and fast; «Финал» either samples again at full size
    # ("full", one pass) or takes each segment's draft (cached or made first), upscales its video latent and
    # refines it with a partial-denoise H3 pass ("refine"); the draft's sound is kept 1:1 (H3 audio denoise mask)
    "quality": "final",        # "final" | "draft"
    "final_mode": "full",      # "full" | "refine" (switched to "refine" when the user first turns drafts on)
    "piflow_steps": 0,        # 0 = normal H3; 2/4 = LakonLab pi-H3 DWD (pruned base only)
    "piflow_lora2": "",        # the DWD adapter for the 2-step schedule ("" = the built-in file in models/loras)
    "piflow_lora4": "",        # the DWD adapter for the 4-step schedule ("" = the built-in file in models/loras)
    "video_ramp_frames": 0,    # experimental: pixel frames at the end of the locked overlap that get re-noised (0 = off)
    "draft_scale": 0.5,        # linear size of the draft (0.5 = a quarter of the pixels)
    "lowhigh_low_steps": 0,    # Low/High: 0 = 2/3 of total steps automatically
    "lowhigh_scale": 0.60,     # Low Res linear fraction of the final width and height
    "lowhigh_denoise": 0.65,   # High Res scheduler denoise fraction, not an absolute sigma
    "high_sigma_schedule": "default",  # Low/High advanced: default | experimental karras7
    "draft_steps": 0,          # 0 = the normal steps
    "refine_sigma": 0.4,      # legacy absolute start sigma
    "refine_schedule_mode": "sigma",  # "sigma" = legacy; "basic" = exact ComfyUI BasicScheduler denoise fraction
    "refine_denoise": 0.30,   # only for BasicScheduler mode (independent of refine_sigma)
    "refine_identity_images": False,  # optional Stage 2: use first photo of multi-photo character card as Picture
    "refine_steps": 0,         # 0 = half of the normal steps (at least 4)
    "refine_seed": -1,          # -1 = reuse the draft seed; >= 0 = independent Stage 2 noise
    # draft -> final upscale: "learned" (H3 latent upscaler model). Missing model = a clear error.
    "upscale_method": "learned",
    "upscale_rev": 5,
    # «↑ Апскейл» (header: the whole video, clip: one clip): method / scale / sigma
    "seg_upscale": {"method": "latent", "scale": 2.0},   # legacy multiplier, migrated to a megapixel target ("mp")
    # upscale in temporal chunks (sequential, like ComfyUI-H3-WindowedRefine): approximate chunk length in seconds
    # (snapped to 17k+5 frames; 0 = the whole clip in one piece) and the chunk overlap in H3 blocks (5o+2 latent frames)
    "upscale_chunk_sec": 5.0,      # legacy (one value for all methods): migrated into upscale_profiles
    "upscale_chunk_overlap": 1,
    "upscale_profiles": None,      # own settings per upscale method (normalize_upscale_profiles), see SEG_UPSCALE_METHODS
    # «Настройки → Апскейл» → «Модель доработки»: the refine after the upscale runs on the project / clip presets
    # ("project") or on the user's own model + LoRA ("custom": a checkpoint from checkpoints / a diffusion model
    # from diffusion_models + one LoRA from loras)
    "upscale_gen": {"mode": "project", "model": "", "lora": "", "lora_strength": 1.0},
    # the learned H3 latent upscaler model (models/latent_upscale_models); "" = the first found (auto)
    "upscale_model": "",
    # «Настройки → Ускорение»: dense attention backend + optional Veda / TeaCache / torch.compile (no wires)
    "accel": {"attention": "kitchen", "veda": False, "veda_predictor": "", "teacache": False,
              "teacache_thresh": 0.15, "compile": False, "compile_backend": "inductor"},
    # v6m «Настройки → Экономия памяти»: chunked feed-forward of the DiT blocks (h3s_memory), off / auto / on
    "memsave": {"mode": "auto", "chunks": 2, "threshold": 4096},
    # stage parameters ("" / 0 = as the main sampling parameters)
    "draft_sampler": "", "draft_scheduler": "", "draft_cfg": 0.0,
    "refine_sampler": "", "refine_scheduler": "", "refine_cfg": 0.0,
    # «custom SIGMAS» schedules (set with the scheduler of the same level): "1.0, 0.5, 0.0" —
    # the exact list replaces the model's curve, the step count is len − 1
    "sigmas": "", "draft_sigmas": "", "refine_sigmas": "",
    # «Настройки»: "global" = follows the user's global settings, "project" = own settings (older projects)
    "settings_scope": "project",
}
STAGE_KEYS = ("draft_sampler", "draft_scheduler", "draft_cfg", "refine_sampler", "refine_scheduler", "refine_cfg")
RUN_KINDS = ("draft", "refine", "full")
# «Настройки»: set-once settings shared by all projects (unless a project keeps its own: settings_scope="project")
GLOBAL_KEYS = ("final_mode", "piflow_steps", "piflow_lora2", "piflow_lora4", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio",
               "lowhigh_low_steps", "lowhigh_scale", "lowhigh_denoise", "high_sigma_schedule",
               "draft_scale", "draft_steps", "draft_sampler", "draft_scheduler", "draft_cfg",
               "refine_sigma", "refine_schedule_mode", "refine_denoise", "refine_identity_images", "refine_steps", "refine_seed", "refine_sampler", "refine_scheduler", "refine_cfg",
               "sigmas", "draft_sigmas", "refine_sigmas",
               "upscale_method", "upscale_rev", "seg_upscale", "upscale_profiles", "upscale_chunk_sec", "upscale_chunk_overlap", "upscale_gen", "upscale_model", "overlap_blocks", "audio_context_sec", "self_anchor_voice", "lock_overlap", "continuation_method", "continuity_ref",
               "continuity_phrase", "ref_size", "cache", "resume_only", "audio_seam_lock", "audio_xfade", "audio_xfade_sec", "audio_match", "audio_declick", "level_lock", "level_lock_frames", "magnet", "vram_headroom_gb",
               "preview_tiny_vae", "preview_max_res", "preview_quality", "preview_frames", "preview_fps", "preview_suppress",
               "refine_prompt", "export_grain", "export_preset",
               "swap_expand", "swap_feather", "swap_fill_holes", "swap_temporal_expand",
               "verbose_log", "accel", "memsave")


def global_settings(values):
    """Normalized subset of the set-once settings (only the keys given)."""
    values = {k: v for k, v in (values or {}).items() if k in GLOBAL_KEYS}
    st = normalize_project({"settings": values, "segments": []})["settings"]
    keys = list(values) + (["upscale_rev"] if "upscale_profiles" in values else [])   # the profiles' migration rev travels with them
    return {k: st[k] for k in keys}
DRAFT_SCALES = (0.45, 0.5, 0.55, 0.60, 0.67, 0.75)  # 0.45≈0.2 MP and 0.55≈0.3 MP at a 1 MP target
REFINE_SIGMA_RANGE = (0.15, 0.8)
UPSCALE_METHODS = ("learned",)   # nearest-exact / VAE-Lanczos / RTX VSR removed
# «Апскейл отрезка»: per-segment upscale + low-strength refine (see h3s_upscale.py)
SEG_UPSCALE_METHODS = ("latent", "tiles")   # "windows" path = latent+windowed refine; tiles = SyncTile (in-tree)
SEG_UPSCALE_SCALES = (1.5, 2.0)                       # legacy multipliers (older projects; migrated to "mp")
SEG_UPSCALE_MP_PRESETS = (1.0, 1.5, 2.0, 2.5, 3.0, 4.0)   # «Размер» presets, megapixels of the upscaled frame
SEG_UPSCALE_MP_RANGE = (0.01, 8.5)
UPSCALE_CHUNK_SEC_RANGE = (2.0, 30.0)
UPSCALE_CHUNK_OVERLAP_RANGE = (1, 3)
SEG_UPSCALE_SIGMA = {"latent": 0.4, "tiles": 0.6}   # default refine strength (start sigma) per method
SEG_UPSCALE_SIGMA_RANGE = (0.1, 1.0)
SEG_UPSCALE_SIGMA_OLD_TILES = 0.35   # the tiles default before upscale_rev 4 (a profile still at it moves to 0.6)
UPSCALE_REV = 5   # rev 5: drop RTX; saved rtx profiles/clips migrate to tiles σ 0.60
# every upscale method keeps its own profile: switching the method in «Настройки» only selects another profile.
# The upscale fields (mp, sigma, quality, tile, tile_ov) are what a clip gets; steps / sampler / scheduler of the
# refine pass ("" / 0 = those of «Этап 2») and the temporal chunks are read by method when the upscale runs.
UPSCALE_CHUNK_DEFAULT = {"latent": True, "tiles": False}
UPSCALE_UP_FIELDS = ("mp", "scale", "sigma", "tile", "tile_ov")
# tiled upscale: tile size in px (multiple of 32; absent = the clip's own canvas) and overlap in latent cells (×16 px;
# absent = auto, max(4, min(16, tile/3))) — stored only when set, so older upscale keys stay valid
TILE_PX_RANGE = (256, 2048)
TILE_OV_RANGE = (2, 32)
UPSCALE_LABELS_LOG = {"latent": "latent/windows", "tiles": "tiles"}
AUDIO_XFADE_RANGE = (0.1, 1.0)
AUDIO_MATCH_RANGE = (0.5, 2.0)    # gain limits of the loudness match (about +-6 dB)
AUDIO_MATCH_RELEASE = 2.0         # seconds over which the matching gain returns to 1

DEFAULT_SEGMENT = {
    "id": "",
    "name": "",
    "color": 0,
    "frames": 124,
    "prompt": "",
    "refs": [],
    "cards": [],              # «Персонажи»: [{id, w (weight: >= 1 copies, < 1 weaker), on, look, voice}] after the plain refs
    "link": "extend",         # "extend": continue previous segment | "cut": new shot, no continuity
    "gap": 0,                 # empty frames before the clip (black + silence); a gap makes the clip a new shot
    "overlap_blocks": -1,      # per-segment extend overlap (blocks of 17 frames, 17o+5 frames); -1 = global setting
    "overrides": {},           # seed/steps/cfg/denoise/sampler/scheduler/shift_video/shift_audio
    # generated versions: [{id, key, sig, seed, created, snap{prompt,refs,frames,overrides,link}, result}]
    # choosing a take restores its snapshot, so the cache key matches again and the take's latent
    # is reused for the stitch and as the continuity source of the next segment
    "takes": [],
    "active_take": None,
    "locked": False,
    "freeze": None,   # «Зафиксировать»: {key, sig, frames, ...} -> never regenerated
    # v6l hotfix: the take the user chose, used as is: {take, key (its sampling key), ukey?, kind, sig, at, bat}. The
    # editor drops it as soon as the clip is edited; while set, the clip's key IS that key (its cached latent)
    "pin": None,
    # footage clip: a video asset on the timeline. denoise 0 = used as is (VAE-encoded, continuity source of the
    # next segment), > 0 = regenerated from it (vid2vid with that denoise, prompt and refs apply)
    "source": None,   # {asset, in (frames into the file), denoise}
    # «Апскейл отрезка»: {method "latent"|"tiles", mp/scale, sigma, tile, tile_ov} or None
    "upscale": None,
    "approved": False,   # «Одобрен» (for «Апскейл: все одобренные»; a frozen segment counts as approved)
    # v6h «Кадры»: first / last frame keyframes (image assets). The mode picks itself: first only = image-to-video,
    # last set (with or without first) = first/last frame (fl2va), none / off = text-to-video (the reference path)
    "kf": None,   # {on, first, last}
    "ar": None,   # v6h: «Улучшить звук» params of the active take (the segment plays its audio-refined copy)
}

MAX_TAKES = 12
MEMSAVE_MODES = ("off", "auto", "on")


def normalize_memsave(v):
    """settings.memsave (mirror of h3s_core.js normalizeMemsave; used by h3s_memory)."""
    v = v if isinstance(v, dict) else {}

    def n(x, d, lo, hi):
        try:
            return max(lo, min(hi, int(x)))
        except (TypeError, ValueError):
            return d
    return {"mode": v.get("mode") if v.get("mode") in MEMSAVE_MODES else "auto",
            "chunks": n(v.get("chunks", 2), 2, 1, 16), "threshold": n(v.get("threshold", 4096), 4096, 256, 262144)}

# «✂ Участок»: regenerate a time range in the middle of the video (generated clips and footage alike). The range is
# re-sampled inside a 17k+5 window of its scene with clean head/tail context frames on both sides (H3's native
# per-token video/audio denoise mask), then spliced back frame-exactly (video) and sample-exactly (audio).
DEFAULT_REGION = {
    "id": "",
    "name": "",
    "start": 0,          # timeline pixel frames of the range to regenerate (snapped to the scene's 17-frame grid)
    "end": 0,
    "head": -1,          # clean context blocks before the range (17 frames each); -1 = the global overlap setting
    "tail": -1,          # clean context after it (17·o + 5 frames); -1 = the global overlap setting
    "prompt": "",
    "refs": [],
    "cards": [],
    "seed": 0,
    "takes": [],         # [{id, key, sig, seed, created, snap{...}, result{...}}]
    "active_take": None, # take applied to the video; None = the original
    "upscale": None,     # «Апскейл участка»: the take's window upscaled + refined (same dict as a clip upscale)
}
MAX_REGIONS = 16

MARKER_EFFECTS = ("note", "prompt", "boost")
DEFAULT_MARKER = {
    "id": "",
    "frame": 0,                # timeline pixel frame
    "label": "",
    "color": 0,
    "effect": "note",          # "note": just a note | "prompt": event text added to the segment prompt at this time
    "text": "",                #  | "boost": stronger identity of a character reference in that segment (prompt emphasis)
    "asset": "",               # boost: asset id ("" = all characters of the segment)
}
MARKER_PROMPT = "At {t}s: {text}"
BOOST_PHRASE = ("Strictly preserve the identity of {pics} exactly as in the reference image: "
                "same face, hairstyle, body proportions and clothing in every frame.")

DEFAULT_AUDIO = {
    # Clips on the audio track are the main composition: their audio latent is locked on every step, the video
    # follows the sound. Where no clip lies H3 generates the sound itself. Audio assets in a segment's references
    # are <Audio j> references instead.
    "clips": [],
    "video_volume": 1.0,       # level of the video's own (generated) sound under the music, export/playback
    "input_ref": None,         # copy of the last connected input audio written by the node (for the waveform)
}
DEFAULT_AUDIO_CLIP = {
    "id": "",
    "asset": AUDIO_INPUT_ID,   # audio asset id, or "input" (the node's audio input)
    "lane": 0,                 # 0 / 1: lock lanes (mixed, locked); 2: music (overlay, never locked, not a reference)
    "volume": 1.0,             # clip level 0..2
    "fade_in": 0.0,            # seconds
    "fade_out": 0.0,
    "start": 0.0,              # timeline seconds where the clip begins
    "in": 0.0,                 # seconds into the source where the clip starts (trim in)
    "length": 0.0,             # clip length in seconds, 0 = until the end of the source
}

MUSIC_LANE = 2

AUDIO_REF_PHRASE = "Use {tags} as the sound reference of this shot."
VIDEO_REF_PHRASE = "Use {tags} as the motion reference of this shot."
# «Персонажи» (pre-encoded RefMod cards): a card whose labels the prompt does not cite gets one line by its concept
MAX_CARDS = 8
CARD_W_MAX = 4.0
CARD_CONCEPTS = ("identity", "background", "clothing", "style", "pose_motion", "voice", "generic")
CARD_LOOK_PHRASE = {
    "identity": "{label} shows {who}; keep this identity and appearance.",
    "background": "The location looks like {label}.",
    "clothing": "The outfit is the one in {label}.",
    "style": "The visual style follows {label}; its content is not copied.",
    "pose_motion": "The motion follows {label}; its content is not copied.",
    "generic": "Use {label} as a reference.",
    "voice": "Use {label} as a reference.",
}
CARD_VOICE_PHRASE = "{label} is {whose} voice timbre reference."
# Character swap on footage: the source clip (the guide) drives pose, motion, camera and light; the character
# card is the appearance. This is the brief of the reference minimax_h3_character_swap_v1.1 workflow: an explicit
# "who changes / what is kept / what is transferred" makes the model replace the person instead of merely
# "considering" the picture. {details} comes from the card's appearance, {pics} from its pictures.
SWAP_BRIEF = ("body_swap: subject_definitions: <Subject 1> is the {details} shown in {pics}, whose identity, face, "
              "head, hair or fur, skin, body shape, proportions and clothing define the character in the target "
              "video. The guide video provides the scene and the performance: its background, environment, "
              "lighting, camera, framing, body pose, hand and arm movement, head rotation, gaze direction, lip "
              "movement and facial expression, frame by frame; only the main subject of the guide video is "
              "replaced: its face, hair, body and clothing become <Subject 1>. summary: [video generation + "
              "reference] Replace the guide subject with <Subject 1>, keeping the scene, camera and the complete "
              "motion and performance of the guide video. detailed_description: [Shot 1] <Subject 1> takes the "
              "exact place of the guide subject and moves with the same timing, body pose, gestures, head motion, "
              "gaze, speech and facial expressions, while keeping the complete identity from {pics}: facial "
              "structure, hair or fur, skin, body shape and clothing stay stable in every frame. The background, "
              "lighting, colors and camera of the guide video are preserved. Prevent identity drift, clothing "
              "changes, texture crawling and flicker.")
CARD_SNAP_KEYS = ("name", "sig", "concept", "vkind", "audio", "tokens", "subject_name", "appearance", "retained_attributes", "voice_description")
OVERRIDE_KEYS = ("seed", "refine_seed", "steps", "cfg", "denoise", "sampler", "scheduler", "sigmas", "shift_video", "shift_audio")
# «custom SIGMAS» (a scheduler select item): the companion text field holds the exact schedule
SIGMAS_SCHEDULER = "custom"
SIGMAS_TEXT_MAX = 2000


def parse_sigmas(text):
    """"1.0, 0.5, 0.0" -> [1.0, 0.5, 0.0] (n steps = n+1 values, any curve); None when empty / unparsable."""
    if not isinstance(text, str) or not text.strip():
        return None
    try:
        vals = [round(float(x), 6) for x in re.split(r"[,\s]+", text.strip()) if x]
    except ValueError:
        return None
    return vals if 2 <= len(vals) <= 1000 and all(math.isfinite(x) for x in vals) else None


# ---------------------------------------------------------------- frame grid
def snap_frames(n, mode="nearest"):
    """Snap a pixel frame count to the H3 grid 17k+5 within [MIN_FRAMES, MAX_FRAMES]."""
    n = float(n)
    k = (n - 5) / 17.0
    k = math.floor(k) if mode == "down" else math.ceil(k) if mode == "up" else math.floor(k + 0.5)
    k = max((MIN_FRAMES - 5) // 17, min((MAX_FRAMES - 5) // 17, int(k)))
    return 17 * k + 5


def latent_t(frames):
    return 2 if frames <= 5 else ((frames - 5) // 17) * 5 + 2


def frames_for_latent(t):
    return sum((1, 4, 4, 4, 4)[k % 5] for k in range(t))


def audio_len(frames):
    return round(frames / FPS * AUDIO_LATENT_FPS)


def overlap_frames(o):
    return 17 * int(o) + 5


MAX_OVERLAP_BLOCKS = 8
MAX_GAP = 24 * 600   # longest empty stretch between clips (frames)
AUDIO_CONTEXT_MAX = 4.0


# The kept overlap audio ends with a hard 0/1 boundary of the audio denoise mask (as H3's native extension).
# A fractional "hand-off" ramp blended two differently noised latents there: the variance loss decoded as a
# ~60 ms dropout right after the overlap (measured in a user's final file). 0 = no ramp.
AUDIO_HANDOFF_TICKS = 0


def audio_context_extra(project, a_ov, available):
    """Audio latent frames of the previous segment given as context BEFORE the overlap (a multiple of 5 so the
    window sits exactly on the pixel-frame grid: 5 audio frames = 3 pixel frames), limited to what exists."""
    want = float(project["settings"].get("audio_context_sec", 0) or 0)
    want = min(want, AUDIO_CONTEXT_MAX)
    ext = int(round(want * AUDIO_LATENT_FPS)) - int(a_ov)
    if ext <= 0:
        return 0
    ext = ext // 5 * 5 + (5 if ext % 5 else 0)
    return max(0, min(ext, int(available) // 5 * 5))


def wanted_overlap(project, index):
    """Overlap blocks requested for segment `index` (before fitting): its own override or the global setting,
    0 = no overlap (last frame only)."""
    s = project["settings"]
    seg = project["segments"][index]
    o = int(seg.get("overlap_blocks", -1) if seg.get("overlap_blocks", -1) is not None else -1)
    if o == -2:  # explicit hard cut: no temporal overlap; preserve last-frame continuity
        return 0
    if o < 0:
        o = int(s.get("overlap_blocks", 1) or 0)
    return max(0, min(MAX_OVERLAP_BLOCKS, o))


def snap32(x):
    return max(CANVAS_MULTIPLE, int(math.floor(float(x) / CANVAS_MULTIPLE + 0.5)) * CANVAS_MULTIPLE)


def run_kind(settings):
    """Kind of sampling pass a run does: "draft", "refine" (final from the draft) or "full" (one pass)."""
    if settings.get("quality") == "draft":
        return "draft"
    return "refine" if settings.get("final_mode") == "refine" else "full"


def work_resolution(settings, kind=None):
    """Canvas of a pass: the draft is resolution() scaled by draft_scale (snapped to 32), else resolution()."""
    w, h = resolution(settings)
    if (kind or run_kind(settings)) != "draft":
        return w, h
    k = float(settings.get("draft_scale") or 0.5)
    return snap32(w * k), snap32(h * k)


def pass_steps(settings, steps, kind):
    """Steps of a pass from the segment's normal steps."""
    if kind == "draft":
        return int(settings.get("draft_steps") or 0) or steps
    if kind == "refine":
        return int(settings.get("refine_steps") or 0) or max(4, steps // 2)
    return steps


def lowhigh_params(settings, total_steps):
    """Effective Low/High split, relative video scale and High Res denoise.

    Explicit low steps are bounded by each segment's actual step count. Zero keeps the
    legacy two-thirds rounding; default values preserve existing cache keys and results.
    """
    total = max(2, int(total_steps))
    requested = max(0, int(_num(settings.get("lowhigh_low_steps"), 0)))
    auto = max(1, min(total - 1, round(total * 2 / 3)))
    transition = min(total - 1, requested) if requested else auto
    scale = _round(max(0.25, min(1.0, _num(settings.get("lowhigh_scale"), 0.60))), 3)
    denoise = _round(max(0.10, min(1.0, _num(settings.get("lowhigh_denoise"), 0.65))), 3)
    return transition, scale, denoise


RATIO_RANGE = (0.25, 4.0)   # v6m: 1:4 .. 4:1
KF_FITS = ("crop", "pad", "stretch", "legacy")
KF_PADS = ("blur", "black")


def parse_ratio(v):
    """v6m «Своё соотношение»: '2.39:1' / '5:4' / '16x9' / '16/9' / '1.85' -> W/H, None when not a ratio in 1:4..4:1."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        r = float(v)
    else:
        m = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(?:[:x×/]\s*(\d+(?:[.,]\d+)?))?\s*", str(v or ""))
        if not m:
            return None
        a, b = float(m.group(1).replace(",", ".")), float((m.group(2) or "1").replace(",", "."))
        if b <= 0:
            return None
        r = a / b
    return r if math.isfinite(r) and RATIO_RANGE[0] - 1e-9 <= r <= RATIO_RANGE[1] + 1e-9 else None


def aspect_ratio(settings):
    """W/H the "mp" / "ratio" canvas is built for."""
    s = settings
    if s.get("res_mode") == "ratio":
        return parse_ratio(s.get("ratio")) or 16 / 9
    if s.get("aspect") == "image":
        return parse_ratio(_num(s.get("image_ratio"), 0)) or 16 / 9
    a = ASPECTS.get(s.get("aspect"), (16, 9))
    return a[0] / a[1]


def resolution(settings):
    """(width, height) snapped to 32. "mp": aspect + megapixels, "custom": explicit, "ratio": own W:H + megapixels."""
    s = settings
    if s.get("res_mode") == "custom":
        return snap32(s.get("width", 960)), snap32(s.get("height", 544))
    if s.get("res_mode") == "ratio" or s.get("aspect") == "image":
        a = (aspect_ratio(s), 1)
    else:
        a = ASPECTS.get(s.get("aspect"), (16, 9))
    mp = max(0.05, min(4.0, float(s.get("megapixels", 0.5))))
    px = mp * 1024 * 1024
    w = math.sqrt(px * a[0] / a[1])
    h = w * a[1] / a[0]
    # same as the template's ResolutionSelector table: 0.5 MP 16:9 -> 960x544, 0.98 -> 1344x768
    return snap32(w), snap32(h)


# ---------------------------------------------------------------- project
def _num(v, d):
    if isinstance(v, bool) or v is None or v == "":
        return d
    try:
        f = float(v)
        return f if math.isfinite(f) else d
    except (TypeError, ValueError):
        return d


# ------------------------------------------------------------------ model & LoRA presets (mirror of h3s_core.js)
# «✨ Ассистент»: chats and prompt-mode presets live in the project. Every preset uses
# an OpenAI-compatible API; cfg stores its model, sampling, system prompt and context switches.
MAX_ASSIST_CHATS = 20
MAX_ASSIST_MSGS = 200
MAX_ASSIST_PRESETS = 20
ASSIST_BUILTIN_PRESETS = ("chat", "t2va", "ref2va", "i2va", "fl2va", "l2va", "lipsync")


def _assist_sampling(rc, thinking):
    defaults = {"temperature": 1.0 if thinking else 0.7, "top_p": 0.95 if thinking else 0.8,
                "top_k": 20, "min_p": 0.05 if thinking else 0.0,
                "presence_penalty": 0.0 if thinking else 1.5, "repetition_penalty": 1.0}
    sampling = rc.get("sampling") if isinstance(rc.get("sampling"), dict) else {}
    profile = sampling.get("thinking" if thinking else "plain")
    profile = profile if isinstance(profile, dict) else {}
    legacy = not sampling and (("thinking" not in rc) or (rc.get("thinking") is not False) == thinking)
    limits = {"temperature": (0.0, 2.0), "top_p": (0.0, 1.0), "top_k": (0, 200),
              "min_p": (0.0, 1.0), "presence_penalty": (-2.0, 2.0), "repetition_penalty": (0.0, 2.0)}
    out = {}
    for key, default in defaults.items():
        fallback = rc.get(key, default) if legacy and key in ("temperature", "top_p") else default
        value = _num(profile.get(key), _num(fallback, default))
        lo, hi = limits[key]
        value = max(lo, min(hi, value))
        out[key] = int(value) if key == "top_k" else _round(value, 3)
    return out


def _assist_cfg(rc):
    rc = rc if isinstance(rc, dict) else {}
    return {"mode": str(rc.get("mode") or "chat")[:30],
            "temperature": _round(max(0.0, min(2.0, _num(rc.get("temperature"), 0.7))), 2),
            "top_p": _round(max(0.0, min(1.0, _num(rc.get("top_p"), 0.9))), 2),
            "thinking": rc.get("thinking") is not False,
            "sampling": {"thinking": _assist_sampling(rc, True), "plain": _assist_sampling(rc, False)},
            "max_tokens": (lambda mt: int(min(32768, max(16, 32768 if mt == 16000 else mt))))(_num(rc.get("max_tokens"), 32768)),
            "sys": str(rc.get("sys") or "")[:8000],
            "ctx_refs": rc.get("ctx_refs") is not False,
            "ctx_neighbours": rc.get("ctx_neighbours") is True,
            "styles": list(dict.fromkeys(str(x)[:80] for x in rc.get("styles", []) if str(x).strip()))[:156]
                      if isinstance(rc.get("styles"), list) else [],
            "engine_defaults": rc.get("engine_defaults") is True,
            "show_reasoning": rc.get("show_reasoning") is not False,
            "stream_timeout": int(min(3600, max(30, _num(rc.get("stream_timeout"), 600)))),
            "unload_on_generate": rc.get("unload_on_generate") is not False,
            "unload_endpoint": str(rc.get("unload_endpoint") or "")[:500],
            "auto_unload": rc.get("auto_unload") is True,
            "auto_unload_delay": int(min(86400, max(0, _num(rc.get("auto_unload_delay"), 300)))),
            "backend": "comfy" if rc.get("backend") == "comfy" else "api",
            "comfy_encoder": str(rc.get("comfy_encoder") or "")[:200],
            "api_base": str(rc.get("api_base") or "http://127.0.0.1:1234/v1")[:300],
            "api_key": str(rc.get("api_key") or "")[:500],
            "api_model": str(rc.get("api_model") or "")[:200]}


def _assist_style_defs(rows):
    out, seen = [], set()
    for style in (rows if isinstance(rows, list) else []):
        if not isinstance(style, dict) or not str(style.get("name") or "").strip():
            continue
        sid = str(style.get("id") or "")[:80] or f"style{len(out) + 1}"
        while sid in seen:
            sid += "_2"
        seen.add(sid)
        instructions = style.get("instructions") if isinstance(style.get("instructions"), list) else str(style.get("instructions") or "").splitlines()
        out.append({"id": sid, "name": str(style["name"]).strip()[:100], "description": str(style.get("description") or "")[:500],
                    "instructions": [str(x).strip()[:2000] for x in instructions if str(x).strip()][:80],
                    "priority": int(min(100, max(0, _num(style.get("priority"), 50)))),
                    "enabled": style.get("enabled") is True,
                    "category": str(style.get("category") or "Custom")[:80],
                    "icon": str(style.get("icon") or "sparkles")[:30], "tone": str(style.get("tone") or "violet")[:30],
                    "custom": style.get("custom") is True})
        if len(out) >= 100:
            break
    return out


def normalize_assistant(a):
    a = a if isinstance(a, dict) else {}
    chats = []
    for c in (a.get("chats") if isinstance(a.get("chats"), list) else []):
        if not isinstance(c, dict):
            continue
        msgs = []
        for m in (c.get("msgs") if isinstance(c.get("msgs"), list) else []):
            if isinstance(m, dict) and m.get("role") in ("user", "assistant"):
                msg = {"role": m["role"], "text": str(m.get("text") or "")[:120000]}
                if m.get("reasoning"):
                    msg["reasoning"] = str(m["reasoning"])[:200000]
                if isinstance(m.get("stats"), dict):
                    stats = {"prompt": int(min(1000000000, max(0, _num(m["stats"].get("prompt"), 0)))),
                             "completion": int(min(1000000000, max(0, _num(m["stats"].get("completion"), 0)))),
                             "tps": _round(min(10000000, max(0, _num(m["stats"].get("tps"), 0))), 2),
                             "elapsed": _round(min(10000000, max(0, _num(m["stats"].get("elapsed"), 0))), 2),
                             "finish": str(m["stats"].get("finish") or "")[:30]}
                    msg["stats"] = stats
                msgs.append(msg)
        if msgs or str(c.get("id") or "") == str(a.get("active") or ""):
            chats.append({"id": str(c.get("id") or "")[:40] or "c1", "title": str(c.get("title") or "")[:120],
                          "created": max(0, int(_num(c.get("created"), 0))), "msgs": msgs[:MAX_ASSIST_MSGS]})
        if len(chats) >= MAX_ASSIST_CHATS:
            break
    seen, uniq = set(), []
    for c in chats:
        cid, n = c["id"], 2
        while cid in seen:
            cid = f"{c['id']}_{n}"
            n += 1
        seen.add(cid)
        c["id"] = cid
        uniq.append(c)
    active = str(a.get("active") or "")[:40]
    if active and active not in seen:
        active = ""
    presets = []
    for pr in (a.get("presets") if isinstance(a.get("presets"), list) else []):
        if not isinstance(pr, dict) or not str(pr.get("name") or "").strip():
            continue
        presets.append({"id": str(pr.get("id") or "")[:40] or f"p{len(presets) + 1}",
                        "name": str(pr.get("name") or "").strip()[:80],
                        "cfg": _assist_cfg(pr.get("cfg"))})
        if len(presets) >= MAX_ASSIST_PRESETS:
            break
    pseen, puniq = set(), []
    for pr in presets:
        pid, n = pr["id"], 2
        while pid in pseen:
            pid = f"{pr['id']}_{n}"
            n += 1
        pseen.add(pid)
        pr["id"] = pid
        puniq.append(pr)
    preset = str(a.get("preset") or "")[:40]
    if preset and preset not in pseen and preset not in ASSIST_BUILTIN_PRESETS:
        preset = ""
    deleted = list(dict.fromkeys(str(x)[:80] for x in a.get("style_deleted", []) if str(x).strip()))[:56] \
        if isinstance(a.get("style_deleted"), list) else []
    return {"chats": uniq, "active": active, "presets": puniq, "preset": preset,
            "style_defs": _assist_style_defs(a.get("style_defs")), "style_deleted": deleted,
            "cfg": _assist_cfg(a.get("cfg"))}


PRESET_DTYPES = ("default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2")
MAX_PRESET_LORAS = 16
MAX_PRESETS = 64


def _preset_id(x):
    return re.sub(r"[^A-Za-z0-9_-]", "", x if isinstance(x, str) else "")[:40]


def _r3(x):
    return math.floor(x * 1000 + 0.5) / 1000


def normalize_preset(p, pid=None):
    """Clean model preset; None when it is not one. base "unet" (diffusion_models + weight dtype) | "checkpoint";
    clip = text encoder (CLIPLoader type minimax); vae / audio_vae; loras = [{file, on, sm, sc}] in order."""
    if not isinstance(p, dict):
        return None
    pid = _preset_id(pid if pid is not None else p.get("id"))
    if not pid:
        return None
    sv = lambda k: str(p.get(k) or "")[:300] if isinstance(p.get(k), str) else ""
    loras = []
    for l in (p.get("loras") if isinstance(p.get("loras"), list) else [])[:MAX_PRESET_LORAS]:
        if not isinstance(l, dict) or not isinstance(l.get("file"), str) or not l["file"]:
            continue
        sm = _r3(max(-10.0, min(10.0, _num(l.get("sm"), 1.0))))
        sc = _r3(max(-10.0, min(10.0, _num(l.get("sc"), sm))))
        loras.append({"file": l["file"][:300], "on": l.get("on") is not False, "sm": sm, "sc": sc,
                      "trigger_words": str(l.get("trigger_words") or "")[:1000],
                      "auto_trigger": l.get("auto_trigger") is True})
    return {"id": pid, "name": (sv("name") or pid)[:80], "base": p.get("base") if p.get("base") in ("unet", "checkpoint") else "unet",
            "model": sv("model"), "dtype": p.get("dtype") if p.get("dtype") in PRESET_DTYPES else "default",
            "clip": sv("clip"), "vae": sv("vae"), "audio_vae": sv("audio_vae"), "loras": loras, "note": sv("note")[:500],
            # v6m «Модель для FLF»: the diffusion model this preset uses for frame clips (i2v / first+last / l2v)
            "flf_model": sv("flf_model"), "flf_dtype": p.get("flf_dtype") if p.get("flf_dtype") in PRESET_DTYPES else "default"}


def segment_preset(project, i):
    """Effective preset of segment i: its own (if that preset exists), else — for an image-to-video / first+last
    frame clip — the «frames» preset (settings.kf_preset, the fl2va model), else the project's; None = wired inputs."""
    pr = project.get("model_presets") or {}
    segs = project.get("segments") or []
    seg = segs[i] if 0 <= i < len(segs) else {}
    own = seg.get("model_preset") or ""
    st = project.get("settings") or {}
    flf = kf_mode(project, seg) != "t2v"
    if own in pr:
        return flf_view(pr[own]) if flf else pr[own]
    kp = st.get("kf_preset") or ""
    if kp in pr and flf:
        return flf_view(pr[kp])
    p = pr.get(st.get("model_preset") or "")
    return flf_view(p) if flf and p else p


FLF_AUTO = None   # () -> the first fl2va diffusion model found (set by h3s_models: core lists no files)


def is_fl2va(name):
    return "fl2va" in str(name or "").lower()


def flf_view(p):
    """v6m: the preset as a frame clip uses it — its «Модель для FLF» (dtype too; encoders / VAE / LoRAs shared), else its
    own model when that is fl2va, else the first fl2va model found; "flf_missing" when none (h3s_models stops clearly)."""
    if not p:
        return p
    if p.get("flf_model"):
        return dict(p, base="unet", model=p["flf_model"], dtype=p.get("flf_dtype") or "default")
    if is_fl2va(p.get("model")):
        return p
    auto = None
    try:
        auto = FLF_AUTO() if FLF_AUTO else None
    except Exception:
        auto = None
    if auto:
        return dict(p, base="unet", model=auto, dtype="default")
    return dict(p, flf_missing=True)


KF_MODES = ("t2v", "i2v", "flf")


def normalize_kf(v):
    """Segment generation mode + «Кадры»: None, or {mode, on, first, last} (asset ids; "" = empty slot).
    mode "ref" (references / characters, the default) or "flf" (frame slots; i2v / fl2va / l2va pick themselves);
    v6h projects stored only {on}: on -> "flf". "on" is kept as mode == "flf" (older readers, cache keys unchanged)."""
    if not isinstance(v, dict):
        return None
    mode = v.get("mode") if v.get("mode") in ("ref", "flf") else "flf" if v.get("on") else "ref"
    out = {"mode": mode, "on": mode == "flf", "first": str(v.get("first") or "")[:80], "last": str(v.get("last") or "")[:80]}
    return out if out["on"] or out["first"] or out["last"] else None


def kf_assets(project, seg):
    """(first, last) image assets of a clip's «Кадры» (None where empty / off / missing / not an image)."""
    kf = (seg or {}).get("kf") or {}
    on = kf.get("mode") == "flf" if kf.get("mode") in ("ref", "flf") else bool(kf.get("on"))   # v6i REF | FLF (v6h: on)
    if not on or seg.get("source"):   # footage / vid2vid clips keep their own path
        return None, None
    by_id = {a["id"]: a for a in project.get("assets") or []}
    pick = lambda k: (lambda a: a if a and a.get("category") in CATEGORY_ORDER else None)(by_id.get(kf.get(k) or ""))
    return pick("first"), pick("last")


def kf_fit(project):
    """v6m «Вписать кадр»: (fit, pad) of the FLF frames."""
    st = project.get("settings") or {}
    fit = st.get("kf_fit") if st.get("kf_fit") in KF_FITS else "crop"
    return fit, (st.get("kf_pad") if st.get("kf_pad") in KF_PADS else "blur") if fit == "pad" else ""


def kf_fit_key(project):
    """Tail of the «Кадры» key part: [] for "legacy" (old keys unchanged), else [["fit", fit(, pad)]]."""
    fit, pad = kf_fit(project)
    return [] if fit == "legacy" else [["fit", fit] + ([pad] if pad else [])]


def validate_ref_flf_exclusive(project):
    """Reject active FLF/REF mixtures without deleting the user's scene assets."""
    for index, seg in enumerate(project.get("segments") or []):
        if seg.get("source"):
            continue
        kf = seg.get("kf") or {}
        flf = kf.get("mode") == "flf" if kf.get("mode") in ("ref", "flf") else bool(kf.get("on"))
        if not flf:
            continue
        if seg.get("refs") or seg.get("cards"):
            name = seg.get("name") or f"#{index + 1}"
            raise ValueError(f"H3ZeroStudio: сцена {name}: REF и FLF нельзя совмещать. "
                             "Удалите референсы и персонажей сцены перед выбором FLF либо переключитесь в REF.")


def kf_mode(project, seg):
    """"t2v" (no frames: the reference path), "i2v" (first frame only) or "flf" (a last frame, with or without the first)."""
    f, l = kf_assets(project, seg)
    return "flf" if l else "i2v" if f else "t2v"


GEN_MODES = ("ref", "t2v", "i2v", "flf", "l2v", "v2v", "swap")


def gen_mode(project, seg):
    """How a clip is generated (timeline badge, recorded on the take as result["gen"]): None for footage used as is,
    "v2v" (vid2vid), "i2v" / "flf" / "l2v" («Кадры»: first / first+last / last only), "ref" (reference pictures,
    video / audio references or characters) or "t2v" (prompt only)."""
    if seg.get("source"):
        return "swap" if seg["source"].get("swap") else None if is_footage(seg) else "v2v"
    f, l = kf_assets(project, seg)
    if f or l:
        return "flf" if f and l else "l2v" if l else "i2v"
    if ordered_refs(project, seg) or video_refs(project, seg) or audio_refs(project, seg) or card_key(project, seg):
        return "ref"
    return "t2v"

def preset_fingerprint(p):
    """What of a preset decides a clip's result (no name / note / VAE); "" = no preset."""
    if not p:
        return ""
    return json.dumps([p["base"], p["model"], p["dtype"], p["clip"],
                       [[l["file"], l["sm"], l["sc"]] for l in p["loras"] if l["on"] and (l["sm"] or l["sc"])]],
                      separators=(",", ":"), ensure_ascii=False)


def asset_kf(a):
    """(file, subfolder) of an asset as its cache keys know it: where it was when its clips were made. A moved
    asset (into the project folder, a duplicated / imported project) keeps the old pair in "kf", so no clip
    goes stale because its file changed place (the content is checked separately, by signature)."""
    kf = a.get("kf")
    if isinstance(kf, (list, tuple)) and len(kf) == 2 and all(isinstance(x, str) for x in kf):
        return kf[0], kf[1]
    return a.get("file"), a.get("subfolder")


def _merge(defaults, value):
    out = copy.deepcopy(defaults)
    if isinstance(value, dict):
        for k, v in value.items():
            out[k] = copy.deepcopy(v)
    return out


def normalize_project(p):
    """Fill defaults, snap lengths. Never raises on garbage input (returns an empty project)."""
    if isinstance(p, str):
        try:
            p = json.loads(p) if p.strip() else {}
        except ValueError:
            p = {}
    if not isinstance(p, dict):
        p = {}
    out = {
        "version": SCHEMA_VERSION,
        "id": re.sub(r"[^A-Za-z0-9_-]", "", str(p.get("id") or "")) or "project",
        "name": str(p.get("name") or "H3 проект"),
        "settings": _merge(DEFAULT_SETTINGS, p.get("settings")),
        "assets": [],
        "segments": [],
        "audio": _merge(DEFAULT_AUDIO, p.get("audio")),
        "markers": [],
        "end": max(0, int(_num(p.get("end"), 0))),   # video end marker (pixel frames), 0 = end of the last clip
        # «Длина: Фикс» (default): the marker stays where it was set, editing clips may leave an empty gap before
        # it; «Авто»: the marker follows the end of the last clip (end stays 0)
        "end_mode": "auto" if p.get("end_mode") == "auto" else "fixed",
        "run": {"upto": -1, "only": -1, "kind": "", "region": ""},
        "regions": [],
        "stats": copy.deepcopy(p.get("stats")) if isinstance(p.get("stats"), dict) else None,
        "result": p.get("result") if isinstance(p.get("result"), dict) else None,
    }
    if out["end_mode"] == "auto":
        out["end"] = 0
    out["cards"] = normalize_card_snaps(p.get("cards"))
    out["assistant"] = normalize_assistant(p.get("assistant"))
    out["model_presets"] = {}
    if isinstance(p.get("model_presets"), dict):
        for k, v in list(p["model_presets"].items())[:MAX_PRESETS]:
            q = normalize_preset(v, k)
            if q:
                out["model_presets"][q["id"]] = q
    st = out["settings"]
    st["model_preset"] = _preset_id(st.get("model_preset"))
    st["kf_preset"] = _preset_id(st.get("kf_preset"))
    st["res_mode"] = st.get("res_mode") if st.get("res_mode") in ("mp", "custom", "ratio") else "mp"
    st["aspect"] = st.get("aspect") if st.get("aspect") in ASPECTS or st.get("aspect") == "image" else "16:9"
    st["ratio"] = str(st.get("ratio") or "")[:20]
    ir = parse_ratio(_num(st.get("image_ratio"), 0))
    st["image_ratio"] = round(ir, 5) if ir else 0.0
    st["kf_fit"] = st.get("kf_fit") if st.get("kf_fit") in KF_FITS else "crop"
    st["continuation_method"] = st.get("continuation_method") if st.get("continuation_method") in ("protected", "overlap", "h3studio") else "h3studio"
    if st["continuation_method"] in ("protected", "h3studio"):
        st["lock_overlap"] = True
    st["kf_pad"] = st.get("kf_pad") if st.get("kf_pad") in KF_PADS else "blur"
    st["quality"] = "draft" if st.get("quality") == "draft" else "final"
    st["final_mode"] = st.get("final_mode") if st.get("final_mode") in ("refine", "luna") else "full"
    st["piflow_steps"] = int(_num(st.get("piflow_steps"), 0)) if int(_num(st.get("piflow_steps"), 0)) in (2, 4) and st["final_mode"] == "full" else 0
    st["piflow_lora2"] = str(st.get("piflow_lora2") or "").strip()[:200]
    st["piflow_lora4"] = str(st.get("piflow_lora4") or "").strip()[:200]
    st["video_ramp_frames"] = max(0, min(24, int(_num(st.get("video_ramp_frames"), 0))))
    # one-off: the former single field became the binding of the step count it was picked for
    legacy_lora = str(st.get("piflow_lora") or "").strip()[:200]
    if legacy_lora:
        key = "piflow_lora4" if int(_num(st.get("piflow_steps"), 0)) == 4 else "piflow_lora2"
        if not st[key]:
            st[key] = legacy_lora
    st.pop("piflow_lora", None)
    st["lowhigh_low_steps"] = max(0, min(199, int(_num(st.get("lowhigh_low_steps"), 0))))
    st["lowhigh_scale"] = _round(max(0.25, min(1.0, _num(st.get("lowhigh_scale"), 0.60))), 3)
    st["lowhigh_denoise"] = _round(max(0.10, min(1.0, _num(st.get("lowhigh_denoise"), 0.65))), 3)
    st["high_sigma_schedule"] = "karras7" if st.get("high_sigma_schedule") == "karras7" else "default"
    ds = _num(st.get("draft_scale"), 0.5)
    st["draft_scale"] = min(DRAFT_SCALES, key=lambda x: abs(x - ds))
    st["draft_steps"] = max(0, min(200, int(_num(st.get("draft_steps"), 0))))
    st["refine_steps"] = max(0, min(200, int(_num(st.get("refine_steps"), 0))))
    st["refine_seed"] = max(-1, min(9007199254740991, int(_num(st.get("refine_seed"), -1))))
    st["refine_sigma"] = round(max(REFINE_SIGMA_RANGE[0], min(REFINE_SIGMA_RANGE[1], _num(st.get("refine_sigma"), 0.4))), 2)
    st["refine_schedule_mode"] = "basic" if st.get("refine_schedule_mode") == "basic" else "sigma"
    st["refine_denoise"] = _round(max(0.10, min(1.0, _num(st.get("refine_denoise"), 0.30))), 3)
    st["refine_identity_images"] = st.get("refine_identity_images") is True
    st["self_anchor_voice"] = st.get("self_anchor_voice") is True
    st["upscale_method"] = "learned" if st.get("upscale_method") not in UPSCALE_METHODS else st["upscale_method"]  # "rtx" (removed) -> learned
    raw_st = p.get("settings") if isinstance(p.get("settings"), dict) else {}
    old_rev = _num(raw_st.get("upscale_rev"), 0)   # as stored (the merged defaults already say 4)
    st["upscale_rev"] = UPSCALE_REV   # any older value ("vae", "latent" = nearest-exact, …) became "learned" above
    st["seg_upscale"] = normalize_upscale(st.get("seg_upscale")) or normalize_upscale({"method": "latent", "scale": 2.0})
    cs = _num(st.get("upscale_chunk_sec"), 5.0)
    st["upscale_chunk_sec"] = 0.0 if cs <= 0 else _round(min(UPSCALE_CHUNK_SEC_RANGE[1], max(UPSCALE_CHUNK_SEC_RANGE[0], cs)), 1)
    st["upscale_chunk_overlap"] = int(min(UPSCALE_CHUNK_OVERLAP_RANGE[1], max(UPSCALE_CHUNK_OVERLAP_RANGE[0], _num(st.get("upscale_chunk_overlap"), 1))))
    normalize_upscale_profiles(st)
    ug = st.get("upscale_gen") if isinstance(st.get("upscale_gen"), dict) else {}
    _raw = ug.get("loras") if isinstance(ug.get("loras"), list) else ([ug.get("lora")] if ug.get("lora") else [])
    _defst = _round(max(-10.0, min(10.0, _num(ug.get("lora_strength"), 1.0))), 2)

    def _lora(x):
        if isinstance(x, (int, float)) and not isinstance(x, bool):
            x = str(x)
        if isinstance(x, str):
            f = x.strip()[:300]
            return {"file": f, "on": True, "sm": _defst, "sc": _defst} if f else None
        if isinstance(x, dict):
            f = str(x.get("file") or "").strip()[:300]
            if not f:
                return None
            return {"file": f, "on": x.get("on") is not False,
                    "sm": _round(max(-10.0, min(10.0, _num(x.get("sm"), _defst))), 2),
                    "sc": _round(max(-10.0, min(10.0, _num(x.get("sc"), _defst))), 2)}
        return None
    st["upscale_gen"] = {"mode": "custom" if ug.get("mode") == "custom" else "project",
                         "model": str(ug.get("model") or "")[:300],
                         "loras": [y for y in map(_lora, _raw) if y][:8]}
    st["upscale_model"] = str(st.get("upscale_model") or "")[:300]
    from .h3s_accel import normalize_accel
    st["accel"] = normalize_accel(st.get("accel"))
    st["memsave"] = normalize_memsave(st.get("memsave"))
    if old_rev < 4:   # rev 4: tiles default σ 0.35 -> 0.60 (user-tested); a profile still at the old default follows,
        tp = st["upscale_profiles"]["tiles"]   # a value the user picked stays; clips keep their own σ (cache keys unchanged)
        if abs(tp["sigma"] - SEG_UPSCALE_SIGMA_OLD_TILES) < 1e-6:
            tp["sigma"] = SEG_UPSCALE_SIGMA["tiles"]
            st["seg_upscale"] = profile_upscale(st, st["seg_upscale"]["method"])
    for k in ("draft", "refine"):
        st[k + "_sampler"] = str(st.get(k + "_sampler") or "")[:64]
        st[k + "_scheduler"] = str(st.get(k + "_scheduler") or "")[:64]
        st[k + "_cfg"] = round(max(0.0, min(30.0, _num(st.get(k + "_cfg"), 0.0))), 2)
    for k in ("sigmas", "draft_sigmas", "refine_sigmas"):
        st[k] = str(st.get(k) or "")[:SIGMAS_TEXT_MAX]
    st["settings_scope"] = "global" if st.get("settings_scope") == "global" else "project"
    pr = p.get("run")
    if not isinstance(pr, dict):
        pr = {}
    out["run"]["upto"] = int(_num(pr.get("upto", -1), -1))
    out["run"]["only"] = int(_num(pr.get("only", -1), -1))
    rk = pr.get("kind")
    out["run"]["kind"] = rk if rk in RUN_KINDS else ""
    op = pr.get("operation")
    if op in ("generate", "colour", "assemble", "full"):
        out["run"]["operation"] = op
    if op == "full" and pr.get("export_full") is True:
        out["run"]["export_full"] = True  # explicit Save: never truncate via legacy resume-only
    export_colour = pr.get("export_colour")
    if op in ("colour", "assemble", "full") and isinstance(export_colour, bool):
        out["run"]["export_colour"] = export_colour  # transient Save option; not a project setting
    export_stream = pr.get("export_stream")
    if op in ("colour", "assemble", "full") and isinstance(export_stream, bool):
        out["run"]["export_stream"] = export_stream  # disk-backed assembly only at explicit Save
    export_encoder = pr.get("export_encoder")
    if op in ("colour", "assemble", "full") and export_encoder in ("cpu", "nvenc"):
        out["run"]["export_encoder"] = export_encoder  # transient video encoder choice; never changes AV caches
    export_concat = pr.get("export_concat")
    if op in ("colour", "assemble", "full") and isinstance(export_concat, bool):
        out["run"]["export_concat"] = export_concat  # independent, experimental stream-copy join choice
    export_pipe = pr.get("export_pipe")
    if op in ("colour", "assemble", "full") and isinstance(export_pipe, bool):
        out["run"]["export_pipe"] = export_pipe  # experimental scene-by-scene FFmpeg export
    rr = pr.get("region")
    out["run"]["region"] = str(rr) if isinstance(rr, str) else ""
    ct = pr.get("client_token")
    if isinstance(ct, str) and ct.strip():
        out["run"]["client_token"] = ct.strip()[:80]
    ra = pr.get("audio")
    if isinstance(ra, dict):   # «Улучшить звук»: audio-only refine pass over the cached segments
        out["run"]["audio"] = normalize_ar(ra)
    rf = pr.get("face")
    if isinstance(rf, dict) and _normalize_fr(rf):   # v6k «Рефайн лица»: a face pass over one finished clip
        out["run"]["face"] = _normalize_fr(rf)
    for i, r in enumerate(p.get("regions") or [] if isinstance(p.get("regions"), list) else []):
        if not isinstance(r, dict):
            continue
        rg = normalize_region(r, i)
        if rg is not None and len(out["regions"]) < MAX_REGIONS:
            out["regions"].append(rg)
    for i, m in enumerate(p.get("markers") or []):
        if not isinstance(m, dict):
            continue
        mk = _merge(DEFAULT_MARKER, {k: v for k, v in m.items() if k in DEFAULT_MARKER})
        mk["id"] = str(mk["id"] or f"m{i + 1}")
        mk["frame"] = max(0, int(_num(mk["frame"], 0)))
        mk["color"] = max(0, int(_num(mk["color"], 0)))
        mk["effect"] = mk["effect"] if mk["effect"] in MARKER_EFFECTS else "note"
        for k in ("label", "text", "asset"):
            mk[k] = str(mk[k] or "")
        out["markers"].append(mk)
    out["markers"].sort(key=lambda m: m["frame"])
    for a in p.get("assets") or []:
        if not isinstance(a, dict) or not a.get("id") or not a.get("file"):
            continue
        cat = a.get("category") if a.get("category") in ASSET_CATEGORIES else "other"
        asset = {"id": str(a["id"]), "name": str(a.get("name") or a["file"]), "file": str(a["file"]),
                 "subfolder": str(a.get("subfolder") or ""), "type": str(a.get("type") or "input"), "category": cat}
        if cat == "audio":
            asset["duration"] = max(0.0, _num(a.get("duration"), 0.0))
        # content signature (sha256 + the size:mtime first seen for it): the cache key of a copied/re-saved file stays
        kf = a.get("kf")
        if isinstance(kf, (list, tuple)) and len(kf) == 2 and all(isinstance(x, str) for x in kf):
            asset["kf"] = [kf[0][:300], kf[1][:300]]
        fs = a.get("fsig")
        if isinstance(fs, dict) and isinstance(fs.get("sha"), str) and isinstance(fs.get("sig"), str):
            asset["fsig"] = {"sha": fs["sha"][:64], "sig": fs["sig"][:64]}
        # asset editor: the original file and the ops of the processed derivative now in file/subfolder
        if isinstance(a.get("orig"), dict) and a["orig"].get("filename") and isinstance(a.get("edit"), dict):
            asset["orig"] = {"filename": str(a["orig"]["filename"]), "subfolder": str(a["orig"].get("subfolder") or ""),
                             "type": str(a["orig"].get("type") or "input")}
            asset["edit"] = copy.deepcopy(a["edit"])
        if cat == "video":
            asset["duration"] = max(0.0, _num(a.get("duration"), 0.0))
            asset["frames"] = max(0, int(_num(a.get("frames"), 0)))
            asset["width"] = max(0, int(_num(a.get("width"), 0)))
            asset["height"] = max(0, int(_num(a.get("height"), 0)))
            asset["has_audio"] = bool(a.get("has_audio"))
            asset["poster"] = a["poster"] if isinstance(a.get("poster"), dict) and a["poster"].get("filename") else None
            asset["strip"] = a["strip"] if isinstance(a.get("strip"), dict) and a["strip"].get("filename") else None
            try:
                asset["strip_n"] = max(0, int(float(a.get("strip_n") or 0))) if asset["strip"] else 0
            except (TypeError, ValueError):
                asset["strip_n"] = 0
            asset["frozen"] = str(a.get("frozen") or "")
        out["assets"].append(asset)
    out["audio"] = _normalize_audio(p, out["assets"])
    video_ids = {a["id"] for a in out["assets"] if a["category"] == "video"}
    out["control"] = normalize_control(p.get("control"), video_ids)
    for i, s in enumerate(p.get("segments") or []):
        if not isinstance(s, dict):
            continue
        seg = _merge(DEFAULT_SEGMENT, s)
        seg["id"] = str(seg["id"] or f"s{i + 1}")
        seg["frames"] = snap_frames(seg.get("frames") or 124)
        seg["link"] = "cut" if seg.get("link") == "cut" else "extend"
        try:   # empty timeline before the clip (Ctrl+drag apart): black + silence, the clip starts a new shot
            seg["gap"] = max(0, min(MAX_GAP, int(float(seg.get("gap") or 0))))
        except (TypeError, ValueError):
            seg["gap"] = 0
        try:
            seg["overlap_blocks"] = max(-2, min(MAX_OVERLAP_BLOCKS, int(float(seg.get("overlap_blocks", -1)))))
        except (TypeError, ValueError):
            seg["overlap_blocks"] = -1
        try:
            seg["color"] = max(0, int(float(seg.get("color") or 0)))
        except (TypeError, ValueError):
            seg["color"] = 0
        seg["refs"] = [str(r) for r in (seg.get("refs") or [])]
        seg["cards"] = normalize_card_refs(seg.get("cards"))
        seg["overrides"] = {k: v for k, v in (seg.get("overrides") or {}).items()
                            if k in OVERRIDE_KEYS and v is not None and v != ""}
        seg["takes"] = [t for t in (seg.get("takes") or []) if isinstance(t, dict) and t.get("key")][-MAX_TAKES:]
        if seg.get("active_take") is not None:
            seg["active_take"] = str(seg["active_take"])
        seg["freeze"] = _normalize_freeze(seg.get("freeze"))
        seg["pin"] = normalize_pin(seg.get("pin"))
        seg["source"] = _normalize_source(seg.get("source"), video_ids)
        seg["upscale"] = normalize_upscale(seg.get("upscale"))
        seg["approved"] = bool(seg.get("approved"))
        seg["model_preset"] = _preset_id(seg.get("model_preset"))
        seg["kf"] = normalize_kf(seg.get("kf"))
        seg["ar"] = normalize_ar(seg["ar"]) if isinstance(seg.get("ar"), dict) else None
        seg["fr"] = _normalize_fr(seg.get("fr"))   # v6k «Рефайн лица»: the active take is the face-refined copy
        if seg["freeze"]:
            seg["frames"] = seg["freeze"]["frames"]
        out["segments"].append(seg)
    # v6m «Вписать кадр»: a project from before keeps the old fit of its frame clips (keys unchanged)
    raw_st = p.get("settings") if isinstance(p.get("settings"), dict) else {}
    if "kf_fit" not in raw_st and any(kf_mode(out, sg) != "t2v" for sg in out["segments"]):
        out["settings"]["kf_fit"] = "legacy"
    # legacy upscale multipliers -> megapixel targets with the same canvas (cache keys unchanged: upscale_key_form)
    rw, rh = resolution(out["settings"])
    for m, pr in out["settings"]["upscale_profiles"].items():
        mu = migrate_upscale(profile_upscale(out["settings"], m), rw, rh)
        for k in ("mp", "scale"):
            pr.pop(k, None)
        pr.update({k: mu[k] for k in ("mp", "scale") if k in mu})
    out["settings"]["seg_upscale"] = profile_upscale(out["settings"], out["settings"]["seg_upscale"]["method"])
    for seg in out["segments"]:
        seg["upscale"] = migrate_upscale(seg["upscale"], rw, rh)
    return out


def normalize_upscale(u):
    if not isinstance(u, dict):
        return None
    # rev 5: RTX VSR removed — saved projects fall back to tiles at the recommended σ 0.60
    if u.get("method") == "rtx":
        u = {**u, "method": "tiles", "sigma": SEG_UPSCALE_SIGMA["tiles"]}
        u.pop("quality", None)
    if u.get("method") not in SEG_UPSCALE_METHODS:
        return None
    m = u["method"]
    sg = round(min(SEG_UPSCALE_SIGMA_RANGE[1], max(SEG_UPSCALE_SIGMA_RANGE[0], _num(u.get("sigma"), SEG_UPSCALE_SIGMA[m]))), 3)
    mp = _num(u.get("mp"), 0)
    if mp > 0:   # megapixel target of the upscaled frame
        out = {"method": m, "mp": _round(min(SEG_UPSCALE_MP_RANGE[1], max(SEG_UPSCALE_MP_RANGE[0], mp)), 4), "sigma": sg}
    else:        # legacy multiplier (migrated by normalize_project, where the canvas is known)
        sc = _num(u.get("scale"), 2.0)
        out = {"method": m, "scale": min(SEG_UPSCALE_SCALES, key=lambda x: abs(x - sc)), "sigma": sg}
    if m == "tiles":
        t = u.get("tile")
        if isinstance(t, (list, tuple)) and len(t) == 2 and _num(t[0], 0) > 0 and _num(t[1], 0) > 0:
            out["tile"] = [int(min(TILE_PX_RANGE[1], max(TILE_PX_RANGE[0], snap32(_num(x, 0))))) for x in t]
        ov = int(_num(u.get("tile_ov"), 0))
        if ov > 0:
            ov = min(TILE_OV_RANGE[1], max(TILE_OV_RANGE[0], ov))
            out["tile_ov"] = ov - ov % 2
    return out


def normalize_upscale_profile(m, p):
    """One method's profile: upscale fields + refine pass (steps 0 / sampler "" = «Этап 2») + temporal chunks."""
    p = p if isinstance(p, dict) else {}
    u = normalize_upscale({**{k: p[k] for k in UPSCALE_UP_FIELDS if k in p}, "method": m}) or normalize_upscale({"method": m, "scale": 2.0})
    out = {k: v for k, v in u.items() if k != "method"}
    out["steps"] = int(max(0, min(200, _num(p.get("steps"), 0))))
    out["sampler"] = str(p.get("sampler") or "")[:64]
    out["scheduler"] = str(p.get("scheduler") or "")[:64]
    out["sigmas"] = str(p.get("sigmas") or "")[:SIGMAS_TEXT_MAX]
    out["chunk"] = bool(p["chunk"]) if "chunk" in p else UPSCALE_CHUNK_DEFAULT[m]
    cs = _num(p.get("chunk_sec"), 5.0)
    out["chunk_sec"] = _round(min(UPSCALE_CHUNK_SEC_RANGE[1], max(UPSCALE_CHUNK_SEC_RANGE[0], cs if cs > 0 else 5.0)), 1)
    out["chunk_overlap"] = int(min(UPSCALE_CHUNK_OVERLAP_RANGE[1], max(UPSCALE_CHUNK_OVERLAP_RANGE[0], _num(p.get("chunk_overlap"), 1))))
    return out


def normalize_upscale_profiles(st):
    """settings.upscale_profiles = {method: profile}; the selected method's profile is mirrored into seg_upscale
    (the profiles are the source: seg_upscale only selects the method). Older settings had one flat set
    (seg_upscale + upscale_chunk_sec / _overlap): it becomes the profile of the selected method, the other
    methods get their defaults (same size, own σ, chunks on for latent, off for tiles)."""
    seg_upscale = st["seg_upscale"]
    raw = st.get("upscale_profiles")
    if not isinstance(raw, dict) or not any(isinstance(raw.get(m), dict) for m in SEG_UPSCALE_METHODS):
        cs, co = _num(st.get("upscale_chunk_sec"), 5.0), st.get("upscale_chunk_overlap", 1)
        size = {k: seg_upscale[k] for k in ("mp", "scale") if k in seg_upscale}
        raw = {}
        for m in SEG_UPSCALE_METHODS:
            base = {k: v for k, v in seg_upscale.items() if k != "method"} if m == seg_upscale["method"] else {**size, "sigma": SEG_UPSCALE_SIGMA[m]}
            on = cs > 0 if m == seg_upscale["method"] else UPSCALE_CHUNK_DEFAULT[m]
            raw[m] = {**base, "chunk": on, "chunk_sec": cs if cs > 0 else 5.0, "chunk_overlap": co}
    st["upscale_profiles"] = {m: normalize_upscale_profile(m, raw.get(m)) for m in SEG_UPSCALE_METHODS}
    st["seg_upscale"] = profile_upscale(st, seg_upscale["method"])


def upscale_profile(settings, method):
    """The profile of an upscale method (defaults when the settings have none)."""
    pr = (settings.get("upscale_profiles") or {}).get(method)
    return pr if isinstance(pr, dict) else normalize_upscale_profile(method, None)


def profile_upscale(settings, method):
    """The upscale a clip gets from the method's profile: {method, mp, sigma, [tile, tile_ov]}."""
    pr = upscale_profile(settings, method)
    return normalize_upscale({**{k: pr[k] for k in UPSCALE_UP_FIELDS if k in pr}, "method": method})


def upscale_gen(settings):
    """The refine's own model + LoRAs (settings.upscale_gen, «Настройки → Апскейл»): None = the project / clip
    presets; else {"model": file (checkpoints / diffusion_models), "loras": [{file, on, sm, sc}], ...}."""
    ug = ((settings or {}).get("upscale_gen") or {})
    if ug.get("mode") != "custom" or not ug.get("model"):
        return None
    return {"model": ug["model"], "loras": [dict(l) for l in (ug.get("loras") or []) if l.get("file")]}


def upscale_pass_params(project, index, method):
    """pass_params of a clip's upscale refine: «Этап 2» with the method profile's own steps / sampler / scheduler
    (the profile's own «custom SIGMAS» win over the refine stage's ones)."""
    p = pass_params(project, index, "refine")
    pr = upscale_profile(project["settings"], method)
    if pr.get("steps"):
        p["steps"] = int(pr["steps"])
    if pr.get("sampler"):
        p["sampler"] = pr["sampler"]
    if pr.get("scheduler"):
        p["scheduler"] = pr["scheduler"]
    if p["scheduler"] == SIGMAS_SCHEDULER:
        sg = parse_sigmas(pr.get("sigmas"))
        if sg:
            p["sigmas"], p["steps"] = sg, len(sg) - 1
    return p


def upscalable(seg):
    """The segment's upscale applies: set and not a take frozen after its upscale (freeze.up). Footage as is is
    upscaled too: its VAE-encoded frames (the clip's cached latent) go through the same latent/tiles mode + refine."""
    return bool(seg.get("upscale")) and not (seg.get("freeze") or {}).get("up")




def _round(x, d):
    """Half-up rounding (same as the editor's Math.round based rounding)."""
    return math.floor(float(x) * 10 ** d + 0.5) / 10 ** d


def upscale_canvas(w, h, up):
    """Target canvas of a segment upscale (snapped to 32). up: the upscale dict ({"mp"} megapixel target or a
    legacy {"scale"}) or a plain multiplier. Same aspect as the clip; a target below the clip size is a resize."""
    if isinstance(up, dict):
        if _num(up.get("mp"), 0) > 0:
            k = math.sqrt(float(up["mp"]) * 1e6 / (w * h))
            return snap32(w * k), snap32(h * k)
        up = _num(up.get("scale"), 2.0)
    return snap32(w * float(up)), snap32(h * float(up))


def mp_for_scale(w, h, scale):
    """Megapixel target that gives exactly the canvas of a legacy multiplier."""
    target = upscale_canvas(w, h, scale)
    for d in (2, 3, 4):
        mp = _round(w * h * scale * scale / 1e6, d)
        if upscale_canvas(w, h, {"mp": mp}) == target:
            return mp
    return _round(target[0] * target[1] / 1e6, 4)


def migrate_upscale(u, w, h):
    """Legacy {"scale": 1.5|2} -> {"mp": …} with the same canvas (key order kept: method, mp, sigma, …)."""
    if not u or "mp" in u or "scale" not in u:
        return u
    return {("mp" if k == "scale" else k): (mp_for_scale(w, h, v) if k == "scale" else v) for k, v in u.items()}


def upscale_key_form(up, w, h):
    """Cache-key form: an "mp" that reproduces an old ×1.5 / ×2 canvas hashes as that multiplier, so results made
    before the megapixel picker stay cached (and the editor does not mark them changed)."""
    if up and "mp" in up:
        c = upscale_canvas(w, h, up)
        for sc in SEG_UPSCALE_SCALES:
            if upscale_canvas(w, h, sc) == c:
                return {("scale" if k == "mp" else k): (sc if k == "mp" else v) for k, v in up.items()}
    return up


def chunk_starts(k, m, o):
    """Starts (in blocks) of temporal windows of m blocks over k blocks with >= o blocks overlap
    (plan_windows of ComfyUI-H3-WindowedRefine); [0] = one piece."""
    m = max(1, min(int(m), k))
    o = max(0, min(int(o), m - 1))
    last = k - m
    if last <= 0:
        return [0]
    n = max(2, min(math.ceil(last / (m - o)) + 1, last + 1))
    return sorted({int(_round(i * last / (n - 1), 0)) for i in range(n)})


def upscale_chunking(settings, frames, method=None):
    """Temporal chunks of a clip's upscale with `method` (its profile's chunks; no method = the legacy flat
    settings): (count, chunk frames 17k+5 or 0 = off, overlap blocks)."""
    if method:
        pr = upscale_profile(settings, method)
        sec, ov = (_num(pr.get("chunk_sec"), 5.0) if pr.get("chunk") else 0), pr.get("chunk_overlap", 1)
    else:
        sec, ov = _num(settings.get("upscale_chunk_sec"), 0), settings.get("upscale_chunk_overlap", 1)
    if sec <= 0:
        return 1, 0, 0
    cf = snap_frames(sec * FPS)
    m = (latent_t(cf) - 2) // 5
    o = max(1, min(int(_num(ov, 1)), m - 1))
    k = (latent_t(frames) - 2) // 5
    # approximate length: a clip up to 2 blocks (≈1.4 s) longer than a chunk stays one piece
    n = len(chunk_starts(k, m, o)) if frames > cf + 34 else 1
    return n, cf, o


_HEX = re.compile(r"^[0-9a-fA-F]{8,64}$")


def normalize_pin(v):
    """seg["pin"] (mirror of h3s_core.js normalizePin): None when invalid."""
    if not isinstance(v, dict) or not all(isinstance(v.get(k), str) for k in ("sig", "at", "key")) or not _HEX.match(v["key"]):
        return None
    out = {"take": str(v.get("take") or ""), "key": v["key"], "kind": v.get("kind") if v.get("kind") in RUN_KINDS else "",
           "sig": v["sig"], "at": v["at"], "bat": v.get("bat") if isinstance(v.get("bat"), str) else ""}
    if isinstance(v.get("ukey"), str) and _HEX.match(v["ukey"]):
        out["ukey"] = v["ukey"]
    return out


def pin_key(seg, kind, pin_ok=None):
    """The pinned take's key of a clip for pass `kind` (None: not pinned / its latent is gone)."""
    pin = seg.get("pin")
    if not pin or (pin.get("kind") or kind) != kind:
        return None
    return pin["key"] if pin_ok is None or pin_ok(pin["key"]) else None


def _normalize_freeze(f):
    """Frozen segment: its cached latent (by backend key) and the editor signature at freeze time."""
    if not isinstance(f, dict) or not f.get("key"):
        return None
    out = dict(f)
    out["key"] = str(f["key"])
    out["sig"] = str(f.get("sig") or "")
    out["frames"] = snap_frames(f.get("frames") or 124)
    return out


def _normalize_source(src, video_ids):
    if not isinstance(src, dict) or str(src.get("asset") or "") not in video_ids:
        return None
    out = {"asset": str(src["asset"]), "in": max(0, int(_num(src.get("in"), 0))),
           "denoise": min(1.0, max(0.0, _num(src.get("denoise"), 0.0)))}
    if src.get("swap"):
        out.update(swap=True, keep_audio=bool(src.get("keep_audio", True)),
                   swap_lora=str(src.get("swap_lora") or "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors")[:256],
                   swap_lora_strength=round(max(0.5, min(1.5, _num(src.get("swap_lora_strength"), 1.0))), 2))
        mask = src.get("swap_mask")
        if isinstance(mask, dict):
            box = mask.get("box")
            if isinstance(box, (list, tuple)) and len(box) == 4:
                box = [round(max(0.0, min(1.0, _num(v, 0.0))), 4) for v in box]
                if not (box[2] > 0 and box[3] > 0 and box[0] + box[2] <= 1.001 and box[1] + box[3] <= 1.001):
                    box = None
            else:
                box = None
            point = mask.get("point")
            if (not isinstance(point, (list, tuple)) or len(point) != 2) and box:
                point = [box[0] + box[2] / 2, box[1] + box[3] / 2]
            if isinstance(point, (list, tuple)) and len(point) == 2:
                point = [round(max(0.0, min(1.0, _num(v, 0.0))), 5) for v in point]
                out["swap_mask"] = {"point": point,
                                    "at": max(0, int(_num(mask.get("at"), 0))), "model": "sam3.1"}
                if box:
                    out["swap_mask"]["box"] = box
                if mask.get("guard") is True:
                    out["swap_mask"]["guard"] = True
                # Manual identity anchors after hard cuts, shared by all chunks.
                shots = []
                for item in (mask.get("shots") or [])[:200]:
                    if not isinstance(item, dict) or not isinstance(item.get("point"), (list, tuple)):
                        continue
                    if len(item["point"]) != 2:
                        continue
                    frame = max(1, int(_num(item.get("frame"), 0)))
                    anchor = {"frame": frame,
                              "point": [round(max(0., min(1., _num(v, 0.))), 5) for v in item["point"]]}
                    bb = item.get("box")
                    if isinstance(bb, (list, tuple)) and len(bb) == 4:
                        bb = [round(max(0., min(1., _num(v, 0.))), 5) for v in bb]
                        if bb[2] > 0 and bb[3] > 0 and bb[0] + bb[2] <= 1.001 and bb[1] + bb[3] <= 1.001:
                            anchor["box"] = bb
                    shots.append(anchor)
                if shots:
                    out["swap_mask"]["shots"] = shots
    return out


def is_footage(seg):
    """Footage used as is (no sampling)."""
    return bool(seg.get("source")) and not seg["source"].get("swap") and not seg["source"]["denoise"]


def video_refs(project, seg):
    """Video references of a segment (<Video k> order = chip order)."""
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "video"}
    out, seen = [], set()
    for r in seg.get("refs", []):
        if r in by_id and r not in seen:
            seen.add(r)
            out.append(by_id[r])
    return out


def _normalize_audio(p, assets):
    pa = p.get("audio") if isinstance(p.get("audio"), dict) else {}
    au = {"clips": [], "video_volume": min(2.0, max(0.0, _num(pa.get("video_volume"), 1.0))), "input_ref": pa.get("input_ref")}
    if not (isinstance(au["input_ref"], dict) and au["input_ref"].get("filename")):
        au["input_ref"] = None
    src = pa.get("clips")
    if not isinstance(src, list):
        # projects before the audio track redesign: one source (input or an uploaded file) and a mode
        f = pa.get("file")
        asset_id = AUDIO_INPUT_ID
        if pa.get("source") == "file" and isinstance(f, dict) and f.get("filename"):
            asset_id = "au_" + re.sub(r"[^A-Za-z0-9]", "_", str(f["filename"]))[:48]
            if not any(a["id"] == asset_id for a in assets):
                assets.append({"id": asset_id, "name": str(f.get("name") or f["filename"]), "file": str(f["filename"]),
                               "subfolder": str(f.get("subfolder") or ""), "type": str(f.get("type") or "input"),
                               "category": "audio", "duration": max(0.0, _num(pa.get("duration"), 0.0))})
        src = []
        if pa.get("mode") == "locked":   # "reference" is now a per-segment reference, "none" has no track clip
            src = [{"id": "a1", "asset": asset_id, "start": pa.get("start"), "length": pa.get("length"),
                    "in": pa.get("in") if "in" in pa else pa.get("offset")}]
    audio_ids = {a["id"] for a in assets if a["category"] == "audio"} | {AUDIO_INPUT_ID}
    for i, c in enumerate(src):
        if not isinstance(c, dict):
            continue
        cl = _merge(DEFAULT_AUDIO_CLIP, {k: v for k, v in c.items() if k in DEFAULT_AUDIO_CLIP})
        cl["id"] = str(cl["id"] or f"a{i + 1}")
        cl["asset"] = str(cl["asset"] or AUDIO_INPUT_ID)
        if cl["asset"] not in audio_ids:
            continue
        ln = _num(cl["lane"], 0)
        cl["lane"] = MUSIC_LANE if ln >= MUSIC_LANE else 1 if ln >= 1 else 0
        for k in ("start", "in", "length", "fade_in", "fade_out"):
            cl[k] = max(0.0, _num(cl[k], 0.0))
        cl["volume"] = min(2.0, max(0.0, _num(cl["volume"], 1.0)))
        au["clips"].append(cl)
    au["clips"].sort(key=lambda c: (c["start"], c["lane"]))
    return au


def audio_refs(project, seg):
    """Audio references of a segment (<Audio j> order = chip order): audio assets and/or the node input."""
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "audio"}
    out, seen = [], set()
    for r in seg.get("refs", []):
        if r in seen:
            continue
        if r in by_id:
            out.append(by_id[r])
        elif r == AUDIO_INPUT_ID:
            out.append({"id": AUDIO_INPUT_ID, "name": "Вход audio ноды", "category": "audio"})
        else:
            continue
        seen.add(r)
    return out


def seg_param(project, seg, index, key):
    s = project["settings"]
    ov = seg.get("overrides") or {}
    if key == "seed" and s.get("_global_seed") is not None:
        return int(s["_global_seed"])
    if key in ov:
        return ov[key]
    if key == "seed":
        # One seed for the whole film: the noise field is shared by all segments (h3s_gen.position_noise),
        # so a continued clip continues its predecessor's noise instead of restarting it. Segments differ
        # by their absolute frames, not by a per-segment seed.
        return int(s.get("seed", 0))
    return s.get(key)


def noise_seed_for(project, index, kind=None):
    """The seed of the noise field a pass samples from (h3s_gen.position_noise).

    The field belongs to the film, not to the clip: every segment draws the noise of its own absolute
    frames from ONE field, so the seam between two continued clips keeps its level instead of stepping.
    A segment with its own seed (a new take, Seed Hunter) starts a new field — and the segments that
    continue it inherit that field, so the chain stays continuous. An independent final-pass seed
    (settings.refine_seed) is its own field as well.
    """
    s = project["settings"]
    g = s.get("_global_seed")
    if g is not None and int(g) >= 0:
        return int(g)
    seg = project["segments"][index]
    ov = seg.get("overrides") or {}
    if kind == "refine":
        rs = ov.get("refine_seed")
        rs = rs if rs is not None else s.get("refine_seed", -1)
        if rs is not None and int(rs) >= 0:
            return int(rs)
    items = plan(project)
    i = index
    while True:
        own = (project["segments"][i].get("overrides") or {}).get("seed")
        if own is not None and int(own) >= 0:
            return int(own)          # its own seed: a new field (a new take / Seed Hunter)
        if i == 0 or items[i]["link"] != "extend":
            break
        i -= 1                        # the chain continues into the previous segment
    return int(s.get("seed", 0))


def effective_params(project, index):
    seg = project["segments"][index]
    keys = ("seed", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio")
    p = {k: seg_param(project, seg, index, k) for k in keys}
    p["seed"] = int(p["seed"])
    p["steps"] = int(p["steps"])
    p["cfg"] = float(p["cfg"])
    p["denoise"] = float(p["denoise"])
    p["shift_video"] = float(p["shift_video"])
    p["shift_audio"] = float(p["shift_audio"])
    cu = project["settings"].get("_custom") or {}   # wired SIGMAS (set per run by h3s_gen): the step count is theirs
    if cu.get("steps"):
        p["steps"] = int(cu["steps"])
    return p


def pass_params(project, index, kind=None):
    """effective_params of one sampling pass: the draft may use fewer steps, the refine pass its own steps and
    partial denoise."""
    s = project["settings"]
    kind = kind or run_kind(s)
    p = effective_params(project, index)
    p["steps"] = pass_steps(s, p["steps"], kind)
    if kind == "full" and s.get("piflow_steps") in (2, 4):
        n = int(s["piflow_steps"])
        p.update(steps=n, cfg=1.0, denoise=1.0, sampler="euler", scheduler="simple",
                 piflow=[n, 0.93 if n == 2 else 0.96, 0.6])
    cu = s.get("_custom") or {}   # wired SAMPLER / SIGMAS: they win over the settings and are part of every cache key
    if cu:
        if cu.get("steps") and kind in ("full", "draft"):   # the refine pass starts from its own sigma: its schedule stays
            p["steps"] = int(cu["steps"])
        p["custom"] = cu.get("sig")
    if kind in ("draft", "refine"):   # stage parameters (empty = the main ones)
        if s.get(kind + "_sampler"):
            p["sampler"] = s[kind + "_sampler"]
        if s.get(kind + "_scheduler"):
            p["scheduler"] = s[kind + "_scheduler"]
        if float(s.get(kind + "_cfg") or 0) > 0:
            p["cfg"] = float(s[kind + "_cfg"])
    if kind == "refine":
        # Second-pass noise can be independent of the chosen draft without changing
        # the draft cache key. A per-clip seed wins over the project-wide seed.
        override_seed = (project["segments"][index].get("overrides") or {}).get("refine_seed")
        stage_seed = override_seed if override_seed is not None else s.get("refine_seed", -1)
        if stage_seed is not None and int(stage_seed) >= 0:
            p["seed"] = int(stage_seed)
        if s.get("_pass2_external"):
            p["pass2_external"] = s["_pass2_external"]
            if s["_pass2_external"].get("sigmas"):
                p["steps"] = len(s["_pass2_external"]["sigmas"]) - 1
        p["denoise"] = 1.0   # the refine pass gets explicit sigmas (legacy absolute σ or Comfy BasicScheduler fraction)
        p["sigma0"] = float(s.get("refine_sigma") or 0.4)
        p["schedule_mode"] = s.get("refine_schedule_mode", "sigma")
        p["schedule_denoise"] = float(s.get("refine_denoise", 0.30))
    if p["scheduler"] == SIGMAS_SCHEDULER:   # «custom SIGMAS»: the exact list replaces the curve, steps = len − 1
        seg = project["segments"][index]
        ov = (seg.get("overrides") or {})
        src = ov.get("sigmas") if ov.get("scheduler") == SIGMAS_SCHEDULER else \
            s.get(kind + "_sigmas") if kind in ("draft", "refine") and s.get(kind + "_scheduler") == SIGMAS_SCHEDULER else \
            s.get("sigmas") if s.get("scheduler") == SIGMAS_SCHEDULER else None
        sg = parse_sigmas(src)
        if sg:
            p["sigmas"], p["steps"] = sg, len(sg) - 1
    return p


def seg_steps(project, index):
    """Sampling steps of a segment in the project's run kind (footage used as is: none). A final from the draft
    counts the draft pass too (cached drafts make the run shorter than this)."""
    if is_footage(project["segments"][index]):
        return 0
    s = project["settings"]
    kind = run_kind(s)
    n = effective_params(project, index)["steps"]
    if kind == "full" and s.get("piflow_steps") in (2, 4):
        return int(s["piflow_steps"])
    if kind == "refine":
        return pass_steps(s, n, "draft") + pass_steps(s, n, "refine")
    return pass_steps(s, n, kind)


def ordered_refs(project, seg):
    """Assets of a segment in <Picture N> order: characters, locations, other; chip order inside a category."""
    by_id = {a["id"]: a for a in project["assets"]}
    refs = [by_id[r] for r in seg.get("refs", []) if r in by_id and by_id[r]["category"] in CATEGORY_ORDER]
    seen, uniq = set(), []
    for a in refs:
        if a["id"] not in seen:
            seen.add(a["id"])
            uniq.append(a)
    return sorted(uniq, key=lambda a: CATEGORY_ORDER.index(a["category"]))


def _normalize_fr(fr):
    """v6k «Рефайн лица» parameters (run.face and seg["fr"]; mirror of h3s_core.js normalizeFr). None = invalid
    (no picked face). face = the face to follow: a frame index and its box as fractions (x, y, w, h) of the frame."""
    if not isinstance(fr, dict):
        return None
    face = fr.get("face") if isinstance(fr.get("face"), dict) else {}
    box = face.get("box")
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    box = [round(max(0.0, min(1.0, _num(x, 0.0))), 4) for x in box]
    if box[2] <= 0 or box[3] <= 0:
        return None
    return {"face": {"frame": int(max(0, _num(face.get("frame"), 0))), "box": box},
            "steps": int(max(2, min(4, round(_num(fr.get("steps"), 3))))),
            "denoise": round(max(0.05, min(0.2, _num(fr.get("denoise"), 0.1))), 3),
            "feather": int(max(2, min(48, round(_num(fr.get("feather"), 6))))),
            "crop": round(max(1.5, min(4.0, _num(fr.get("crop"), 2.5))), 2),
            "colour": round(max(0.0, min(1.0, _num(fr.get("colour"), 1.0))), 2),
            "auto": fr.get("auto") is not False}


normalize_fr = _normalize_fr


def normalize_ar(ra):
    """«Улучшить звук» parameters (run.audio, and v6h: seg["ar"] — the active take is the audio-refined copy, so
    every later run (stitch, upscale, other clips) keeps using the enhanced sound instead of the base take)."""
    return {"steps": int(max(1, min(50, _num(ra.get("steps"), 6)))),
            "denoise": round(max(0.05, min(1.0, _num(ra.get("denoise"), 0.45))), 3),
            "video_denoise": round(max(0.0, min(1.0, _num(ra.get("video_denoise"), 0.0))), 3)}


def uses_continuity(project, index):
    if index == 0:
        return False
    seg = project["segments"][index]
    # an explicit first frame starts the clip from that picture: it replaces the continuation (a last frame alone
    # keeps it — the clip continues the previous one and arrives at its last frame)
    return seg["link"] == "extend" and not is_footage(seg) and not seg.get("gap") and not kf_assets(project, seg)[0]


def lora_trigger_words(project, index):
    """Only enabled LoRAs of the effective scene preset contribute words."""
    preset = segment_preset(project, index)
    seen, result = set(), []
    for l in (preset or {}).get("loras", []):
        if not l.get("on") or not l.get("auto_trigger") or not (l.get("sm") or l.get("sc")):
            continue
        for word in str(l.get("trigger_words") or "").replace("\n", ",").split(","):
            word = word.strip()
            if word and word.casefold() not in seen:
                seen.add(word.casefold())
                result.append(word)
    return result


def add_visual_triggers(prompt, words):
    """Append to visual description only; never insert inside audio/dialogue fields."""
    if not words:
        return prompt
    addition = ", ".join(words)
    try:
        data = json.loads(prompt)
    except (ValueError, TypeError):
        data = None
    if isinstance(data, dict) and isinstance(data.get("integrated_multimodal_description"), str):
        key = "integrated_multimodal_description"
        data[key] = data[key].rstrip() + "\nVisual LoRA trigger words: " + addition
        return json.dumps(data, ensure_ascii=False)
    return prompt.rstrip() + "\nVisual LoRA trigger words: " + addition


def compose_prompt(project, index, video=True, identity_image_ids=()):
    """Global + segment prompt; Stage 2 can remap photo-stack character cards from Video to Picture.
    video=False: ordinary video references and their tags stay excluded in refine passes."""
    s = project["settings"]
    seg = project["segments"][index]
    parts = [t.strip() for t in (s.get("prompt") or "", seg.get("prompt") or "") if t and t.strip()]
    items = plan(project)
    it = items[index]
    kfm = kf_mode(project, seg) != "t2v"   # «Кадры»: no reference pictures / videos to name
    pics = {} if kfm else {a["id"]: n + 1 for n, a in enumerate(ordered_refs(project, seg))}
    boost = []
    for m in segment_markers(project, index, items):
        if m["effect"] == "prompt" and m["text"].strip():
            parts.append(MARKER_PROMPT.replace("{t}", fmt_sec10(m["frame"] - it["start"])).replace("{text}", m["text"].strip()))
        elif m["effect"] == "boost":
            ids = [m["asset"]] if m["asset"] else [a["id"] for a in ordered_refs(project, seg) if a["category"] == "character"]
            for aid in ids:
                if aid in pics and pics[aid] not in boost:
                    boost.append(pics[aid])
    if boost:
        parts.append(BOOST_PHRASE.replace("{pics}", ", ".join(f"<Picture {n}>" for n in sorted(boost))))
    text = "\n".join(parts)
    n = continuity_picture(project, index)
    if n:
        phrase = (s.get("continuity_phrase") or "").strip() or "<Picture {n}>"
        text = (text + "\n" if text else "") + phrase.replace("{n}", str(n))
    nv = min(MAX_REF_VIDEOS, len(video_refs(project, seg))) if video and not kfm else 0
    if nv and "<Video" not in text:
        text = (text + "\n" if text else "") + VIDEO_REF_PHRASE.replace("{tags}", ", ".join(f"<Video {k + 1}>" for k in range(nv)))
    na = 0 if kfm else min(MAX_REF_AUDIOS, len(audio_refs(project, seg)))
    if na and "<Audio" not in text:
        text = (text + "\n" if text else "") + AUDIO_REF_PHRASE.replace("{tags}", ", ".join(f"<Audio {j + 1}>" for j in range(na)))
    # Some prompts explicitly cite a photo-stack card as <Video N> (because its multi-photo
    # RefMod uses a video-shaped latent in the first pass). If Stage 2 reuses its first photo,
    # rewrite ONLY those exact card references to their new <Picture N> indices. Other video
    # refs are still stripped below, and identity references remain bound to the right person.
    if identity_image_ids and not kfm:
        originals = card_labels(project, seg, index, video=True)
        photos = {r["id"]: r["image"] for r in card_labels(
            project, seg, index, video=False, identity_image_ids=identity_image_ids)}
        remap = {}
        for r in originals:
            if r["id"] in identity_image_ids and r["video"] and photos.get(r["id"]):
                new_numbers = photos[r["id"]]
                for i, old_number in enumerate(r["video"]):
                    remap[old_number] = new_numbers[min(i, len(new_numbers) - 1)]
        if remap:
            text = re.sub(r"<Video\s*(\d+)>",
                          lambda m: f"<Picture {remap[int(m.group(1))]}>" if int(m.group(1)) in remap
                          else m.group(0), text)
    cl = [] if kfm else card_phrases(card_labels(project, seg, index, video=video,
                                                 identity_image_ids=identity_image_ids), text)
    if cl:
        text = (text + "\n" if text else "") + "\n".join(cl)
    # A swap on footage: name who changes and what is kept (the source clip drives pose/camera/lighting).
    src_ = seg.get("source") or {}
    if src_.get("swap") and not kfm and "body_swap" not in text.lower() and "character_swap" not in text.lower():
        labels = card_labels(project, seg, index, video=video, identity_image_ids=identity_image_ids)
        pics_used = sorted({n for r in labels for n in r["image"][:1]})
        if pics_used:
            details = next((str((r["snap"].get("appearance") or "")).strip() for r in labels
                            if str((r["snap"].get("appearance") or "")).strip()), "") or "the character"
            text = (text + "\n" if text else "") + SWAP_BRIEF.replace(
                "{pics}", ", ".join(f"<Picture {n}>" for n in pics_used)).replace("{details}", details)
    if not video:
        text = re.sub(r"[ \t]*<Video\s*\d+>", "", text)
        text = re.sub(r"[ \t]+\n", "\n", text).strip()
    return add_visual_triggers(text, lora_trigger_words(project, index))

def fmt_sec10(frames):
    """Frames -> seconds with one decimal, integer-exact (same result in JS)."""
    f = max(0, int(frames))
    t10 = (f * 20 + FPS) // (2 * FPS)
    return f"{t10 // 10}.{t10 % 10}"


def marker_segment(items, frame):
    """Index of the segment shown at a timeline frame (overlap zones belong to the later segment), or -1."""
    for it in items:
        if frame < it["end"]:
            return it["index"]
    return -1


def segment_markers(project, index, items=None):
    items = items if items is not None else plan(project)
    return [m for m in project.get("markers", []) if marker_segment(items, m["frame"]) == index]


def audio_windows(project):
    """[(asset, start, in, length)] in seconds for every audio track clip; length None = until source end."""
    out = []
    for c in lock_clips(project):
        ln = float(c.get("length") or 0.0)
        out.append((c["asset"], float(c.get("start") or 0.0), float(c.get("in") or 0.0), ln if ln > 0 else None))
    return out


def lock_clips(project):
    """Clips on the lock lanes (main composition, locked in the audio latent) + the sound of ControlNet clips with
    «Звук в H3» (v6l, see control_audio_clips)."""
    own = [c for c in project["audio"].get("clips") or [] if int(c.get("lane", 0)) < MUSIC_LANE]
    return own + control_audio_clips(project, own)


def control_audio_clips(project, own=None):
    """v6l: ControlNet clips with «Звук в H3» as virtual lock clips (lane 0) — their source audio, respecting the trim
    (in / length) and the timeline position, goes the same lock / seam / crossfade path as an audio-track clip.
    Only while the ControlNet track is on. Where a lock clip of an audio track overlaps, the audio track wins: the
    CN sound is cut out there (an open-ended lock clip covers everything after its start)."""
    ct = project.get("control") or {}
    if not ct.get("on"):
        return []
    if own is None:
        own = [c for c in project["audio"].get("clips") or [] if int(c.get("lane", 0)) < MUSIC_LANE]
    busy = []
    for c in own:
        st, ln = float(c.get("start") or 0.0), float(c.get("length") or 0.0)
        busy.append((st, st + ln if ln > 0 else float("inf")))
    out = []
    for c in ct.get("clips") or []:
        if not c.get("audio"):
            continue
        st, t_in, ln = float(c.get("start") or 0.0), float(c.get("in") or 0.0), float(c.get("length") or 0.0)
        pieces = [(st, st + ln if ln > 0 else float("inf"))]
        for a, b in busy:
            nxt = []
            for p0, p1 in pieces:
                if b <= p0 or a >= p1:
                    nxt.append((p0, p1))
                    continue
                if a > p0:
                    nxt.append((p0, a))
                if b < p1:
                    nxt.append((b, p1))
            pieces = nxt
        for k, (p0, p1) in enumerate(pieces):
            if p1 - p0 < 1e-3:
                continue
            out.append({"id": f"cn:{c['id']}:{k}", "asset": c["asset"], "lane": 0, "start": round(p0, 4),
                        "in": round(t_in + (p0 - st), 4), "length": 0.0 if p1 == float("inf") else round(p1 - p0, 4),
                        "volume": 1.0, "fade_in": 0.0, "fade_out": 0.0, "cn": c["id"]})
    return out


def music_clips(project):
    """Clips on the music lane: mixed over the video's sound at export/playback only."""
    return [c for c in project["audio"].get("clips") or [] if int(c.get("lane", 0)) >= MUSIC_LANE]


def clip_gain(c):
    """(volume, fade_in, fade_out) of a clip, None when neutral (keeps old cache keys)."""
    g = (float(c.get("volume", 1.0)), float(c.get("fade_in", 0.0)), float(c.get("fade_out", 0.0)))
    return None if g == (1.0, 0.0, 0.0) else [round(x, 4) for x in g]


def segment_track(project, it):
    """Track clips overlapping a segment, relative to its start (part of the cache key: moving a clip elsewhere
    on the timeline does not invalidate this segment)."""
    t0, t1 = it["start"] / FPS, it["end"] / FPS
    out = []
    for c, w in zip(lock_clips(project), audio_windows(project)):
        start, ln = w[1], w[3]
        if start < t1 and (ln is None or start + ln > t0):
            out.append(track_key_entry(w, c, t0, t1))
    return out


def _r4(x):
    return round(float(x) + 0.0, 4)


def track_key_entry(w, c, t0, t1):
    """v6l hotfix: key form of one lock clip under [t0, t1) — only what the segment hears (mirror of h3s_core.js
    trackKeyEntry). Inside the window: the old form (old keys stay); crossing an edge: cut to the window, so extending
    or trimming the clip outside the segment keeps the key. Fades only while they reach into the window."""
    asset, st, tin, ln = w
    end = None if ln is None else st + ln
    g = clip_gain(c)
    if st >= t0 - 1e-9 and (end is None or end <= t1 + 1e-9):
        e = [asset, round(st - t0, 4), round(tin, 4), None if ln is None else round(ln, 4)]
        return e + [g] if g else e
    s0 = max(st, t0)
    s1 = None if end is None else min(end, t1)
    eln = round(t1 - s0, 4) if s1 is None or end > t1 + 1e-9 else round(s1 - s0, 4)
    e = [asset, round(s0 - t0, 4), round(tin + (s0 - st), 4), eln, "w"]
    if not g:
        return e
    vol, fi, fo = g
    ge = [vol, [round(st - t0, 4), fi] if fi > 0 and st + fi > t0 else 0,
          [None if end is None else round(end - t0, 4), fo] if fo > 0 and (end is None or end - fo < t1) else 0]
    return e if ge[0] == 1 and not ge[1] and not ge[2] else e + [ge]


def ctl_key_window(rel, cin, ln, dur):
    """v6l hotfix: a control clip (rel, in, length) as the segment (0..dur) sees it — unchanged inside, else cut to the
    window (same frames: control_frame_index). Mirror of h3s_core.js ctlKeyWindow."""
    rel, cin, ln = float(rel), float(cin or 0.0), float(ln)
    if rel >= -1e-9 and rel + ln <= dur + 1e-9:
        return [rel, cin, ln]
    s0, s1 = max(rel, 0.0), min(rel + ln, dur)
    return [round(s0, 4), round(cin + (s0 - rel), 4), round(s1 - s0, 4)]


def content_end(items):
    return items[-1]["end"] if items else 0


def video_end(project, items=None):
    """Frame where the video ends: the end marker if set, else the end of the last clip."""
    items = items if items is not None else plan(project)
    e = int(project.get("end") or 0)
    return e if e > 0 else content_end(items)


def limited_project(project):
    """Project as generated with the video end marker: segments whose visible part starts at/after the end are
    dropped, the segment crossing the end is shortened to the grid length covering it (the stitch is cut exactly
    at the end). Segments before it are untouched, so their cache keys stay the same."""
    e = int(project.get("end") or 0)
    items = plan(project)
    if e <= 0 or e >= content_end(items):
        return project
    out = copy.deepcopy(project)
    keep = []
    for it in items:
        i, ov = it["index"], it["overlap"] if it["index"] else 0
        if it["start"] + ov >= e:
            break
        seg = out["segments"][i]
        if it["end"] > e and not seg.get("freeze"):   # a frozen clip keeps its length (the output is cut at the end)
            seg["frames"] = min(seg["frames"], snap_frames(e - it["start"], "up"))
        keep.append(seg)
    out["segments"] = keep
    return out


def audio_lock_overlap(project):
    """Is the overlap audio latent locked to the previous segment's tail?"""
    return bool(project["settings"].get("audio_seam_lock", True))


def level_lock_frames(project):
    """Blend window of the level lock at continuation joins (0 = off)."""
    s = project["settings"]
    if not s.get("level_lock", True):
        return 0
    return int(min(48, max(2, _num(s.get("level_lock_frames"), 12))))


def audio_seam_params(project):
    """Stitch parameters of the final audio at extend seams (seams covered by a track clip are skipped:
    the locked track is used as is)."""
    s = project["settings"]
    lo, hi = AUDIO_XFADE_RANGE
    xf = min(hi, max(lo, _num(s.get("audio_xfade_sec"), 0.4))) if s.get("audio_xfade", True) else 0.0
    return {"xfade": xf, "match": bool(s.get("audio_match", True)), "declick": bool(s.get("audio_declick", True))}


def run_items(project, items=None):
    """Items processed by a run: all, or 0..upto ("regenerate up to this segment")."""
    items = items if items is not None else plan(project)
    u = int((project.get("run") or {}).get("upto", -1))
    return items if u < 0 or u >= len(items) - 1 else items[:u + 1]


def normalize_card_refs(v):
    out, seen = [], set()
    for e in v if isinstance(v, list) else []:
        if isinstance(e, str):
            e = {"id": e}
        if not isinstance(e, dict) or not str(e.get("id") or "") or str(e["id"]) in seen:
            continue
        try:
            w = round(max(0.0, min(CARD_W_MAX, float(e.get("w", 1.0)))), 2)
        except (TypeError, ValueError):
            w = 1.0
        seen.add(str(e["id"]))
        out.append({"id": str(e["id"])[:200], "w": w, "on": e.get("on", True) is not False,
                    "look": e.get("look", True) is not False, "voice": e.get("voice", True) is not False})
    return out[:MAX_CARDS]


def normalize_card_snaps(v):
    """project["cards"]: {card id: library snapshot (name, sig, kinds, tokens, subject fields)} of the cards in use."""
    out = {}
    for k, c in (v.items() if isinstance(v, dict) else []):
        if not isinstance(c, dict):
            continue
        q = {x: c.get(x) for x in CARD_SNAP_KEYS if c.get(x) not in (None, "")}
        q["concept"] = q.get("concept") if q.get("concept") in CARD_CONCEPTS else "generic"
        q["vkind"] = q.get("vkind") if q.get("vkind") in ("image", "video") else None
        q["audio"] = bool(q.get("audio"))
        out[str(k)[:200]] = q
    return out


def card_snap(card):
    """Library card (h3s_chars.scan) -> the project snapshot."""
    return normalize_card_snaps({"x": {"name": card.get("name"), "sig": card.get("sig"), "concept": card.get("concept"),
                                       "vkind": (card.get("visual") or {}).get("kind"), "audio": bool(card.get("audio")),
                                       "tokens": ((card.get("visual") or {}).get("tokens") or 0) + ((card.get("audio") or {}).get("tokens") or 0),
                                       **{k: card.get(k) for k in ("subject_name", "appearance", "retained_attributes", "voice_description")}}})["x"]


def card_copies(w):
    """Weight -> (copies, strength): >= 1 rounds to whole copies, < 1 one weaker copy (mirror: h3s_chars.copies_strength)."""
    w = float(w)
    if w <= 0:
        return 0, 0.0
    if w < 1.0:
        return 1, round(w, 3)
    return max(1, min(8, int(round(w)))), 1.0


def card_labels(project, holder, index=None, video=True, region=False, identity_image_ids=()):
    """The <Picture N> / <Video N> / <Audio N> labels of the applied cards of a clip (index) or a region, numbered
    after the plain references (and the continuity picture): [{id, snap, image: [n..], video: [...], audio: [...]}]."""
    snaps = project.get("cards") or {}
    if region:
        n_img, n_vid, n_aud = len(region_refs(project, holder)), 0, 0
    else:
        n_img = len(ordered_refs(project, holder)) + (1 if index is not None and continuity_picture(project, index) else 0)
        n_vid = min(MAX_REF_VIDEOS, len(video_refs(project, holder))) if video else 0
        n_aud = min(MAX_REF_AUDIOS, len(audio_refs(project, holder)))
    out = []
    for e in holder.get("cards") or []:
        sn = snaps.get(e["id"])
        if not sn or not e.get("on", True):
            continue
        copies, _st = card_copies(e.get("w", 1.0))
        if not copies:
            continue
        r = {"id": e["id"], "snap": sn, "image": [], "video": [], "audio": []}
        vk = "image" if e["id"] in identity_image_ids else sn.get("vkind")
        if vk and e.get("look", True) and (video or vk == "image"):
            if vk == "image":
                r["image"] = list(range(n_img + 1, n_img + copies + 1)); n_img += copies
            else:
                r["video"] = list(range(n_vid + 1, n_vid + copies + 1)); n_vid += copies
        if sn.get("audio") and e.get("voice", True) and not region:
            r["audio"] = list(range(n_aud + 1, n_aud + copies + 1)); n_aud += copies
        if r["image"] or r["video"] or r["audio"]:
            out.append(r)
    return out


def card_phrases(labels, text):
    """A line for every applied card none of whose labels the prompt cites (the drafted prompt cites them all)."""
    lines = []
    for r in labels:
        sn = r["snap"]
        tags = [f"<Picture {n}>" for n in r["image"][:1]] + [f"<Video {n}>" for n in r["video"][:1]]
        aud = [f"<Audio {n}>" for n in r["audio"][:1]]
        name = (sn.get("subject_name") or "").strip()
        if tags and not any(t in text for t in [f"<Picture {n}>" for n in r["image"]] + [f"<Video {n}>" for n in r["video"]]):
            who = name or {"identity": "the person"}.get(sn.get("concept"), "the subject")
            lines.append(CARD_LOOK_PHRASE.get(sn.get("concept"), CARD_LOOK_PHRASE["generic"]).replace("{label}", tags[0]).replace("{who}", who))
        if aud and not any(f"<Audio {n}>" in text for n in r["audio"]):
            whose = f"{name}'s" if name else ("the person's" if tags and sn.get("concept") == "identity" else "the")
            lines.append(CARD_VOICE_PHRASE.replace("{label}", aud[0]).replace("{whose}", whose).replace("the the", "the"))
    return lines


def card_key(project, holder, video=True):
    """What the applied cards add to a cache key ([] when none: older keys stay as they were)."""
    snaps = project.get("cards") or {}
    out = []
    for e in holder.get("cards") or []:
        sn = snaps.get(e["id"])
        if not sn or not e.get("on", True) or not card_copies(e.get("w", 1.0))[0]:
            continue
        out.append([*card_copies(e["w"]), sn.get("sig", ""), bool(e.get("look", True)), bool(e.get("voice", True)), bool(video)])
    return out


def continuity_picture(project, index):
    """Picture number of the previous segment's last frame, or 0 (frames mode: no reference pictures at all)."""
    if not uses_continuity(project, index) or project["settings"].get("continuation_method") in ("protected", "h3studio") or not project["settings"].get("continuity_ref", True):
        return 0
    if kf_mode(project, project["segments"][index]) != "t2v":
        return 0
    return len(ordered_refs(project, project["segments"][index])) + 1


def plan(project):
    """Timeline layout. Each item: start/end pixel frame on the stitched timeline, overlap frames shared
    with the previous segment, latent sizes."""
    items, cursor = [], 0
    for i, seg in enumerate(project["segments"]):
        f = seg["frames"]
        ov = 0
        if uses_continuity(project, i):
            prev = project["segments"][i - 1]["frames"]
            o = wanted_overlap(project, i)
            # overlap must leave at least one new block in both segments: shrink to the largest that fits
            while o > 0 and not (overlap_frames(o) < f and overlap_frames(o) < prev):
                o -= 1
            ov = overlap_frames(o) if o > 0 else 0
        gap = int(seg.get("gap") or 0)
        start = cursor - ov + gap
        items.append({"index": i, "id": seg["id"], "frames": f, "start": start, "end": start + f,
                      "overlap": ov, "overlap_blocks": (ov - 5) // 17 if ov else 0, "gap": gap,
                      "latent_t": latent_t(f), "audio_t": audio_len(f), "link": ("cut" if gap else seg["link"]) if i else "start"})
        cursor = start + f
    return items


def swap_source_overruns(project, items=None):
    """Swap clips that demand motion frames beyond a finite source video.

    Non-Swap footage keeps its legacy last-frame hold behavior. An unknown
    source length is ignored until the asset has been probed in the editor.
    """
    items = plan(project) if items is None else items
    videos = {a.get("id"): a for a in project.get("assets", [])}
    issues = []
    end_marker = int(project.get("end") or 0)
    for item in items:
        i = item["index"]
        src = project["segments"][i].get("source") or {}
        if not src.get("swap"):
            continue
        total = int((videos.get(src.get("asset")) or {}).get("frames") or 0)
        if total <= 0:
            continue
        start, need = max(0, int(src.get("in") or 0)), int(item["frames"])
        # A 17k+5 clip may extend a few frames beyond the fixed video end.
        # Only frames that survive final trimming can freeze the result.
        visible = min(need, max(0, end_marker - int(item["start"]))) if end_marker else need
        if start + visible > total:
            issues.append({"index": i, "start": start, "need": need, "visible": visible,
                           "total": total, "remaining": max(0, total - start),
                           "missing": start + visible - total})
    return issues


def estimate(project):
    """Summary + warnings shown before a run (of the project limited by the video end marker)."""
    full_n = len(project["segments"])
    project = limited_project(project)
    items = plan(project)
    w, h = work_resolution(project["settings"])
    total = items[-1]["end"] if items else 0
    if int(project.get("end") or 0) > 0:
        total = min(total, int(project["end"]))
    warnings = []
    if len(items) < full_n:
        warnings.append(f"{full_n - len(items)} отр. за маркером конца ролика — не генерируются")
    gap = int(project.get("end") or 0) - content_end(items)
    if items and gap > 0:
        warnings.append(f"пусто {fmt_sec10(gap)} с между последним отрезком и маркером конца — ролик будет короче: "
                        f"заполните пустоту отрезком («Продлить») или растяните последний")
    for it in items:
        seg = project["segments"][it["index"]]
        name = seg.get("name") or f"#{it['index'] + 1}"
        if it["frames"] < TRAINED_MIN_FRAMES or it["frames"] > TRAINED_MAX_FRAMES:
            warnings.append(f"{name}: {it['frames']} кадров ({it['frames'] / FPS:.1f} с) — вне обучающего диапазона H3 "
                            f"{TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES} кадров")
        km = kf_mode(project, seg)
        if km != "t2v":
            if ordered_refs(project, seg) or seg.get("cards") or video_refs(project, seg):
                warnings.append(f"{name}: режим кадров — референсы и персонажи отрезка не используются")
            if not (project.get("model_presets") or {}).get(project["settings"].get("kf_preset") or "") and not seg.get("model_preset"):
                warnings.append(f"{name}: модель для кадров не выбрана — используется модель проекта (нужна fl2va)")
        n_refs = 0 if km != "t2v" else len(ordered_refs(project, seg)) + (1 if continuity_picture(project, it["index"]) else 0)
        if n_refs > MAX_REF_IMAGES:
            warnings.append(f"{name}: {n_refs} референсов, максимум {MAX_REF_IMAGES}"
                            + (" (вместе с последним кадром прошлого отрезка)" if continuity_picture(project, it["index"]) else ""))
        na = len(audio_refs(project, seg))
        if na > MAX_REF_AUDIOS:
            warnings.append(f"{name}: {na} аудио-референса, максимум {MAX_REF_AUDIOS}")
        nv = len(video_refs(project, seg))
        if nv > MAX_REF_VIDEOS:
            warnings.append(f"{name}: {nv} видео-референса, максимум {MAX_REF_VIDEOS}")
        if is_footage(seg):
            continue
        if it["link"] == "extend" and it["index"] > 0 and it["overlap"] == 0 and wanted_overlap(project, it["index"]) > 0 \
                and uses_continuity(project, it["index"]):
            warnings.append(f"{name}: перекрытие не помещается в отрезок — продление только по последнему кадру")
        if not (project["settings"].get("prompt") or "").strip() and not (seg.get("prompt") or "").strip():
            warnings.append(f"{name}: пустой промпт")
        ids = {a["id"] for a in ordered_refs(project, seg)}
        for m in segment_markers(project, it["index"], items):
            if m["effect"] == "boost" and m["asset"] and m["asset"] not in ids:
                warnings.append(f"{name}: маркер «{m['label'] or m['id']}» усиливает персонажа, которого нет в референсах отрезка")
    for m in project.get("markers", []):
        if m["effect"] != "note" and marker_segment(items, m["frame"]) < 0:
            warnings.append(f"маркер «{m['label'] or m['id']}» за концом ролика — не действует")
    if w * h > 1344 * 768 * 1.05:
        warnings.append(f"{w}×{h} больше официальных 1344×768 — дольше и больше VRAM")
    steps = sum(seg_steps(project, it["index"]) for it in items)
    ups = [it["index"] for it in items if upscalable(project["segments"][it["index"]])]
    fr = {it["index"]: it["frames"] for it in items}
    um = lambda i: project["segments"][i]["upscale"]["method"]
    steps += sum(upscale_pass_params(project, i, um(i))["steps"] * upscale_chunking(project["settings"], fr[i], um(i))[0] for i in ups)
    if ups:
        uw, uh = max((upscale_canvas(w, h, project["segments"][i]["upscale"]) for i in ups), key=lambda c: c[0] * c[1])
        nch = max(upscale_chunking(project["settings"], fr[i], um(i))[0] for i in ups)
        warnings.append(f"апскейл отрезков: {len(ups)} → до {uw}×{uh}" + (f" · до {nch} фрагм. по времени" if nch > 1 else ""))
    return {"segments": len(items), "frames": total, "seconds": round(total / FPS, 3), "width": w, "height": h,
            "steps_total": steps, "warnings": warnings, "kind": run_kind(project["settings"])}


# ---------------------------------------------------------------- cache keys
def _h(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- v6k ControlNet (MiniMax H3 Fun ControlNet Union 2.0)
CONTROL_MODES = ("pose", "depth", "canny", "gray", "ready")
DEFAULT_CONTROL_PARAMS = {"canny_lo": 0.4, "canny_hi": 0.8, "depth_model": "small", "pose_hands": True, "pose_face": True}


def normalize_control_params(v):
    v = v if isinstance(v, dict) else {}
    d = DEFAULT_CONTROL_PARAMS
    lo = min(0.99, max(0.01, _num(v.get("canny_lo"), d["canny_lo"])))
    hi = min(0.99, max(lo, _num(v.get("canny_hi"), d["canny_hi"])))
    return {"canny_lo": round(lo, 3), "canny_hi": round(hi, 3),
            "depth_model": "base" if v.get("depth_model") == "base" else "small",
            "pose_hands": bool(v.get("pose_hands", True)), "pose_face": bool(v.get("pose_face", True))}


def control_params_key(mode, params):
    """Only the parameters of the mode itself (changing the Canny thresholds keeps depth clips cached)."""
    if mode == "canny":
        return [params["canny_lo"], params["canny_hi"]]
    if mode == "depth":
        return [params["depth_model"]]
    if mode == "pose":
        return [params["pose_hands"], params["pose_face"]]
    return []


def normalize_control(v, video_ids=None):
    """project["control"]: the ControlNet track — {row, on, mode, strength 0..2, start/end 0..1 (sampling range),
    params, clips: [{id, asset, start s (timeline), in s (into the file), length s (0 = to the file end)}]}."""
    v = v if isinstance(v, dict) else {}
    st = min(1.0, max(0.0, _num(v.get("start"), 0.0)))
    out = {"row": bool(v.get("row")), "on": bool(v.get("on", True)),
           "mode": v.get("mode") if v.get("mode") in CONTROL_MODES else "depth",
           "strength": round(min(2.0, max(0.0, _num(v.get("strength"), 1.0))), 3),
           "start": round(st, 3), "end": round(min(1.0, max(st, _num(v.get("end"), 1.0))), 3),
           "params": normalize_control_params(v.get("params")), "clips": []}
    for i, c in enumerate(v.get("clips") or []):
        if not isinstance(c, dict) or not c.get("asset"):
            continue
        if video_ids is not None and str(c["asset"]) not in video_ids:
            continue
        out["clips"].append({"id": str(c.get("id") or f"cc{i + 1}")[:40], "asset": str(c["asset"])[:80],
                             "start": round(max(0.0, _num(c.get("start"), 0.0)), 4), "in": round(max(0.0, _num(c.get("in"), 0.0)), 4),
                             "length": round(max(0.0, _num(c.get("length"), 0.0)), 4)})
        if c.get("audio"):   # v6l «Звук в H3»: the clip's own sound goes into the H3 audio input (as a lock clip)
            out["clips"][-1]["audio"] = True
    if out["clips"]:
        out["row"] = True
    return out


def control_clip_span(project, c):
    """(start, end) seconds of a control clip on the timeline (length 0 = to the end of its file)."""
    ln = float(c.get("length") or 0.0)
    if ln <= 0:
        a = next((x for x in project.get("assets") or [] if x["id"] == c["asset"]), {})
        dur = float(a.get("duration") or 0.0) or float(a.get("frames") or 0) / FPS
        ln = max(1.0 / FPS, dur - float(c.get("in") or 0.0))
    return float(c["start"]), float(c["start"]) + ln


def control_window(project, it):
    """The control clip guiding a segment (the one overlapping it most), relative to the segment start, or None
    (control off / no clip under it / strength 0)."""
    ct = project.get("control") or {}
    if not ct.get("on") or not ct.get("clips") or float(ct.get("strength") or 0) <= 0:
        return None
    t0, t1 = it["start"] / FPS, it["end"] / FPS
    best, bo = None, 0.0
    for c in ct["clips"]:
        a, b = control_clip_span(project, c)
        ov = min(b, t1) - max(a, t0)
        if ov > bo + 1e-6:
            best, bo = (c, a, b), ov
    if not best:
        return None
    c, a, b = best
    cw = {"mode": ct["mode"], "strength": ct["strength"], "start": ct["start"], "end": ct["end"], "params": ct["params"],
          "asset": c["asset"], "clip": c["id"], "rel": round(a - t0, 4), "in": c["in"], "length": round(b - a, 4)}
    # v6l: a clip cut in pieces (split / trimmed copies of the same file) under one segment — every piece of that file
    # under the segment guides its own time range (only then "parts" exists, so older cache keys stay as they were)
    parts = []
    for x in ct["clips"]:
        if x["asset"] != c["asset"]:
            continue
        xa, xb = control_clip_span(project, x)
        if min(xb, t1) - max(xa, t0) > 1e-6:
            parts.append([round(xa - t0, 4), float(x.get("in") or 0.0), round(xb - xa, 4)])
    if len(parts) > 1:
        cw["parts"] = sorted(parts)
    return cw


def control_frame_index(cw, k):
    """Frame of the 24 fps control video (from the start of its file) for frame k of the segment: time-aligned,
    before the clip → its first frame, after it → its last frame held. With "parts" (pieces of one file): the piece
    under that moment; in a gap → the last frame of the piece before it (the first piece's first frame before all)."""
    parts = cw.get("parts")
    if not parts:
        rel = min(max(k / FPS - cw["rel"], 0.0), max(0.0, cw["length"] - 1.0 / FPS))
        return int(round((cw["in"] + rel) * FPS))
    t = k / FPS
    cur = parts[0]
    for p in parts:   # sorted by rel: the last piece starting at or before t
        if p[0] <= t + 1e-9:
            cur = p
    rel = min(max(t - cur[0], 0.0), max(0.0, cur[2] - 1.0 / FPS))
    return int(round((cur[1] + rel) * FPS))


def segment_keys(project, ref_sigs=None, env_sig="", kind=None, up_env="", parts=None, pin_ok=None):
    """Chained cache key per segment: changing a segment invalidates it and every extended segment after it.
    ref_sigs: {asset_id: file signature} (images, audio assets and "input" for the node's audio).
    kind: pass kind (default: the project's run kind). "full" keys are the one-pass keys of older versions; a
    draft key differs by its size/steps; a "refine" key is the draft key + refine settings + previous final."""
    ref_sigs = ref_sigs or {}
    project = limited_project(project)
    kind = kind or run_kind(project["settings"])
    if kind == "refine":
        dparts = [] if parts is not None else None
        return _refine_keys(project, segment_keys(project, ref_sigs, env_sig, "draft", parts=dparts, pin_ok=pin_ok),
                            segment_keys(project, ref_sigs, env_sig, "full", pin_ok=pin_ok), up_env, parts, dparts, pin_ok)
    items = plan(project)
    w, h = work_resolution(project["settings"], kind)
    s = project["settings"]
    keys, prev = [], ""
    for it in items:
        i = it["index"]
        seg = project["segments"][i]
        env_i = env_sig[i] if isinstance(env_sig, (list, tuple)) else env_sig   # per-clip model presets
        data = {
            "v": KEY_VERSION, "env": env_i, "wh": [w, h], "frames": it["frames"], "ov": it["overlap"],
            # the noise field is keyed by the absolute frame: the same clip at another place on the
            # timeline samples other noise, so its place belongs to the key
            "at": it["start"],
            # the shape of the swap mask is part of the result: it changes the pasted pixels
            **({"swapcfg": [s.get("swap_expand"), s.get("swap_feather"), s.get("swap_fill_holes"),
                            s.get("swap_temporal_expand")]} if (seg.get("source") or {}).get("swap") else {}),
            "prompt": compose_prompt(project, i), "neg": s.get("negative") or "",
            "refs": [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in ordered_refs(project, seg)],
            "params": pass_params(project, i, kind), **({"piflow_env": s.get("_piflow_env")} if s.get("piflow_steps") else {}), "luna_two_resolution": "high_denoise_065_v1" if s.get("final_mode") == "luna" and kind == "full" else False, "luna_upscale": s.get("_luna_upscale_env") if s.get("final_mode") == "luna" else None, "pass2": s.get("_pass2_external") if s.get("final_mode") == "luna" and kind == "full" else None, "lock": bool(s.get("lock_overlap", True)),
            "cref": continuity_picture(project, i), "ref_size": s.get("ref_size"),
            **({"handover": "protected_v1" if s.get("continuation_method") == "protected" else "h3studio_lab_tone_bridge_v3"} if s.get("continuation_method") in ("protected", "h3studio") and it["link"] == "extend" and i > 0 and it["overlap"] else {}),
            **({"vramp": int(s.get("video_ramp_frames") or 0)} if it["link"] == "extend" and i > 0 and it["overlap"] and int(s.get("video_ramp_frames") or 0) else {}),
            "audio": [[c + [ref_sigs.get(c[0], "")] for c in segment_track(project, it)],
                      [[a["id"], ref_sigs.get(a["id"], "")] for a in audio_refs(project, seg)][:MAX_REF_AUDIOS]]
            if segment_track(project, it) or audio_refs(project, seg) else None,
            "prev": prev if it["link"] == "extend" and i > 0 else "",
        }
        # The first-clip voice is an extra Audio conditioning row. Isolate its
        # cache from old renders; off keeps byte-for-byte identical keys.
        if (kind == "full" and s.get("self_anchor_voice") and i > 0
                and it["link"] == "extend" and kf_mode(project, seg) == "t2v"):
            data["self_voice"] = "first_voice_ref_v1"
        # Experimental sigma profile must NEVER hit an ordinary project's
        # cached take. Omit the field for the default path to preserve old keys.
        if s.get("final_mode") == "luna" and kind == "full" and (s.get("high_sigma_schedule") == "karras7" or s.get("_ab_high_sigmas") == "karras7"):
            data["high_sigma_ab"] = "karras7"
        if s.get("final_mode") == "luna" and kind == "full":
            low_n, low_scale, high_denoise = lowhigh_params(s, data["params"]["steps"])
            total_n = max(2, int(data["params"]["steps"]))
            auto_n = max(1, min(total_n - 1, round(total_n * 2 / 3)))
            if low_n != auto_n or low_scale != 0.60 or high_denoise != 0.65:
                data["lowhigh"] = [low_n, low_scale, high_denoise]
        ck = card_key(project, seg, video=(kind != "refine"))
        if ck:   # «Персонажи»: only when used, so the keys of clips without cards are unchanged
            data["cards"] = ck
        km = kf_mode(project, seg)
        if km != "t2v":   # «Кадры»: mode + the frame files (only then, so other clips keep their keys)
            fa, la = kf_assets(project, seg)
            data["kf"] = [km] + [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] if a else None for a in (fa, la)] + kf_fit_key(project)
            data["refs"], data["cards"] = [], None   # the fl2va presentation has no reference pictures / cards
        if it["link"] == "extend" and i > 0 and it["overlap"]:
            data["alock"] = [audio_lock_overlap(project), 4 if audio_lock_overlap(project) else 3,   # 4: hard mask boundary (no hand-off ramp)
                             round(min(float(s.get("audio_context_sec", 0) or 0), AUDIO_CONTEXT_MAX), 2)]
        elif data["audio"] and data["audio"][0]:
            data["alock"] = [False, 3]
        src = seg.get("source")
        if src:
            a = next((x for x in project["assets"] if x["id"] == src["asset"]), {})
            sd = [a.get("id"), *(asset_kf(a) if a else (None, None)), ref_sigs.get(src["asset"], ""), src["in"], src["denoise"]]
            if is_footage(seg):   # used as is: only the file range, size and VAE matter
                data = {"v": KEY_VERSION, "env": env_i, "wh": [w, h], "frames": it["frames"], "src": sd}
            else:
                data["src"] = sd
                if src.get("swap"):
                    data["swap"] = ["guide_latent_v1", bool(src.get("keep_audio", True)), src.get("swap_lora"), src.get("swap_lora_strength", 1.0)]
                    if src.get("swap_mask"):
                        data["swap"].append(["person_mask_v1", src["swap_mask"]])
        cw = control_window(project, it) if not is_footage(seg) else None
        if cw:   # v6k ControlNet: only when a control clip lies under the segment (other keys unchanged)
            ca = next((x for x in project["assets"] if x["id"] == cw["asset"]), {})
            dur = (it["end"] - it["start"]) / FPS
            rel, cin, cln = ctl_key_window(cw["rel"], cw["in"], cw["length"], dur)
            data["ctl"] = [cw["mode"], cw["strength"], cw["start"], cw["end"], control_params_key(cw["mode"], cw["params"]),
                           cw["asset"], *(asset_kf(ca) if ca else (None, None)), ref_sigs.get(cw["asset"], ""), rel, cin, cln]
            if cw.get("parts"):
                data["ctl"].append([ctl_key_window(p_[0], p_[1], p_[2], dur) for p_ in cw["parts"]])
        vr = video_refs(project, seg)
        if vr and not is_footage(seg):
            data["vrefs"] = [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in vr][:MAX_REF_VIDEOS]
        k = seg["freeze"]["key"] if seg.get("freeze") else (pin_key(seg, kind, pin_ok) or _h(data)[:16])
        keys.append(k)
        if parts is not None:   # what went into the key (cache miss reasons, take recipes)
            parts.append(data)
        prev = k
    return keys


def upscale_keys(project, base_keys, kind=None, up_env=None, pin_ok=None):
    """Keys of the segment upscales: None where a segment has no upscale (or is frozen / footage as is).
    key = base key + upscale params + the previous segment's upscale key when this one continues it on the same
    canvas (its overlap is locked to the previous upscaled tail)."""
    project = limited_project(project)
    kind = kind or run_kind(project["settings"])
    w, h = work_resolution(project["settings"], kind)
    out, prev = [], None
    for it, bk in zip(plan(project), base_keys):
        seg = project["segments"][it["index"]]
        up = seg.get("upscale")
        if not upscalable(seg):
            out.append(None)
            prev = None
            continue
        cont = it["link"] == "extend" and it["index"] > 0 and it["overlap"]
        wh = list(upscale_canvas(w, h, up))
        chain = prev[0] if prev and cont and prev[1] == wh else ""
        nch, cf, co = upscale_chunking(project["settings"], it["frames"], up["method"])
        upp, pr = upscale_pass_params(project, it["index"], up["method"]), upscale_profile(project["settings"], up["method"])
        smp = [pr.get("sampler") or "", pr.get("scheduler") or ""]   # in the key only when the profile sets its own (old keys stay)
        k = _h({"v": KEY_VERSION, "up": bk, "p": upscale_key_form(up, w, h), "env": (up_env or {}).get(up["method"], ""), "wh": wh,
                "steps": upp["steps"], "prev": chain,
                **({"pass2_external": project["settings"]["_pass2_external"]} if project["settings"].get("_pass2_external") else {}), **({"rx": refine_extra(project["settings"])} if refine_extra(project["settings"]) else {}),
                **({"upm": project["settings"].get("upscale_model")} if project["settings"].get("upscale_model") else {}),
                **({"ch": [cf, co]} if nch > 1 else {}), **({"smp": smp} if any(smp) else {})})[:16]
        pin = seg.get("pin")
        if pin and pin.get("ukey") and (pin.get("kind") or kind) == kind and pin_key(seg, kind, pin_ok) == bk \
                and (pin_ok is None or pin_ok(pin["ukey"])):
            k = pin["ukey"]   # v6l hotfix: the chosen upscaled take as is
        out.append(k)
        prev = (k, wh)
    return out


def region_upscale_key(project, region_key, region, w, h, up_env=None, index=0):
    """Key of a span's upscale (None without one): the take's key + the same upscale parameters as a clip."""
    up = region.get("upscale")
    if not up:
        return None
    s = project["settings"]
    wh = list(upscale_canvas(w, h, up))
    nch, cf, co = upscale_chunking(s, 17, up["method"])
    pr = upscale_profile(s, up["method"])
    steps = upscale_pass_params(project, index, up["method"])["steps"]
    smp = [pr.get("sampler") or "", pr.get("scheduler") or ""]
    return _h({"v": KEY_VERSION, "rup": region_key, "p": upscale_key_form(up, w, h), "env": (up_env or {}).get(up["method"], ""), "wh": wh,
               "steps": steps, **({"rx": refine_extra(s)} if refine_extra(s) else {}),
               **({"upm": s.get("upscale_model")} if s.get("upscale_model") else {}),
               "ch": [cf, co], **({"smp": smp} if any(smp) else {})})[:16]


def refine_extra(s):
    """Refine-stage sampler / scheduler / cfg in the keys — only when set (older keys stay valid)."""
    x = [s.get("refine_sampler") or "", s.get("refine_scheduler") or "", float(s.get("refine_cfg") or 0)]
    return [["rx"] + x] if any(x) else []


def _refine_keys(project, draft_keys, full_keys, up_env="", parts=None, dparts=None, pin_ok=None):
    """Keys of the final-from-draft pass: footage as is and frozen clips keep their one-pass key (no refine).
    up_env: what really upscales (backend: learned model name)."""
    s = project["settings"]
    items = plan(project)
    rp = [s.get("refine_sigma"), s.get("upscale_method"), list(resolution(s))] + ([up_env] if up_env else []) + refine_extra(s)
    if s.get("refine_schedule_mode") == "basic":
        rp += [["basic_scheduler", float(s.get("refine_denoise", 0.30)), "sample_custom_v1"]]
    if s.get("refine_identity_images"):
        rp += [["refine_identity_picture_v1"]]
    if (s.get("refine_prompt") or "").strip():
        rp += [["refine_prompt_v1", s["refine_prompt"].strip()]]
    # Preserve existing refinement cache keys when the separate seed is disabled.
    if int(s.get("refine_seed", -1)) >= 0:
        rp += [["refine_seed_v1", int(s["refine_seed"])]]
    keys, prev = [], ""
    for it, dk, fk in zip(items, draft_keys, full_keys):
        seg = project["segments"][it["index"]]
        if seg.get("freeze") or is_footage(seg):
            k = fk
        else:
            data = {"v": KEY_VERSION, "refine": dk, "rp": rp, "steps": pass_params(project, it["index"], "refine")["steps"],
                    **({"refine_seed_override": int(seg["overrides"]["refine_seed"])} if "refine_seed" in (seg.get("overrides") or {}) else {}),
                    **({"pass2_external": s["_pass2_external"]} if s.get("_pass2_external") else {}),
                    "prev": prev if it["link"] == "extend" and it["index"] > 0 else ""}
            k = pin_key(seg, "refine", pin_ok) or _h(data)[:16]
            if parts is not None:
                parts.append(dict(data, _draft=dparts[len(keys)] if dparts else None))
        if parts is not None and len(parts) == len(keys):
            parts.append({"v": KEY_VERSION, "full": k})
        keys.append(k)
        prev = k
    return keys


# ---------------------------------------------------------------- «✂ Участок» (middle regeneration)
def normalize_region(r, i=0):
    rg = _merge(DEFAULT_REGION, {k: v for k, v in r.items() if k in DEFAULT_REGION})
    rg["id"] = str(rg["id"] or f"r{i + 1}")
    rg["name"] = str(rg["name"] or "")
    rg["start"] = max(0, int(_num(rg["start"], 0)))
    rg["end"] = max(0, int(_num(rg["end"], 0)))
    if rg["end"] <= rg["start"]:
        return None
    for k in ("head", "tail"):
        try:
            rg[k] = max(-1, min(MAX_OVERLAP_BLOCKS, int(float(rg[k]))))
        except (TypeError, ValueError):
            rg[k] = -1
    rg["prompt"] = str(rg["prompt"] or "")
    rg["refs"] = [str(x) for x in (rg["refs"] if isinstance(rg["refs"], list) else [])]
    rg["cards"] = normalize_card_refs(rg.get("cards"))
    rg["seed"] = max(0, int(_num(rg["seed"], 0)))
    rg["takes"] = [t for t in (rg["takes"] if isinstance(rg["takes"], list) else []) if isinstance(t, dict) and t.get("key")][-MAX_TAKES:]
    rg["active_take"] = None if rg["active_take"] is None else str(rg["active_take"])
    rg["upscale"] = normalize_upscale(rg.get("upscale"))
    return rg


def scene_chains(items):
    """Runs of items whose latents join into one valid 17k+5 / 5k+2 latent: a chain breaks where a clip does not
    continue the previous one through an overlap (new scene, footage, last-frame-only extend). [(start, end, i0, i1)]"""
    out = []
    for it in items:
        if not out or not (it["index"] and it["overlap"]):
            out.append([it["start"], it["end"], it["index"], it["index"]])
        else:
            out[-1][1], out[-1][3] = it["end"], it["index"]
    return [tuple(c) for c in out]


def region_blocks(project, region, key):
    v = int(region.get(key, -1))
    if v < 0:
        v = int(project["settings"].get("overlap_blocks", 1) or 0)
    return max(0, min(MAX_OVERLAP_BLOCKS, v))


def region_window(project, region, items=None):
    """Sampling window of a region. The range snaps to its scene's 17-frame grid (a latent block); the window adds
    `head` blocks of clean context before it and 17·tail + 5 clean frames after it (so it has 17k+5 frames and starts
    on a standalone latent frame). A range reaching the scene end regenerates to the end (no tail).
    Returns a dict (frames are timeline pixel frames) with "error" set when the range cannot be regenerated."""
    items = items if items is not None else plan(limited_project(project))
    out = {"error": "", "warnings": []}
    st, en = int(region["start"]), int(region["end"])
    ch = next((c for c in scene_chains(items) if c[0] <= st < c[1]), None)
    if ch is None or en > ch[1] + 8:   # starts in a gap or crosses a cut / gap: one span over the join
        return bridge_window(project, region, items)
    cs, ce, i0, i1 = ch
    K = (ce - cs - 5) // 17   # whole blocks of the scene
    a = cs + 17 * min(K, max(0, int(math.floor((st - cs) / 17.0 + 0.5))))
    to_end = en >= ce - 8
    if to_end:
        b = ce
        a = min(a, ce - 22)
    else:
        b = cs + 17 * min(K, max(0, int(math.floor((en - cs) / 17.0 + 0.5))))
        if b < a + 17:
            b = a + 17
        if b > cs + 17 * K:
            b = ce
            to_end = True
            a = min(a, ce - 22)
    a = max(cs, a)
    oh = min(region_blocks(project, region, "head"), (a - cs) // 17)
    ws = a - 17 * oh
    if to_end:
        ot, we = 0, ce
    else:
        ot = min(region_blocks(project, region, "tail"), (ce - 5 - b) // 17)
        we = b + 17 * ot + 5
    frames = we - ws
    out.update({"chain": [cs, ce], "i0": i0, "i1": i1, "ws": ws, "a": a, "b": b, "we": we, "frames": frames,
                "head": a - ws, "tail": we - b, "head_blocks": oh, "tail_blocks": ot, "to_end": to_end,
                "lat0": 5 * (ws - cs) // 17, "latent_t": latent_t(frames), "seg": marker_segment(items, a),
                "segs": [it["index"] for it in items if it["start"] < we and it["end"] > ws]})
    if frames > MAX_FRAMES:
        out["error"] = f"окно {frames} кадров длиннее максимума {MAX_FRAMES} — выделите участок короче"
    if oh == 0 and a > cs:
        pass
    if a == cs:
        out["warnings"].append("участок у начала сцены — без контекста до него")
    if to_end:
        out["warnings"].append("участок до конца сцены — без контекста после него")
    if frames < TRAINED_MIN_FRAMES or frames > TRAINED_MAX_FRAMES:
        out["warnings"].append(f"окно {frames} кадров ({frames / FPS:.1f} с) вне обучающего диапазона H3 {TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES}")
    return out


def span_kind(win):
    """The four faces of the one span engine: "region" (inside a shot), "bridge" (across a cut / gap),
    "prologue" (no context before), "extension" (no context after, past the end of a shot)."""
    if win.get("mode") != "bridge":
        return "region"
    if not win.get("head"):
        return "prologue"
    if win.get("to_end") and not win.get("tail_blocks"):
        return "extension"
    return "bridge"


def bridge_window(project, region, items=None):
    """A span over a join (cut / gap) — same engine as a region, but its source is the stitched picture and sound
    of the window, VAE-encoded (the two sides are separate latent chains). Clean head context = the end of the
    shot before (whole blocks, grid from the span start), clean tail = the start of the shot after; the middle —
    across the cut or the gap — is generated. Only a head: «продлить» into a gap; only a tail: «пролог» before a
    shot; neither: a fresh fill. Window frames are 17k+5 from ws; the head never contains a gap, the tail
    stays inside the next shot."""
    items = items if items is not None else plan(limited_project(project))
    out = {"error": "", "warnings": [], "mode": "bridge"}
    st, en = int(region["start"]), int(region["end"])
    chains = scene_chains(items)
    if not items or en <= st:
        out["error"] = "пустой участок"
        return out
    total = items[-1]["end"]
    chA = next((c for c in chains if c[0] <= st < c[1]), None)
    chB = next((c for c in chains if c[0] <= en < c[1]), None)
    if chA is not None and chB is not None and chA == chB:
        chB = None
    if chA is not None:
        a = chA[0] + 17 * max(0, (st - chA[0]) // 17)   # the span covers the whole selection (the join inside)
        a = min(a, chA[1])
        oh = min(region_blocks(project, region, "head"), (a - chA[0]) // 17)
    else:
        a, oh = max(0, st), 0
    ws = a - 17 * oh
    m = max(1, -(-(min(en, total) - a) // 17))
    b = a + 17 * m
    ot = 0
    if chB is not None and b >= chB[0]:
        ot = max(0, min(region_blocks(project, region, "tail"), (chB[1] - 5 - b) // 17))
    to_end = ot == 0
    we = b + 17 * ot + 5
    if we > total:
        out["error"] = "участок выходит за конец таймлайна — добавьте промежуток или отрезок после него"
        return out
    frames = we - ws
    segs = [it["index"] for it in items if it["start"] < we and it["end"] > ws]
    out.update({"chain": [ws, we], "i0": segs[0] if segs else 0, "i1": segs[-1] if segs else 0, "ws": ws, "a": a, "b": b, "we": we,
                "frames": frames, "head": a - ws, "tail": we - b, "head_blocks": oh, "tail_blocks": ot, "to_end": to_end, "lat0": 0,
                "latent_t": latent_t(frames), "seg": marker_segment(items, a) if marker_segment(items, a) >= 0 else (segs[0] if segs else 0),
                "segs": segs, "gaps": [[it["index"], it["gap"]] for it in items if it.get("gap") and ws < it["start"] <= we]})
    if not segs:
        out["error"] = "под участком нет отрезков"
    elif frames > MAX_FRAMES:
        out["error"] = f"окно {frames} кадров длиннее максимума {MAX_FRAMES} — выделите участок короче"
    if oh == 0:
        out["warnings"].append("без контекста до участка (пролог / заполнение)")
    if to_end:
        out["warnings"].append("без контекста после участка (продление)")
    if frames < TRAINED_MIN_FRAMES or frames > TRAINED_MAX_FRAMES:
        out["warnings"].append(f"окно {frames} кадров ({frames / FPS:.1f} с) вне обучающего диапазона H3 {TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES}")
    return out


def region_prompt(project, region):
    s = project["settings"]
    text = "\n".join(t.strip() for t in (s.get("prompt") or "", region.get("prompt") or "") if t and t.strip())
    cl = card_phrases(card_labels(project, region, region=True), text)
    return (text + "\n" if text and cl else text) + "\n".join(cl)


def region_refs(project, region):
    return ordered_refs(project, {"refs": region.get("refs") or []})


def region_params(project, region, win, kind):
    """Sampling parameters of a region pass: those of the clip it starts in, with the region's own seed."""
    p = pass_params(project, max(0, win.get("seg", 0)), kind)
    p["seed"] = int(region.get("seed") or 0)
    return p


def region_track(project, win):
    """v6m: the lock clips a region pass hears, windowed to its range [ws, we) like segment_track — moving / extending
    a clip outside the region keeps its key. All clips inside the window: the old form (old keys stay valid)."""
    lc = lock_clips(project)
    if not lc:
        return None
    t0, t1 = win["ws"] / FPS, win["we"] / FPS
    inside = all(w[1] >= t0 - 1e-9 and w[3] is not None and w[1] + w[3] <= t1 + 1e-9 for w in audio_windows(project))
    if inside:
        return [c for c in lc]
    return segment_track(project, {"start": win["ws"], "end": win["we"]}) or None


def region_key(project, region, win, seg_keys, ref_sigs=None, env_sig="", kind=None, wh=None):
    """Cache key of a region pass: the source latents (keys of the clips under its window, chained), the window,
    prompt, refs and parameters."""
    ref_sigs = ref_sigs or {}
    kind = kind or run_kind(project["settings"])
    s = project["settings"]
    cs = win["chain"][0]
    if win.get("mode") == "bridge":   # source = the stitched window (its clips, gaps, level lock), absolute place
        kind = "full" if kind == "refine" else kind
        env_sig = env_sig.split("|")[0]
    extra = {"bridge": [win["ws"], win["a"], win["b"], win["we"], win.get("gaps") or [], level_lock_frames(project)]} if win.get("mode") == "bridge" else {}
    if card_key(project, region):
        extra["cards"] = card_key(project, region)
    return _h({"v": KEY_VERSION, "region": 1, **extra, "env": env_sig, "kind": kind, "wh": list(wh or []),
               "src": [seg_keys[i] for i in win["segs"] if i < len(seg_keys)],
               "win": [win["ws"] - cs, win["a"] - cs, win["b"] - cs, win["we"] - cs, win["to_end"]],
               "prompt": region_prompt(project, region), "neg": s.get("negative") or "",
               "refs": [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in region_refs(project, region)],
               "params": region_params(project, region, win, kind), "ref_size": s.get("ref_size"),
               "actx": round(min(float(s.get("audio_context_sec", 0) or 0), AUDIO_CONTEXT_MAX), 2),
               "track": region_track(project, win)})[:16]
