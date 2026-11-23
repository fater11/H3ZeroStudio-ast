"""ComfyUI-H3ZeroStudio-Lab: LOCAL EXPERIMENT — animated UI skin of H3ZeroStudio (author: Zero Leloushe).

Collision-free copy: node ids ZL_H3ZeroStudioLab*, routes /h3lab/*, data in output/h3labstudio,
CSS prefix h3l-, localStorage h3ls.*. The main H3ZeroStudio node keeps working next to it.
"""


def _seed_from_main():
    """First start only: copy the main node's global settings (API keys, model folders) and model presets
    into the Lab data folder. Read-only for the main data — nothing in output/h3zerostudio is ever written."""
    try:
        import os, shutil, folder_paths
        out = folder_paths.get_output_directory()
        src, dst = os.path.join(out, "h3zerostudio"), os.path.join(out, "h3labstudio")
        for rel in ("_settings.json", os.path.join("_presets", "presets.json")):
            a, b = os.path.join(src, rel), os.path.join(dst, rel)
            if os.path.isfile(a) and not os.path.exists(b):
                os.makedirs(os.path.dirname(b), exist_ok=True)
                shutil.copy2(a, b)
    except Exception as e:  # never block ComfyUI start
        print("[H3ZeroStudio Lab] seed skipped:", e)


try:
    from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from . import routes as _routes
    _seed_from_main()
    _routes.register()
except ImportError:  # imported outside ComfyUI (pytest collection)
    NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS = {}, {}

WEB_DIRECTORY = "./web/js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
