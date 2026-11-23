# Default model and LoRA preset (build 25)

In the **Models and LoRA** manager, select a library preset and click **☆ Для новых проектов**. The selected preset becomes the default for future projects created via **+ Новый**. Click **★ По умолчанию** to clear it.

A new project embeds a snapshot of the preset, including its model, encoders, video/audio VAEs, LoRAs, strengths, and trigger-word settings. Existing projects are unchanged. Deleting the default library preset clears the selection. If a preset has been removed externally, new projects are created without it and show a warning.

The selection is stored in browser localStorage (per browser/profile, not server-wide). Model paths still need to exist in ComfyUI. Wired node inputs retain priority over preset files.
