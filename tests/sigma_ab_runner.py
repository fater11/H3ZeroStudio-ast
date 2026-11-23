"""Build a one-segment H3ZeroStudio A/B prompt from a saved ComfyUI workflow.

Defaults to dry-run. No generation or project copy occurs without --submit.
The submitted runs use a distinct test project ID and never edit the original.
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT_URL = "http://127.0.0.1:8188"
WORKFLOW = Path(r"H:\ComfyUI-Easy-Install\ComfyUI\user\default\workflows\H3ZeroStudio-Continuous-Two-Pass-Workflow.json")
SOURCE_PROJECT = "p8naja5f2wo"
TEST_PROJECT = "h3zs_sigma_ab_20261121"
ROOT_NODE = 38
PRIMITIVES = {"STRING", "INT", "FLOAT", "BOOLEAN", "COMBO"}


def http(path, value=None):
    body = json.dumps(value, ensure_ascii=False).encode("utf-8") if value is not None else None
    req = urllib.request.Request(
        ROOT_URL + path,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
        method="POST" if body else "GET",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def data(result):
    if isinstance(result, dict) and "ok" in result:
        if not result["ok"]:
            raise RuntimeError(str(result))
        return result["data"]
    return result


def is_widget(spec):
    kind = spec[0]
    return isinstance(kind, list) or kind in PRIMITIVES


def convert_workflow(path):
    saved = json.loads(path.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in saved["nodes"]}
    links = {l[0]: l for l in saved["links"]}
    needed = set()
    todo = [ROOT_NODE]
    while todo:
        nid = todo.pop()
        if nid in needed:
            continue
        if nid not in nodes:
            raise ValueError(f"Missing node {nid}")
        needed.add(nid)
        for inp in nodes[nid].get("inputs") or []:
            if inp.get("link") is not None:
                if inp["link"] not in links:
                    raise ValueError(f"Missing link {inp['link']}")
                todo.append(links[inp["link"]][1])

    prompt = {}
    for nid in sorted(needed):
        node = nodes[nid]
        cls = node["type"]
        info = http("/object_info/" + urllib.parse.quote(cls)).get(cls)
        if not info:
            raise RuntimeError(f"Node not registered: {cls}")
        inputs = {}
        for inp in node.get("inputs") or []:
            lid = inp.get("link")
            if lid is not None:
                link = links[lid]
                inputs[inp["name"]] = [str(link[1]), int(link[2])]
        widgets = node.get("widgets_values") or []
        if cls == "Power Lora Loader (rgthree)":
            for j, value in enumerate(widgets):
                if isinstance(value, dict) and {"on", "lora", "strength"} <= value.keys():
                    inputs[f"lora_{j - 1}"] = value
        else:
            index = 0
            sockets = {item["name"]: item for item in node.get("inputs") or []}
            for group in ("required", "optional"):
                for name, spec in (info["input"].get(group) or {}).items():
                    # A disconnected optional socket is not a widget (e.g.
                    # H3Lab.global_seed). Only sockets with "widget" consume
                    # a value from the serialized widget array.
                    if name in sockets and not sockets[name].get("widget") and name not in inputs:
                        continue
                    if name not in inputs and is_widget(spec):
                        if index >= len(widgets):
                            raise RuntimeError(f"{cls}.{name}: not enough widget values")
                        inputs[name] = widgets[index]
                        index += 1
            if index != len(widgets):
                raise RuntimeError(f"{cls}: used {index}/{len(widgets)} widget values")
        for group in ("required", "optional"):
            for name, spec in (info["input"].get(group) or {}).items():
                if (name in inputs and spec[0] == "COMBO"
                        and isinstance(spec[1], dict) and "options" in spec[1]
                        and inputs[name] not in spec[1]["options"]):
                    raise RuntimeError(f"{cls}.{name}: selected option is not installed")
        prompt[str(nid)] = {"class_type": cls, "inputs": inputs}
    return prompt


def source_project():
    return data(http("/h3lab/project?id=" + SOURCE_PROJECT))


def test_project():
    try:
        existing = data(http("/h3lab/project?id=" + TEST_PROJECT))
        if isinstance(existing, dict) and existing.get("id") == TEST_PROJECT:
            return existing
    except (urllib.error.HTTPError, KeyError, ValueError, RuntimeError):
        pass
    project = source_project()
    if not project.get("segments"):
        raise RuntimeError("Source project has no segments")
    project["segments"] = project["segments"][:1]
    clone = data(http("/h3lab/project/duplicate", {
        "project": project, "new_id": TEST_PROJECT, "name": "Sigma A/B - TEST (do not edit)",
    }))
    clone["segments"] = clone["segments"][:1]
    clone["end"] = 0
    clone["result"] = None
    for seg in clone["segments"]:
        seg["freeze"] = False
        seg["locked"] = False
        seg["takes"] = []
        seg["active_take"] = None
        seg["result"] = None
    clone["settings"]["cache"] = True
    clone["settings"]["_ab_test_namespace"] = TEST_PROJECT
    clone["settings"]["resume_only"] = False
    clone["settings"].pop("_ab_high_sigmas", None)
    clone["run"] = {"upto": 0, "only": 0, "operation": "generate", "kind": ""}
    data(http("/h3lab/project/save", {"project": clone, "meta": {}}))
    return clone


def prepare(project, profile):
    project = json.loads(json.dumps(project))
    project["segments"] = project["segments"][:1]
    project["end"] = 0
    project["settings"]["cache"] = True
    project["settings"]["_ab_test_namespace"] = TEST_PROJECT
    project["settings"]["resume_only"] = False
    project["settings"].pop("_ab_high_sigmas", None)
    if profile == "karras7":
        project["settings"]["_ab_high_sigmas"] = "karras7"
    project["run"] = {"upto": 0, "only": 0, "operation": "generate", "kind": ""}
    return project


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", choices=("normal", "karras7"))
    args = parser.parse_args()
    prompt = convert_workflow(WORKFLOW)
    if not args.submit:
        print("DRY RUN OK:", len(prompt), "registered nodes; no writes or generation")
        print("Active node types:", ", ".join(sorted({n["class_type"] for n in prompt.values()})))
        return
    q = http("/queue")
    if q.get("queue_running") or q.get("queue_pending"):
        raise RuntimeError("ComfyUI queue is not empty; refusing to submit")
    project = prepare(test_project(), args.submit)
    prompt[str(ROOT_NODE)]["inputs"]["project"] = json.dumps(project, ensure_ascii=False)
    result = http("/prompt", {
        "prompt": prompt, "client_id": "h3zs-sigma-ab-test",
    })
    if result.get("error"):
        raise RuntimeError(str(result["error"]))
    print("SUBMITTED:", args.submit, result.get("prompt_id"), "project", project["id"])


if __name__ == "__main__":
    main()
