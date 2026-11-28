// Help, English text. Mirrors h3s_help_ru.js: same section ids, same order (tests check it).
import { K } from "./h3s_help_ru.js";
export const HELP_EN = [
  ["what", "What is H3ZeroStudio", `
<p><b>H3ZeroStudio</b> is a ComfyUI node with a CapCut-style editor for the <b>MiniMax H3</b> model (video + sound). A video is built on a timeline from <b>segments</b> of 5–15 s. Each segment has its own prompt and references. Segments are generated one after another, and each can <b>continue</b> the previous one, so picture and sound flow without jumps.</p>
<ul><li>Finished segments are cached. A new run recomputes only what changed.</li>
<li>Every generation of a segment is a <b>take</b>: compare takes and pick the best.</li>
<li>There are drafts, upscaling, a live preview, a results gallery and a project list.</li>
<li>The whole project lives inside the workflow, in a hidden field of the node, and is also autosaved to “Projects”.</li></ul>`],
  ["start", "Quick start", `
<ol><li>Add the <b>“H3ZeroStudio · Timeline”</b> node (category <code>MiniMax H3/H3ZeroStudio</code>).</li>
<li>Connect the <code>model</code> (H3, turbo LoRA optional), <code>clip</code> and <code>vae</code> inputs, and <code>audio_vae</code> for sound. Without <code>audio_vae</code> only video is generated. The <code>audio</code> input is optional: you can also upload your own sound as an asset.</li>
<li>Click <b>“Expand”</b> on the node (or double-click it): the editor opens full-window.</li>
<li>In the segment card on the right, write the <b>segment prompt</b> (action, camera, sound).</li>
<li>In the “Assets” tab on the left, drop in pictures of characters and locations, then drag them onto a clip or into the card's “References”.</li>
<li>Click <b>“Generate”</b> (${K("Ctrl+Enter")}). The run joins the ComfyUI queue; progress shows in the header and on the clip.</li>
<li>Add the next segment (${K("E")} or “+ Segment”): by default it <b>continues</b> the previous one. “Generate” again: the finished first segment comes from the cache.</li>
<li>You can generate a later segment directly: all missing earlier segments will be generated in order, while ready ones come from the cache.</li>
<li>To export the final MP4, click <b>“Save video”</b>: assembly and export happen on this action, not automatically after generation.</li></ol>
<p>Collapse the editor with ${K("Esc")} or the button in the top-right corner.</p>`],
  ["header", "Header", `
<ul><li><b>Project name</b>: the field on the left, rename it any time.</li>
<li><b>Chips</b>: number of segments, length and frames, resolution, total steps, estimated time. ${"<b>⚠ N</b>"} lists pre-run warnings (outside the 124–362 frame range, empty prompts, markers with no effect); click it to see them.</li>
<li><b>Undo / Redo</b> (${K("Ctrl+Z")} / ${K("Ctrl+Shift+Z")}).</li>
<li><b>Save video</b>: assembles ready segments from cache and exports MP4 (with colour correction for Studio).</li>
<li><b>↑ Final from drafts</b>: appears when drafts exist; makes finals of all drafted segments or only the selected one.</li>
<li><b>↑ Upscale</b>: upscale the whole video (right-click for another method or size).</li>
<li><b>Generate</b>: queue a run. The badge on the button shows the mode, e.g. “final ↑” in “2 stages” mode.</li>
<li>While generating, the buttons are replaced by a <b>progress bar</b> with status and a <b>“Stop”</b> button.</li></ul>`],
  ["left", "Left tabs", `
<ul><li><b>Assets</b>: your files — pictures (characters, locations, other), audio and video. Upload by dropping, with the button or ${K("Ctrl+V")} (picture from the clipboard). Double-click opens the asset editor, right-click opens the menu.</li>
<li><b>Gallery</b>: every generation result; versions of one video are grouped into folders.</li>
<li><b>Projects</b>: saved projects, new project, zip import and export.</li>
<li><b>Settings</b>: rarely changed parameters — stages, sampling, upscale, sound, cache, preview, models, interface language.</li>
<li><b>Keys</b>: keyboard shortcuts.</li>
<li><b>Help</b>: this page. <b>Info</b>: a short note on how generation works.</li></ul>
<p>Drag the dividers to resize the left and right panels and the timeline. Double-click a divider to reset it.</p>`],
  ["right", "Right panel", `
<p>Things you change often.</p>
<ul><li><b>Segment card</b>:
<ul><li>name and color;</li>
<li>link to the previous one (“Continuation” / “New scene”);</li>
<li>duration (H3 grid of 17k+5 frames), resolution and seed;</li>
<li>segment prompt, references, characters;</li>
<li>takes, “Segment upscale” and action buttons;</li>
<li>“Image change” — 🧪 experimental brightness, contrast and detail measurements, when available for a completed take;</li>
<li>“Additional settings” (at the bottom): the clip's model preset, “Segment overrides” (seed, steps, cfg…).</li></ul></li>
<li><b>Video</b>: negative (shown when cfg &gt; 1) and “Additional settings” (at the bottom): project model presets and the summary line that opens “Settings”.</li>
<li>When a marker or an audio clip is selected, its card appears at the top.</li></ul>`],
  ["timeline", "Timeline and tracks", `
<ul><li><b>Video</b>: segment clips. Drag to reorder, drag the right edge to change length (in H3 grid steps). The seam between two clips can be dragged: one gets longer, its neighbour shorter; with ${K("Shift")} all following clips move.</li>
<li>Toolbar above the tracks:
<ul><li>“+ Segment”;</li>
<li>“Split” at the playhead (${K("S")}), duplicate (${K("D")}), delete (${K("Del")});</li>
<li>“Marker” (${K("M")});</li>
<li>“Span” (${K("R")}): select and regenerate part of the video, see “Span: regenerate part of the video”;</li>
<li>“Video length” and zoom: slider, ${K("+")} ${K("−")}, ${K("Ctrl")}+wheel, “fit the whole video”.</li></ul></li>
<li>Clips show frame thumbnails, the hatched overlap “⟷ N”, “ready / changed” tags and a takes badge. On hover: “Generate”, “Another take”, “↑ Final”, “↑”. Right-click opens a menu with every action.</li>
<li><b>Audio</b> (two tracks) and <b>Music</b>: see “Sound: audio track and music”.</li>
<li>While you drag the end flag, the playhead, a marker, an edge or a seam, the timeline stays put and the item follows the cursor. The view scrolls smoothly only at the very edge.</li></ul>`],
  ["markers", "Markers and video length", `
<ul><li><b>Marker</b> (${K("M")}): a flag on the ruler. Drag it; it has a name and a color. Effects:
<ul><li><b>✎ Note</b>: just for you;</li>
<li><b>✦ Event</b>: the text goes into the segment prompt as “At 2.5s: …”;</li>
<li><b>★ Character</b>: strengthens the likeness of the chosen character through the prompt (H3 has no reference strength).</li></ul></li>
<li><b>End marker</b>: the red “end” flag. Everything after it is dimmed and not generated.
<ul><li><b>Auto</b>: the end always sits at the end of the last clip.</li>
<li><b>Fixed</b>: the marker stays where it is. If you delete or shorten clips, an empty area remains before it (“Extend” fills it).</li>
<li>Type the length into “Video length … s” or drag the flag (${K("Shift")} snaps to seconds).</li></ul></li></ul>`],
  ["prompts", "Segments and prompts", `
<ul><li>The <b>segment prompt</b> is what happens in this piece: action, camera, lines. The project's global prompt (if set) is placed at the start of <i>every</i> segment's prompt.</li>
<li>Keep segments within H3's training range: 5–15 s (124–362 frames). Split a long scene into several continuations.</li>
<li>“Segment overrides” (the “Additional settings” shutter at the bottom of the card) change seed, steps, cfg and more for one segment only.</li></ul>`],
  ["presets", "▢ Model presets and LoRA", `
<ul><li>A preset = base model (diffusion model + dtype, or a checkpoint), text encoder, video VAE, audio VAE and an ordered LoRA list (on/off, model and encoder strength). The library is shared by all projects. Everything is in the <b>“Models”</b> tab on the left (next to “Projects”): the preset bar on top (project preset, the one being edited, new / save as / duplicate / delete / export / import / refresh lists), the LoRA stack on the left, base model, encoder and VAE on the right.</li>
<li><b>LoRA stack.</b> “＋ Add LoRA” opens a picker with search and the models/loras folders (folders with file counts and ›, “All” and the path on top; searching all folders shows each file's folder; ↑↓ Enter, Esc). Each row: name (click to change), strength with ▲▼ (mouse wheel in the field steps 0.05), ⓘ for the path and a separate encoder strength, an on/off switch (a disabled LoRA stays listed and is not in the cache key), ✕ to remove, ⋮⋮ to drag. The master switch on top toggles all, next to “N / M on”.</li>
<li>Pick the project preset in the “Models” tab or in the “Video” card; a clip's card has “Clip model preset” (default “as project”; your own applies to that clip only). Without a preset the node works as before, from its wires. A wired model / clip / vae / audio_vae input wins over the preset's file; the preset's LoRAs go on top of any base.</li>
<li>Models are cached between runs: changing only LoRAs doesn't reload the base; an unneeded base is unloaded before the next one loads.</li>
<li>LoRA files and strengths are part of the cache key only with a preset, so older clips without a preset stay ready. If the preset changes, the clip becomes “changed”. “↺ Restore” shows e.g. “LoRA x 0.8 → 0.5” and brings back the old values (the preset is shared, so the library changes too). The console logs the reason: <code>[H3ZS] cache miss: … reason: …</code> (the log is in Russian).</li></ul>`],
  ["seams", "〰 Seam quality, brightness at joints, clicks, VRAM reserve", `
<ul>
<li><b>Seam score.</b> After generation every “Continuation” joint is measured: the picture jump at the seam divided by the normal frame-to-frame motion next to it. Below 1.2 the <b>seam is invisible</b> (green dot on the timeline), up to 1.8 a <b>slight jump</b> (yellow), above that a <b>hard seam</b> (red). Sound: the loudness jump at the joint in dB. The score shows in the clip card, on the dot above the joint (hover for details) and in the gallery. If a seam is visible, try “Another take”: a new seed usually gives a smoother joint.</li>
<li><b>Clicks at cuts.</b> Where sound is cut hard (new scene, footage, export and trim edges), it fades over ~5 ms on each side: no click, and a 10 ms dip is inaudible. “Settings” → “Continuation and sound” → “Remove clicks at cuts”.</li>
<li><b>Brightness and color matching.</b> At “Continuation” joints the brightness, contrast and color of both sides are blended toward a shared average: strongest at the seam, fading out over the “transition window” (12 frames each side by default). Only the finished picture is adjusted (whole video and export); latents, cache and takes don't change, nothing is regenerated. The shift is capped at ±20/255: a real lighting change is softened, not erased. The seam score shows “after” and, in brackets, “without matching”. “Settings” → “Picture at joints”.</li>
<li><b>Gaps and “∩ Magnet”.</b> The “∩ Magnet” button above the timeline (off by default, remembered in settings). Magnet off: just drag a clip and it (and everything after it) moves, leaving a gap; within 10 px of the previous clip it snaps; drag it over the previous clip to swap order. Magnet on: clips stick together and dragging reorders them. Alt (or Ctrl) while dragging toggles the mode temporarily. A gap is black frames and silence, followed by a new scene; it survives clip deletion, reloads and saves. On the gap itself: <b>“Fill”</b> (bridge or prologue, the span card opens right away) and <b>✕</b> (remove). Once generated, the gap shows as a clip: take frames, “Bridge / Prologue”, seams; click for the card, right-click for “↻ Regenerate” and “✕ Remove fill”; an outdated take is dimmed with ↺; click it to select (Del removes it); the length can also be set in the clip card.</li>
<li><b>Bridges.</b> A span may cross a cut or a gap: the tail of the scene before and the start of the next become context, and the middle is regenerated (a bridge). Before the first clip it's a prologue (following context only), after the last one a continuation (preceding context only). Edges follow the 17-frame grid, sound is stitched sample-accurately, the result is cached together with the gaps. Idea from obvpm-timeline (GPL-3.0), own code.</li>
<li><b>Color.</b> All MP4s are written in BT.709 (TV range) with explicit tags, so colors match in the browser, players and editors.</li>
<li><b>VRAM reserve.</b> “Settings” → “Generation” → “Components and VRAM” → “VRAM reserve during generation”: how much video memory ComfyUI keeps free while generating (the standard <code>--reserve-vram</code>; a larger reserve set at launch is never lowered). If steps suddenly run several times slower with a browser open or screen recording, raise it to 2–3 GB.</li>
</ul>`],
  ["prompted", "✎ Prompt editor", `
<ul><li>Every prompt field has an <b>✎ Edit</b> button: segment prompt, negative, span prompt, marker event, the continuation phrase in “Settings”. It opens a large editor window.</li>
<li><b>@ links a reference.</b> Type ${"<code>@</code>"}: a list of this prompt's references with thumbnails appears (pictures ${"<code>&lt;Picture N&gt;</code>"}, video ${"<code>&lt;Video N&gt;</code>"}, audio ${"<code>&lt;Audio N&gt;</code>"}, the continuation frame). Keep typing part of a name or number to filter; ↑/↓ and Enter or Tab insert the tag. The same references sit above the text as chips: click to insert the tag at the cursor.</li>
<li>Tags are highlighted. A <span style="color:var(--err)">red wave</span> means no such reference (or ${"<code>&lt;Image N&gt;</code>"} was written; H3 expects ${"<code>&lt;Picture N&gt;</code>"}). Yellow means the tag exceeds H3's limit.</li>
<li>For the negative the list covers all segments: ${"<code>&lt;Picture 1&gt;</code>"} differs per segment, and you can see who it is in which segment.</li>
<li><b>Editing:</b> undo/redo (${K("Ctrl")}+${K("Z")} / ${K("Ctrl")}+${K("Y")}, text only, not the project), find ${K("Ctrl")}+${K("F")}, replace ${K("Ctrl")}+${K("H")}, word wrap, line numbers, monospace font, font size (${K("Ctrl")}+${K("=")} / ${K("Ctrl")}+${K("−")}), auto-indent, multiple cursors (${K("Alt")}+click), copy / paste / clear. At the bottom: words, characters, approximate tokens and cursor position.</li>
<li>${K("Ctrl")}+${K("Enter")} applies, ${K("Esc")} cancels (asks if the text changed). Applying is one studio undo step.</li>
<li><b>H3 structure</b> (right-hand panel): recommended sections ${"<code>subject_definitions</code>"} (who is who), ${"<code>summary</code>"} ([task type] + a paragraph), ${"<code>retention_analysis</code>"} (what to keep: fully_preserved…), ${"<code>detailed_description</code>"} (frame-by-frame description, 350–500 words), ${"<code>overall_soundscape</code>"} (ambient sound), ${"<code>non_diegetic_music</code>"} (score, or N/A). Each has a hint, a status and quick inserts; the description has a live word count. “⊕ Insert template” inserts the skeleton (reference tags fill in automatically, existing text moves to detailed_description); “⇣ Tags → subject_definitions” adds lines for new references.</li></ul>`],
  ["refs", "References", `
<ul><li><b>Pictures</b>: up to 9 per segment, including the continuation frame. The order is always “characters → locations → other”, and <code>&lt;Picture N&gt;</code> numbers are assigned automatically. Refer to them in the prompt.</li>
<li><b>Video</b>: up to 3 per segment (<code>&lt;Video N&gt;</code>): drag a video asset onto a clip or into the card.</li>
<li><b>Audio references</b>: up to 3 per segment (<code>&lt;Audio N&gt;</code>). This is only a <b>hint</b> for the model: sound is still generated anew. To get exactly your sound, put the file on the “Audio” track.</li>
<li>References downscaled in the asset editor speed up generation. Reference size (match / max 2048) is set in “Settings” → “Continuation and sound”.</li></ul>`],
  ["chars", "◈ Characters (cards)", `
<ul><li>A <b>card</b> is a pre-encoded reference: a character, location, outfit, style, motion or voice. The RefMod file (.safetensors) is stored in <code>output/h3labstudio/_characters</code> with a preview; ready RefMod files from <code>models/refmods</code> are listed too (read-only). The library is shared by all projects: deleting a project, “Clean up unused”, duplicating, zip and moving a project don't touch it — the project stores only the card's id and signature.</li>
<li><b>“+ Create”</b> in the “Characters” tab: name, folder, type; <b>photos</b> from assets or straight from disk (▤, drop files from your file manager, Ctrl+V; such files sit temporarily in the library's shared folder and are deleted after the card is created or after a day; they don't enter the project or “Assets”) (order ← →, crop — the first photo sets the aspect ratio, the rest are cropped to it), an optional <b>clip</b> (a video asset or a finished segment; 1–4 frames or 5, 22, 39… — the 17-frame rule) and a <b>voice</b> (trim, ≈80 tokens per second). <b>Full</b> keeps all latent tokens, <b>Compressed</b> squeezes the latent to a grid (cheaper). At the bottom: how many tokens the card will take. A VAE is needed: the one wired into the studio node (loaded right away, no run needed), otherwise from the project's model preset or the last run. <b>✎ Edit</b> renames the card's files; the old name stays as an alias, so projects using the card still find it and finished clips don't go out of date.</li>
<li><b>Description</b> (in English): subject name (one word), appearance, what to keep, voice — stored in the card's metadata.</li>
<li><b>Apply</b>: click a card to add it to the selected clip or span, or drag it onto a clip / into the clip card's “Characters” block. The card goes in whole after the regular references: its <code>&lt;Picture N&gt;</code> / <code>&lt;Video N&gt;</code> / <code>&lt;Audio N&gt;</code> tags continue the numbering. Click a chip to insert its tag into the prompt; if the prompt doesn't mention the card, a line based on the card type is added to the final prompt.</li>
<li><b>Weight</b>: ×2–×4 feeds the card 2–4 times (stronger), 0.25–0.75 a weakened copy. ● turns it on/off without removing; ◎ / ∿ — appearance only or voice only. Cards are part of the cache key, takes and “↺ Restore”.</li>
<li>Right-click a card in the library to edit name / folder / description (no re-encoding) or delete it.</li>
<li><b>In the prompt editor</b> (✎): card tags are in the @ list and the chips. <b>“◈ Draft from characters”</b> fills subject_definitions and retention_analysis: <code>&lt;Subject N&gt; Name — tags: role. appearance; keep …; voice: …</code> (with no structure yet it inserts the whole template, existing text moves to detailed_description). <b>!Name</b> opens the character list; on “Apply” each <code>!Name</code> becomes <code>&lt;Subject N&gt; Name</code>. The <b>∿ Name</b> buttons insert a line <code>&lt;Subject N&gt; Name says: &lt;d&gt;[English] …&lt;/d&gt;</code>.</li>
<li>The status line warns about cards whose tags the prompt doesn't mention (an auto line is added), unknown <code>&lt;Subject N&gt;</code> and <code>!Name</code>, disabled cards the prompt names, and voices in a span (not fed).</li></ul>`],
  ["audio", "Sound: audio track and music", `
<ul><li>The <b>“Audio” track</b> (⊠, two lanes) is a <b>hard lock</b>. Under a clip, your sound is pinned in the latent at every step and the video adapts to it (rhythm, lip sync). Add as many clips as you like; move, trim, split (${K("S")} with an audio clip selected) and delete them.</li>
<li>The <b>“Music” track</b> is <b>layered over</b> the video's finished sound and takes no part in generation. The video sound's volume under the music is set in the audio clip card. The mix applies in the player and in “Save video”.</li>
<li>Audio in <b>references</b> is only a hint (see “References”).</li>
<li>With no clips on the track, H3 generates the sound itself. At continuation joints the sound carries on (settings: “Continuation and sound”).</li></ul>`],
  ["extend", "Continuation and overlap", `
<ul><li><b>Continuation</b>: the tail of the previous segment (the <b>overlap</b> frames) is copied to the start of the new one and pinned, and the last frame is added as a reference. The new segment carries on the motion, light and sound.</li>
<li><b>New scene</b>: a hard cut with no continuation.</li>
<li>Overlap follows the H3 grid: 22, 39, 56 … frames. The default is set in “Settings” → “Continuation and sound”; for a single joint use the segment card or right-click → “Overlap”. More overlap gives a smoother transition but a longer generation.</li>
<li>“Sound: previous segment's context”: how many seconds of the previous sound the continuation hears.</li></ul>`],
  ["stages", "Generation: single pass, Low/High and independent two-pass", `
<p>Choose the generation mode in <b>Settings → Generation</b> and confirm with <b>Apply</b>. Switching tabs never selects a mode or starts rendering.</p>
<p><b>Draft = Pass 1</b> shares one parameter set across the ✎ Draft button, stock HiRes and independent HiRes. <b>My generation presets</b> are stored by ComfyUI and can be reused across projects: steps, schedules, resolution, passes and acceleration. Applying a preset changes only the current project, without touching the model, LoRA, assets or finished files.</p>
<ul><li><b>1 stage</b> — generate each clip at full resolution in one MiniMax H3 pass.</li>
<li><b>Low Res → High Res</b> — two resolutions in one sequential generation path. The tested studio profile is <b>4 Low + 4 High = 8 steps</b>; Low Res scale and High Res denoise are independent settings. Keep your working profile if it already performs well.</li>
<li><b>2 stages · stock</b> — a draft → learned latent upscaler → a separate final refinement pass. The draft audio is preserved; the second pass adjusts the picture.</li>
<li><b>🧪 Experimental — independent two-pass</b> (inside Generation): separate steps, CFG, samplers, schedulers and a final-pass seed. <b>★ Recommended parameters</b> applies the test profile with 8+3 steps and BasicScheduler, only when clicked, without starting a render. Save your existing preset before experimenting.</li>
<li><b>🧪 pi-H3 DWD — 2 or 4 steps</b> — experimental modes inside Generation. Only a pruned MiniMax H3 model selected via a model preset is supported; disconnect the H3ZeroStudio MODEL, SAMPLER and SIGMAS inputs. The corresponding 2/4-step DWD adapter and pi-Flow Scheduler are applied automatically (max_raw_t 0.930/0.960; final_step_size_scale 0.60). DWD frames bypass the video VAE. Draft, HiRes and region regeneration are not supported yet. Save the working generation preset before testing.</li>
<li><b>🧪 Experimental — Karras ρ=7 for High Res</b> — a separate opt-in. It never changes the working Low/High mode by itself. External KSAMPLER/SIGMAS inputs can override panel settings.</li></ul>
<p>For a fair A/B comparison keep the seed, text and references the same. BasicScheduler denoise is not an absolute sigma.</p>`],
  ["character_swap", "🧪 Video character replacement", `
<p><b>🧪 Experimental.</b> The separate <b>Character Swap</b> workspace creates a new project; it does not modify the source edit.</p>
<ol><li>Choose a source video and a clear photo of the replacement character. If several people appear, specify which person to replace.</li>
<li>Describe the new character's appearance and clothing in <b>English</b>. Set the clip length to 6, 10 or 15 seconds and optionally retain the source soundtrack.</li>
<li>Click <b>Create swap project</b>, test the first segment, then generate. Long videos split automatically into 6/10/15-second clips. Enable <b>Auto-split with smooth continuation</b> to overlap consecutive clips; disable it for independent scenes.</li></ol>
<p><b>🧪 Sync and auto-split.</b> In the editor, open a Swap clip's <b>Footage</b> section. <b>Sync with timeline</b> aligns the source in-point to the clip, while <b>Auto-split video</b> rebuilds linked clips without changing the finished first clip. A missing source-frame range now shows a warning and blocks new generation <b>before sampling</b>; it will no longer silently hold the last source frame. Regenerate changed clips afterward; previous takes and files remain available.</p>
<p>Select an installed <b>Character Swap LoRA</b> from any configured ComfyUI folder; each segment can override its LoRA. The source video is a latent guide, the photo is <code>&lt;Picture 1&gt;</code>, and this is not ordinary vid2vid. Source audio is preserved through H3 audio latents, not bit-identical.</p>
<p><b>🧪 Experimental: Analyse character.</b> Swap can fill an editable English appearance description from the character photo and optional face close-up. Configure a vision-capable API model under Assistant settings first; ComfyUI's text encoder cannot analyse photos. Images are sent to the configured API only after your click. Analysis is blocked during an active render. Review the result carefully: appearance details may be inaccurate.</p>
<p><b>🧪 Experimental: preserve the background with SAM 3.1.</b> Enable it in the Swap wizard, click the person <b>in the first frame</b> inside their detection box, then press <b>Verify selection</b>. SAM 3.1 uses the person's box to avoid segmenting only a face or garment; without a box it falls back to the click. Confirm the <b>entire person is green</b>. The original video remains unchanged outside that mask. Person masks are tracked between clips and cached. With the switch off, the previous Swap workflow is unchanged. Occlusions and crossings may lose tracking; test a 6-second clip first. Mask tracking and video VAE re-encoding add processing time.</p>
<p><b>🧪 Mask identity jump guard.</b> Optional, off by default in SAM 3.1 settings. If a tracked person teleports a large distance within one frame, that frame stays original to avoid swapping another person. The choice is saved with the project and included in cache keys. Sudden movement or occlusions may cause missing replacements; check the finished clip.</p>
<p><b>Before / after comparison.</b> Select a completed Swap segment in the editor and press <b>Before / after</b> above the player (in either workspace). Both videos play and seek in sync, the source starts at the correct in-point, and you can zoom in on the face or switch between A/B audio.</p>`],
  ["seed_hunter", "🧪 Seed Hunter and independent final-pass seed", `
<p><b>🧪 Experimental.</b> In a segment’s Takes panel, <b>Seed Hunter</b> generates three low-resolution drafts, sequentially, with seeds <b>S, S+1000 and S+2000</b>, where S is the current segment seed. It starts the next candidate only after the previous one finishes.</p>
<ol><li>Open a segment → Versions / Takes → Seed Hunter.</li><li>Wait for all three drafts, or cancel. Finished takes remain available.</li><li>Compare the drafts, select your favorite manually and run the final pass if needed.</li></ol>
<p><b>Independent final-pass seed</b> in advanced two-pass settings: −1 inherits the draft seed; a different value changes only the final-pass noise without regenerating the draft. This is for controlled comparisons, not an automatic best-take selector.</p>`],
  ["self_voice", "🧪 First-clip voice anchor · one speaker only", `
<p><b>🧪 Experimental and off by default.</b> Settings → Continuation and sound → <b>Experimental · anchor ONE voice</b>. In single-pass and Low Res → High Res modes, up to the first <b>15 seconds</b> of generated audio become a fixed <code>&lt;Audio 1&gt;</code> reference for later <b>continuations</b> in the same chain. A New scene cut resets the source.</p>
<ul><li><b>Use it for:</b> a single person speaking a clean solo line early in the first clip, ideally with no music. A compatible <b>REF2VA</b> checkpoint is required.</li>
<li><b>Multiple speakers:</b> <b>do not enable</b> the shared automatic anchor. It does not separate speakers and may mix vocal identities. Give each person a distinct character voice card or a clean <code>&lt;Audio 1&gt;</code>, <code>&lt;Audio 2&gt;</code>, <code>&lt;Audio 3&gt;</code> reference; explicitly identify speakers in the prompt. Reference numbers depend on the ordering of assets and cards.</li>
<li>Manually assigned audio references and character-card voices take priority; the auto-anchor is skipped for that clip.</li>
<li>Not used for <b>FLF</b>, footage-based generation or the <b>independent second pass</b>, which preserves draft audio separately.</li>
<li>Enabling it changes <b>cache keys of later continuations</b>, so those takes need regeneration; the first source clip is unchanged. Disabling it restores the original behavior.</li></ul>
<p>This is an attempt to retain vocal timbre and language, <b>not a guarantee</b> of identical voices. The reference words are not meant to repeat. Use identical seeds and text for A/B tests.</p>`],
  ["visual_drift", "🧪 Image change · read-only diagnostics", `
<p><b>🧪 Experimental, read-only diagnostics.</b> The segment inspector, below Versions, may show a collapsible <b>Image change</b> panel when the completed result contains saved measurements.</p>
<ul><li><b>Brightness</b> is the difference in average luminance in percentage points. <b>Contrast</b> and <b>Detail</b> are ratios (×) against the baseline clip of this run.</li>
<li>Values use a small sample of delivered frames, excluding carried overlap. A New scene cut starts a new baseline.</li>
<li><b>Not a quality, face, voice or character-identity score:</b> changes in scene, lighting and camera can change these numbers even when the output is good.</li>
<li>This feature never adjusts frames, sigma, seeds or cached takes.</li></ul>`],
  ["vice_theme", "🧪 GTA VI · Vice theme", `
<p><b>🧪 Experimental interface theme.</b> Settings → Appearance includes <b>GTA VI · Vice</b>: a dark violet base with pink and turquoise Miami-sunset accents.</p>
<ul><li>Only studio UI colors and surfaces change. The theme <b>does not affect colors or quality in generated videos</b>.</li>
<li>Select it in Appearance settings. After updating the UI files, press Ctrl+F5 to refresh the browser.</li></ul>`],
  ["perclip", "✎ Draft, ✦ Final and ↑ Final", `
<ul><li><b>✎ Draft</b> and <b>✦ Final</b> in the segment card and the clip menu run one stage <i>for this clip only</i> with that stage's parameters from “Settings”. The project mode doesn't change.</li>
<li>What <b>✦ Final</b> does:
<ul><li>in “2 stages” mode it makes the final from the clip's draft (creating the draft if there is none);</li>
<li>in “1 stage” mode it generates full size right away.</li></ul></li>
<li><b>↑ Final</b> on a clip, “↑ Final from draft” in the card and menu, and <b>“↑ Final from drafts”</b> in the header make the final from exactly the selected draft take.</li>
<li>If the segment is already done, clicking again does nothing. For a new variant, click “Another take”.</li></ul>`],
  ["upscale", "↑ Upscale", `
<ul><li><b>↑ Upscale in the header</b>: the whole video. Each segment is upscaled in its own window and refined by a short H3 pass; the sound stays 1:1. Finished parts come from the cache and an interrupted run resumes. Right-click for a different method or size this time.</li>
<li><b>↑ Upscale segment</b> (the ↑ button on a clip, the clip menu, the card): this clip only. The result is a new take; the old one can be restored.</li>
<li><b>Footage “as is”</b> is upscaled too: its frames are VAE-encoded and go through the chosen method + refine (fine details may change slightly); The sound is untouched.</li>
<li><b>↑ Upscale span</b> (right-click a bridge / prologue / span, or the span card): the span take is upscaled in its own window + refine, with the same method and profile; the result is cached with the take, and both seams are re-matched after upscaling. “↑ Upscale” in the header covers clips, footage and applied spans.</li>
<li><b>Each method has its own profile</b>: size, refine σ and steps, sampler, tiles and time chunks (on/off, length, overlap). Switching the method only shows its profile and resets nothing. The upscale menus in the header and on clips use the selected method's profile. By default chunks are on for latent, off for tiles.</li>
<li>Methods (choose in “Settings” → “Upscale”):
<ul><li><b>Latent + refine</b>: H3's trained latent upscaler, the default — fast, no decode/encode.</li>
<li><b>Tiles (SyncTile)</b>: after upscaling, refine with synchronized tiles; each sees the segment's prompt and references. Set tile size and overlap; the resulting grid (e.g. 3×3) is shown right away. Default refine strength is <b>σ 0.60</b> (recommended): lower values hardly affect the picture, 0.60 keeps consistency very well and barely changes details; the list goes up to σ 1.00.</li></ul></li>
<li><b>Size</b> is in megapixels: presets 1.0–4.0 MP or a “custom size”. The resulting W×H is shown next to it (project aspect ratio, multiples of 32). The same choice is in the header's and clip's “↑ Upscale” menus (method ▸ size). Old ×1.5 / ×2 values were converted to MP with the same size; finished upscales stayed cached.</li>
<li><b>Time chunks</b> keep VRAM in check (e.g. 12 GB): a long clip is upscaled in chunks of ≈ N seconds (5 s = 124 frames by default, snapped to the H3 grid) with overlap (22 frames by default). Chunks run one by one, each with its own upscale and refine (tiles work inside a chunk); memory is freed between chunks. Each chunk continues the clean tail of the previous one, as in a continuation; frames blend smoothly at the joint. The number of chunks is automatic (“whole clip in one chunk” turns it off). Status and console show chunk i/N, step, tile and percent.</li>
<li>If the trained upscaler is not available, the run stops with a clear error (see “Models”).</li></ul>`],
  ["live", "Live preview and progress", `
<ul><li>While generating, the player shows the predicted frame of each step. With <b>taeh3</b> in <code>models/vae_approx</code> the preview is full resolution; without it, rough latent→RGB colors.</li>
<li>Under the player, “Sampling dynamics”: σ and Δ per step and step time.</li>
<li>The header shows status: segment, stage, step, ETA. When upscaling: window, step, tile, % and ETA; the current tile is outlined over the player.</li>
<li>A detailed <code>[H3ZS]</code> log in the ComfyUI console is enabled in “Settings” → “Live preview and log”.</li>
<li>Playback never starts by itself — only with Play or ${K("Space")}.</li></ul>`],
  ["takes", "Takes and “Another take”", `
<ul><li>Every generation of a segment is saved as a take, up to 12 per segment. Pick one by its thumbnail in the card (“Takes”), by the badge on the clip, or in the clip menu.</li>
<li>The selected take goes into the video and is what the next segment continues. Switching it marks the following segments “changed”; switching back clears the mark.</li>
<li><b>Generate</b> (on the clip and in the card): this segment only, if it changed. <b>Another take</b>: this segment with a new seed; earlier takes stay.</li>
<li><b>⊠ Lock</b>: the take is never regenerated and survives “Clear cache”. <b>⊡ Unlock</b> undoes it.</li></ul>`],
  ["region", "Span: regenerate part of the video", `
<p>Don't like a piece <b>in the middle</b> of a segment, at the joint of two, or across a cut or gap? Regenerate just that piece. Video and sound <b>before</b> and <b>after</b> stay as they are and serve H3 as context, so the new piece continues what came before and leads into what follows. Works for generated clips and footage alike.</p>
<ol><li>Click <b>“Span”</b> on the toolbar above the timeline (${K("R")}). The button lights up and the cursor becomes a crosshair.</li>
<li>Drag along the video track from the start to the end of the piece. A simple click selects ≈1.4 s around the point.</li>
<li>A pink frame appears (what gets regenerated) with blue hatching on both sides (context before and after, unchanged). Drag the frame's edges, or the “N” label to move the whole span.</li>
<li>In the card above the timeline: <b>span prompt</b> (prefilled with the segment prompt; the global prompt is added), references (pick or drop an asset onto the card), <b>seed</b>, <b>context before / after</b>.</li>
<li><b>“↻ Regenerate”</b> runs it. Finished segments come from the cache; only the span window is sampled. Progress and live preview work as for segments.</li>
<li>${K("Esc")} or clicking the button again leaves the mode. Outside the mode the timeline works as usual.</li></ol>
<ul><li><b>Takes</b>: every result is a span take. The card's “Original / 1 / 2…” lets you compare or switch back. “↻ Regenerate” with the same settings uses a new seed. If the segments under the span change later, the take is marked “outdated” and stays out of the video.</li>
<li><b>H3 grid</b>: the model slices time in blocks of 17 frames (≈0.71 s). Span edges snap to the nearest block boundaries, and the card shows exactly what is regenerated. Generation window = context before + span + context after, always 17·k+5 frames.</li>
<li><b>Context</b>: “as in settings” = the continuation overlap. Before: 17·N frames, after: 17·N+5. More context gives a smoother transition but a longer generation.</li>
<li><b>Seam</b>: video is replaced frame for frame. Sound is spliced sample-accurately: the offset is found by correlation over the context zones, levels are matched, and short crossfades are placed at the quietest points.</li>
<li><b>2 stages</b>: the window is drafted first, then upscaled and refined at final size. The draft sound is kept.</li>
<li><b>Bridge, prologue, continuation</b>: a selection may cross a cut or a gap — that's a <b>bridge</b> (purple frame): the tail of the scene before and the start of the next are context, and the middle is generated over the joined video. Starting in a gap before a scene makes a <b>prologue</b> (following context only); ending past a scene's edge in a gap makes a <b>continuation</b> (preceding context only). In “2 stages” mode a bridge is made in one final pass. You can't go past the end of the timeline — add a gap or a segment.</li>
<li><b>Both seams</b>: after generation, brightness and color are matched at the span's start and end (as at continuation joints, if enabled) and each seam gets a score — colored dots on the frame and a “Seams” line in the card (with the pre-matching value and the sound jump).</li>
<li><b>↺ Restore</b>: if the selected take went out of date because you changed the span's edges, context, prompt, references or seed, the button in “Span takes” brings them back and the take applies again.</li>
<li>Another way: right-click a clip → “↻ Regenerate span…”.</li></ul>
<p class="h3l-note">The idea of a time mask for H3 comes from open projects: ComfyUI (native H3 temporal inpaint, GPL-3.0), panghea/ComfyUI-MiniMax-H3-Inpaint-Tools (GPL-3.0), filliptm/ComfyUI-FL-MiniMaxH3 “Temporal Reshot” (Apache-2.0), red-polo/ComfyUI-MiniMaxH3FrameInfill (GPL-3.0). No code was copied.</p>`],
  ["player", "“Whole video” and “Previous result”", `
<ul><li><b>Whole video</b> is always the <i>current</i> timeline. If the final file matches the timeline exactly, that file plays. Otherwise the video is assembled on the fly from finished takes, footage and placeholders for ungenerated segments (plus the audio and music tracks).</li>
<li><b>Segment N</b>: only the selected segment.</li>
<li>⛶ / ${K("F")}: full-screen player; the magnifier or a double-click on the frame opens the “Viewer” (zoom, frame by frame, speed, loop).</li>
<li><b>Previous result</b> (yellow dot): the last assembled file that no longer matches the timeline. It opens only in this tab and disappears once any of its segments is gone.</li></ul>`],
  ["viewer", "Full screen and the “Viewer”", `
<ul><li>The ⛶ button under the player (or ${K("F")}) makes the player full screen. ${K("Esc")} exits.</li>
<li>The <b>Viewer</b>: the magnifier button next to ⛶ or a double-click on the frame; also from a clip's right-click menu and from the Gallery. It shows whatever is in the player: the live “Whole video” assembly (frame stepping then follows the timeline), a single clip, a take or a file. Video doesn't start by itself.</li>
<li>Zoom: “Fit”, ${K("×1")} (pixel for pixel), ${K("×2")}, ${K("×4")}; the mouse wheel zooms smoothly at the cursor, double-click toggles fit / ×2. Drag the frame to pan. ${K("▦")}: crisp pixels without smoothing.</li>
<li>A scrub bar with timecode (m:ss:frame) and frame number. Speed 0.25× / 0.5× / 1× / 2×, volume, loop: ${K("I")} in, ${K("O")} out, ${K("L")} on/off.</li>
<li>Keys: ${K("Space")} play/pause; ${K("←")} ${K("→")} or ${K(",")} ${K(".")} frame back/forward, with ${K("Shift")} by 1 s; ${K("Home")} / ${K("End")}; ${K("0")} ${K("1")} ${K("2")} ${K("4")} zoom; ${K("M")} sound; ${K("F")} full-screen window; ${K("Esc")} close. After closing, the editor is as it was and the playhead sits on the last frame viewed in the assembly.</li></ul>`],
  ["assetedit", "Asset editor", `
<p>Double-click an asset or choose “✎ View / edit…” in its menu. Edits are non-destructive: a copy is created, and “↺ Reset” brings back the original file.</p>
<ul><li><b>Picture</b>: crop (free or by aspect ratio, including “as project”), rotate, mirror, downscale.</li>
<li><b>Audio</b>: trim on the waveform, volume and normalization, fades.</li>
<li><b>Video</b>: trim in time, downscale, crop, rotate, mirror, “▣ Grab frame” and “Grab sound” (new assets).</li></ul>`],
  ["footage", "Video as footage", `
<ul><li>Drop a video asset onto an <b>empty part of the video track</b> to make a footage clip. The next segment continues it.</li>
<li>Footage mode in the card: <b>as is</b> (the file's frames unchanged) or <b>↻ Regenerate</b> — H3 redraws the piece from the prompt, keeping motion and composition (strength = denoise).</li>
<li>Video dropped <b>onto a segment</b> becomes a <code>&lt;Video N&gt;</code> reference.</li></ul>`],
  ["export", "Save video", `
<ul><li><b>“Save video”</b> in the header: the whole video, a fragment (from – to; the “⌖ playhead” button fills in the current time) or a single segment.</li>
<li>Any folder on the ComfyUI machine (default <code>ComfyUI/output/h3labstudio/export</code>). The file is mp4 H.264 + AAC; an existing file is never overwritten (_2, _3… is appended).</li>
<li>If there is music, turn on “Mix”: the music and the video sound's volume go into the file.</li>
<li><b>Studio (Lab) colour correction</b> can be enabled separately in the Save dialog without modifying the source takes.</li>
<li><b>🧪 New streaming export</b> is the primary save path: clips are piped to FFmpeg sequentially without huge temporary RGB frame caches. It supports hard cuts, continuation overlaps, audio, music, and prepared Studio Lab colour. IMAGE outputs one preview frame; LATENT contains the stitched chain.</li>
<li><b>NVIDIA NVENC</b> is selected automatically when usable; CPU H.264 is used on failure. There are no separate NVENC, concat, or assembly-mode switches.</li>
<li>Assembly runs through the piped encoder (take by take, never the whole film in memory), which is several times faster than the classic stitch; with colour correction it reads each segment's prepared RGB8 layer, and where a layer is missing it warns in the log and encodes that master without it. The brightness/contrast/detail comparison is skipped when the colour layer is off — it has nothing to feed.</li>
<li>Complex regions, footage, upscale, face/audio refinement, frozen takes, and locked audio automatically use H3's compatible processing path. They may take longer and need additional disk space, but remain supported.</li>
<li>Ready takes are assembled from cache without regenerating; generate any missing or changed takes first. A single-segment fragment is also available under “⤓ Save fragment” in the clip menu.</li></ul>`],
  ["projects", "Projects and autosave", `
<ul><li>The project is stored in the workflow (save the workflow in ComfyUI as usual) and is automatically copied to <code>output/h3labstudio/_projects</code> — the <b>“Projects”</b> tab.</li>
<li>At the top of the tab is the current project: name, “Save”, “Duplicate”, “Export zip”. Below are all projects: click to open; “⋯” or right-click for “Open”, “Duplicate”, “Rename…”, “Export zip…”, “Delete…”.</li>
<li><b>“+ New”</b> starts an empty project (the current one is saved). <b>“Import”</b> loads a zip project together with its assets.</li></ul>`],
  ["gallery", "Gallery", `
<ul><li>All results: takes, drafts, finals, upscales, locked segments and assembled videos — of <b>this project</b> or <b>all projects</b>.</li>
<li>Search by prompt, name and seed, filters by type (including “Spans”) and ★ favorites. Cards have a fixed size; if they don't fit, the list scrolls, and the scroll position survives refreshes.</li>
<li><b>Folders.</b> Versions of one video are grouped into one card: draft, final ↑, upscales with different methods and sizes, redone takes and regenerated spans of a segment; the project's assembled videos form one folder too. The cover shows the most finished version (upscale → final → take → span → draft; the newest among equals), a “▣ N” badge and stage chips. Click to open it like a folder: all versions with captions (stage, method, resolution and MP, seed, date); “← Gallery” goes back. Versions are linked by segment and origin (upscale → its final → its draft); older files without this data are linked by project takes and segment number, otherwise the card stays separate. The “☰ List” switch shows everything without folders.</li>
<li>Double-click to watch. ${K("Ctrl")}+click two cards → “⇄ Compare selected”: A/B side by side with synced playback and a choice of sound. The selection survives moving between folders, so you can compare versions from different folders. If side A or B belongs to a folder, a list under it switches to another version of that folder without closing the comparison.</li>
<li><b>Zoom in A/B:</b> ${K("×1")} ${K("×2")} ${K("×4")} buttons (plus the mouse wheel at the cursor and double-click). The window doesn't grow — only the frame inside it is magnified. A and B zoom and pan together: drag to inspect a spot. ${K("▦")}: pixels without smoothing.</li>
<li>Right-click a card: (on a folder) “▤ Open folder”, “⇄ Compare the two latest versions”; “▶ Watch”, “⇄ Compare with selected”, select the take on the timeline, “To timeline (footage)”, into the segment's references, “↑ Upscale segment”, “↑ Final from draft”, “⤓ Save to folder…”, favorite, “Delete…”.</li></ul>`],
  ["settings", "Settings: for all projects or per project", `
<ul><li><b>For all projects</b> — shared settings saved in <code>output/h3labstudio/_settings.json</code> and applied to new projects and projects using global settings.</li>
<li><b>This project only</b> — its own values. Older projects keep local settings to protect finished takes from unexpected parameter changes. “Make global” copies these values into shared settings.</li>
<li><b>v6 sections:</b> General, Appearance, Generation (including independent two-pass and pi-H3), Upscale, Continuation and sound, Preview and cache, Models and LoRA, Model downloads, Assistant, Keys, Help and About.</li>
<li><b>🧪 Experimental</b> means an opt-in feature intended for A/B testing, such as High Res scheduling, independent two-pass, one-speaker anchoring or Seed Hunter. They never turn themselves on. Keep a copy of your working settings and takes.</li>
<li><b>Interface language:</b> Auto (ComfyUI), Russian or English. Refresh after changing languages. Restart ComfyUI after Python code changes; use Ctrl+F5 after interface-only updates.</li></ul>`],
  ["keys", "Keyboard shortcuts", `
<table class="h3l-hkeys">
<tr><td>${K("Space")}</td><td>play / pause</td></tr>
<tr><td>${K("F")}</td><td>full-screen player (in the “Viewer”: full-screen window)</td></tr>
<tr><td>${K("S")} / ${K("D")} / ${K("E")}</td><td>split at the playhead (with an audio clip selected — split it) / duplicate / extend</td></tr>
<tr><td>${K("Del")}, ${K("Backspace")}</td><td>delete the segment (or the selected audio clip)</td></tr>
<tr><td>${K("M")}</td><td>marker at the playhead</td></tr>
<tr><td>${K("R")}</td><td>“Span”: select part of the video to regenerate (Esc exits)</td></tr>
<tr><td>${K("←")} ${K("→")}, ${K("Shift")}</td><td>frame back / forward, with Shift by 1 s</td></tr>
<tr><td>${K("Home")} / ${K("End")}</td><td>to start / to end</td></tr>
<tr><td>${K("[")} / ${K("]")}</td><td>previous / next segment</td></tr>
<tr><td>${K("+")} ${K("−")}, ${K("Ctrl")}+wheel</td><td>timeline zoom</td></tr>
<tr><td>${K("Alt+N")}</td><td>next unfinished segment (new shell)</td></tr>
<tr><td>${K("Ctrl+Z")} / ${K("Ctrl+Shift+Z")}, ${K("Ctrl+Y")}</td><td>undo / redo</td></tr>
<tr><td>${K("Ctrl+Enter")}</td><td>generate</td></tr>
<tr><td>${K("Ctrl+V")}</td><td>paste a picture into assets</td></tr>
<tr><td>${K("Esc")}</td><td>close a menu / leave “Span” / clear the selection / collapse the editor</td></tr></table>
<p>While the editor is open, ComfyUI's own shortcuts (including its Ctrl+Z) are off.</p>`],
  ["models", "Required models and where they go", `
<ul><li><b>MiniMax H3</b>: model, text encoder and VAE — as in a regular H3 workflow, connected to the <code>model</code>, <code>clip</code>, <code>vae</code> inputs. Needs a ComfyUI with native H3 support.</li>
<li><b>Audio VAE</b> (<code>minimax_h3_audio_vae</code>) → the <code>audio_vae</code> input: no sound without it.</li>
<li><b>taeh3.safetensors</b> → <code>models/vae_approx</code>: full-resolution live preview (optional).</li>
<li><b>Trained latent upscaler</b>: the <code>MinimaxH3LatentUpscaler3D</code> node and the <code>minimax_h3_latent_upscaler_3d_bf16.safetensors</code> model → <code>models/latent_upscale_models</code> (folders from <code>extra_model_paths.yaml</code> work too).</li>
</ul>
<p>What was found and what is missing is shown in “Settings” → “Models”, along with the folder paths. After installing a model or node, restart ComfyUI.</p>`],
  ["assist_conn", "🔌 Assistant: keep the address and key", `
<p><b>Why it resets.</b> The assistant's API address, key and model live <b>inside the project data</b>, which keeps a project reproducible. Another or a new project therefore opens with empty fields.</p>
<p><b>How to make it stick.</b> “Assistant” → “Settings” → the API address block → <b>“Remember the address and key”</b>. The values are kept in this browser (localStorage key <code>h3ls.ast.conn</code>) and filled into any project whose fields are empty, new ones included. Typing an address, key or model remembers it as well.</p>
<p><b>To forget.</b> <b>“Forget”</b> clears the remembered copy: the open project keeps its own values and other projects stop receiving them. A private-mode browser may refuse to store them — then they live in the project only.</p>
<p><b>Secrets.</b> The key still sits in the project once you typed it there: a project sent to someone else or exported as a zip carries the key with it. Use a local server without a key, or clear the key before sharing.</p>
<p><b>Not carried over.</b> Presets (styles, prompt modes, templates) stay with the project: they are part of its recipe, not a machine setting.</p>`],
  ["faq", "Questions and problems", `
<dl>
<dt>🧪 Two people talk in the first clip — enable voice anchoring?</dt>
<dd><b>No.</b> The automatic anchor is for one speaker and cannot separate a mixed recording. Use separate voice cards or clean audio references for each person and name speakers explicitly in the prompt. See “🧪 First-clip voice anchor”.</dd>
<dt>🧪 Why do later takes become “changed” after enabling the auto-anchor?</dt>
<dd>The new audio reference changes their conditioning and cache keys. The first clip remains cached; a continuation is regenerated only when you start generation.</dd>
<dt>I updated H3ZeroStudio — restart or Ctrl+F5?</dt>
<dd>If only interface files changed (<code>web/js</code>), reloading the page with ${K("Ctrl+F5")} is enough. If <code>.py</code> files changed, or you installed a new node or model, restart ComfyUI, then ${K("Ctrl+F5")}.</dd>
<dt>Segment 2 has grayed-out ✎ Draft / ✦ Final / “Generate”</dt>
<dd>It is a continuation and needs the tail of segment 1. Generate segment 1 first (or pick a finished take of it), or switch segment 2 to “New scene”. The button's tooltip explains why. The buttons are also disabled during generation and past the end marker.</dd>
<dt>Why is a clip marked “changed”?</dt>
<dd>Its finished take was made under different conditions: the prompt, references, length, seed, stage parameters or settings changed, or a different take of the previous segment was selected. Following continuation segments become “changed” too. Click “Generate” and only what changed is recomputed. Reverting clears the mark: the <b>“↺ Restore”</b> button in such a clip's card shows exactly what changed (segment fields, project fields, the selected take of the previous segment — “was → now”) and restores the checked items in one undo step. Project fields affect all clips. The ComfyUI console also says why the key didn't match: <code>[H3ZS] cache miss: … — reason: …</code>.</dd>
<dt>A segment is marked “past the end”</dt>
<dd>It is after the video's end marker and isn't generated. Move the marker or use “Marker → end”.</dd>
<dt>“Whole video” doesn't play what I expected</dt>
<dd>It always shows the current timeline: ungenerated parts as placeholders, changed ones with their earlier takes. The old file is available only in the “Previous result” tab.</dd>
<dt>“Upscale unavailable”</dt>
<dd>The trained upscaler model is missing — see “Models”. Restart ComfyUI after installing.</dd>
<dt>No sound</dt>
<dd>Connect <code>audio_vae</code>. Check the player's sound button: if the browser muted autoplay, it is highlighted and the first click turns sound on.</dd>
<dt>Generation is slow</dt>
<dd>Use “2 stages” or ✎ Draft while tuning prompts, keep segments at 5–15 s, downscale references in the asset editor. Turbo LoRA: about 4 steps, cfg 1. Progress by steps and tiles shows in the header and in the console (<code>[H3ZS]</code>).</dd>
<dt>Free up disk space</dt>
<dd>“Settings” → “Cache” → “Clear project cache”. Finished takes are kept: each has its latent, recipe, master frames and sound next to it, so continuation, “↑ Final” and assembling the video work without generation and without a VAE. “…and takes” deletes them too (except ⊠ locked ones). A copy of the same reference file (zip import, re-saving) no longer resets the cache — the content is compared.</dd>
<dt>Where are the project files?</dt>
<dd>All in one folder: <code>ComfyUI/output/h3labstudio/&lt;project id&gt;/</code> — uploaded assets (<code>assets/</code>, identical files stored once), their processed versions (<code>assets/derived/</code>), video posters (<code>thumbs/</code>), generations, cache, takes, gallery and the default export (<code>export/</code>; a custom export folder is left alone). Projects from older versions copy their files from the shared <code>input/h3labstudio</code> into their own folder when opened (originals stay, finished clips don't go out of date). “Delete…” in “Projects” with “Delete all project files” checked shows how much space will be freed and deletes the whole folder. Duplicating and zip export take the assets along. “Settings” → “Clean up unused” deletes shared files from older versions that no saved project references (it shows the count and size first).</dd>
</dl>`],
];
