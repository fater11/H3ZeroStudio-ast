"""v6n: optional on-demand start of a local LLM server (llama.cpp llama-server, a .bat / .exe / any command).

Off by default: with no command (or the toggle off) nothing here runs — no probe, no wait, no kill; the assistant talks
to its API exactly as before. The command lives only in the Lab's local file output/h3labstudio/_launcher.json, set from
the Assistant settings — never in project data and never taken from a chat / connect request, so a shared project
cannot make this machine run anything.

When on: before an assistant request, if the API does not answer, the command is started (Windows: hidden console, own
process group, inside a Job Object with kill-on-close) and the API is polled (GET /models) until it answers or the
timeout passes. Only the process tree Lab started is ever killed: on a generation start (video / face refine / upscale
all go through h3s_gen.run_project), on «Закрыть сейчас», on ComfyUI exit (atexit + the job handle closing). A server
that was already running is detected by the probe and left alone.
"""
import atexit
import json
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

WIN = os.name == "nt"
CREATE_NO_WINDOW = 0x08000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
DEFAULT_TIMEOUT = 180
PROBE_TIMEOUT = 2.0
LOG_TAIL = 1500

_lock = threading.RLock()        # state
_launch_lock = threading.Lock()  # one launch at a time
STATE = {"proc": None, "job": None, "pid": None, "state": "idle", "since": None, "error": "", "reason": "", "log": ""}


def log(msg):
    print(f"[H3ZS] llm launcher: {msg}", flush=True)


# ---------------------------------------------------------------- config (local file only)
def config_path():
    try:
        import folder_paths
        root = folder_paths.get_output_directory()
    except Exception:
        root = tempfile.gettempdir()
    return os.path.join(root, "h3labstudio", "_launcher.json")


def normalize_config(c):
    c = c if isinstance(c, dict) else {}
    try:
        t = int(float(c.get("timeout") or DEFAULT_TIMEOUT))
    except (TypeError, ValueError):
        t = DEFAULT_TIMEOUT
    return {"cmd": str(c.get("cmd") or "").strip()[:2000], "on_demand": c.get("on_demand") is True,
            "timeout": max(10, min(1800, t))}


def get_config():
    try:
        with open(config_path(), encoding="utf-8") as f:
            return normalize_config(json.load(f))
    except (OSError, ValueError):
        return normalize_config({})


def set_config(values):
    cur = get_config()
    cur.update({k: v for k, v in (values or {}).items() if k in ("cmd", "on_demand", "timeout")})
    cur = normalize_config(cur)
    path = config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cur, f, ensure_ascii=False)
    os.replace(tmp, path)
    return cur


def enabled(cfg=None):
    cfg = cfg or get_config()
    return bool(cfg["cmd"] and cfg["on_demand"])


# ---------------------------------------------------------------- command line
def build_command(cmd):
    """(args, shell, cwd) for a .bat/.cmd, .exe, .ps1 or a free command line."""
    raw = cmd.strip()
    path = raw[1:-1] if len(raw) > 1 and raw[0] == raw[-1] == '"' else raw
    if os.path.isfile(path):
        ext, cwd = os.path.splitext(path)[1].lower(), os.path.dirname(os.path.abspath(path))
        if WIN and ext in (".bat", ".cmd"):
            return ["cmd.exe", "/d", "/c", "call", path], False, cwd
        if ext == ".ps1":
            return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path], False, cwd
        if not WIN and ext in (".sh", ""):
            return ["/bin/sh", path] if not os.access(path, os.X_OK) else [path], False, cwd
        return [path], False, cwd
    return raw, True, None


def log_path():
    return os.path.join(tempfile.gettempdir(), "h3lab_llm_server.log")


def log_tail(n=LOG_TAIL):
    try:
        with open(log_path(), "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - n))
            return f.read().decode("utf-8", "replace").strip()
    except OSError:
        return ""


# ---------------------------------------------------------------- Windows job object (kill the tree with ComfyUI)
def _win_job(pid):
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in ("r", "w", "o", "rb", "wb", "ob")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

        class EXT(ctypes.Structure):
            _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.OpenProcess.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        if not job:
            return None
        info = EXT()
        info.Basic.LimitFlags = 0x2000   # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(wintypes.HANDLE(job), 9, ctypes.byref(info), ctypes.sizeof(info))
        hp = k32.OpenProcess(0x0101, False, int(pid))   # PROCESS_SET_QUOTA | PROCESS_TERMINATE
        ok = bool(hp) and k32.AssignProcessToJobObject(wintypes.HANDLE(job), wintypes.HANDLE(hp))
        if hp:
            k32.CloseHandle(wintypes.HANDLE(hp))
        if not ok:
            k32.CloseHandle(wintypes.HANDLE(job))
            return None
        return job
    except Exception as e:
        log(f"job object unavailable ({e}); taskkill /T still applies")
        return None


def _win_job_close(job, terminate=True):
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32")
        if terminate:
            k32.TerminateJobObject(wintypes.HANDLE(job), 1)
        k32.CloseHandle(wintypes.HANDLE(job))
    except Exception:
        pass


def _win_job_active(job):
    """Processes still alive in the job (a .bat that `start`s the server exits while the server runs)."""
    try:
        import ctypes
        from ctypes import wintypes

        class ACC(ctypes.Structure):
            _fields_ = [("a", ctypes.c_int64), ("b", ctypes.c_int64), ("c", ctypes.c_int64), ("d", ctypes.c_int64),
                        ("TotalPageFaultCount", wintypes.DWORD), ("TotalProcesses", wintypes.DWORD),
                        ("ActiveProcesses", wintypes.DWORD), ("TotalTerminatedProcesses", wintypes.DWORD)]
        acc = ACC()
        if ctypes.WinDLL("kernel32").QueryInformationJobObject(wintypes.HANDLE(job), 1, ctypes.byref(acc), ctypes.sizeof(acc), None):
            return int(acc.ActiveProcesses)
    except Exception:
        pass
    return None


def _alive():
    """Is anything Lab started still running?"""
    p = STATE["proc"]
    if p is None:
        return False
    if p.poll() is None:
        return True
    if WIN and STATE["job"]:
        n = _win_job_active(STATE["job"])
        return bool(n) if n is not None else p.returncode == 0
    if WIN:
        return p.returncode == 0   # no job: a .bat that `start`ed the server exits 0 — cannot tell, keep waiting
    if not WIN:
        try:
            os.killpg(p.pid, 0)
            return True
        except (ProcessLookupError, PermissionError, OSError):
            return False
    return False


# ---------------------------------------------------------------- probe / start / stop
def probe(base, api_key="", timeout=PROBE_TIMEOUT):
    """'up' (answers: 2xx, or 401/403 = up but wants a key), 'loading' (503 — llama-server loading the model), 'down'."""
    from . import h3s_llm
    try:
        b = h3s_llm.api_base(base)
    except Exception:
        return "down"
    headers = {"Accept": "application/json", "User-Agent": "H3ZeroStudio/1.0"}
    if api_key:
        headers["Authorization"] = "Bearer " + api_key
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(urllib.request.Request(b + "/models", headers=headers), timeout=timeout) as r:
            r.read(256)
        return "up"
    except urllib.error.HTTPError as e:
        return "loading" if e.code >= 500 else "up"
    except Exception:
        return "down"


def start(cfg=None):
    cfg = cfg or get_config()
    if not cfg["cmd"]:
        raise RuntimeError("Не указана команда запуска модели")
    args, shell, cwd = build_command(cfg["cmd"])
    out = open(log_path(), "ab")
    out.write(f"\n==== {time.strftime('%Y-%m-%d %H:%M:%S')} start: {cfg['cmd']}\n".encode("utf-8"))
    out.flush()
    kw = {"stdin": subprocess.DEVNULL, "stdout": out, "stderr": subprocess.STDOUT, "cwd": cwd, "shell": shell}
    if WIN:
        kw["creationflags"] = CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    else:
        kw["start_new_session"] = True
    try:
        p = subprocess.Popen(args, **kw)
    finally:
        out.close()
    with _lock:
        STATE.update(proc=p, pid=p.pid, job=_win_job(p.pid) if WIN else None, state="starting", since=time.time(), error="", reason="")
    log(f"started pid {p.pid}: {cfg['cmd']}")
    return p.pid


def stop(reason="button"):
    """Kill the process tree Lab started (never anything else). Returns {"stopped": bool}."""
    with _lock:
        p, job = STATE["proc"], STATE["job"]
        if p is None:
            return {"stopped": False, "state": STATE["state"]}
        pid = p.pid
        try:
            if WIN:
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=CREATE_NO_WINDOW, timeout=20)
                if job:
                    _win_job_close(job, terminate=True)   # orphans whose parent (the .bat) already exited
            else:
                import signal
                try:
                    os.killpg(pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError, OSError):
                    pass
            try:
                p.wait(timeout=10)
            except Exception:
                pass
        finally:
            STATE.update(proc=None, job=None, pid=None, state="stopped", since=time.time(), reason=str(reason))
    log(f"closed the model server (pid {pid}, {reason})")
    return {"stopped": True, "pid": pid, "reason": reason}


def ensure(base, api_key="", on_launch=None, cfg=None):
    """Make the API answer, starting the configured command when needed.
    Returns {"launched": bool, ...}; does nothing at all (no probe) when the launcher is off."""
    cfg = cfg or get_config()
    if not enabled(cfg):
        return {"launched": False, "enabled": False}
    if probe(base, api_key) == "up":
        with _lock:
            if STATE["proc"] is not None and STATE["state"] == "starting":
                STATE["state"] = "running"
        return {"launched": False, "enabled": True, "running": True}
    with _launch_lock:
        first = probe(base, api_key)
        if first == "up":
            return {"launched": False, "enabled": True, "running": True}
        with _lock:
            ours = STATE["proc"] is not None and _alive()
        if first == "loading" and not ours:   # someone else's server, still loading: wait for it, never start another
            deadline = time.monotonic() + cfg["timeout"]
            while time.monotonic() < deadline:
                time.sleep(0.5)
                if probe(base, api_key) == "up":
                    return {"launched": False, "enabled": True, "running": True}
            raise RuntimeError(f"Сервер модели не загрузился за {cfg['timeout']} с")
        if on_launch:
            try:
                on_launch()
            except Exception:
                pass
        if not ours:
            if STATE["proc"] is not None:   # ours, but dead: drop it first
                stop("restart")
            start(cfg)
        deadline = time.monotonic() + cfg["timeout"]
        while time.monotonic() < deadline:
            st = probe(base, api_key)
            if st == "up":
                with _lock:
                    STATE["state"] = "running"
                log(f"model server ready in {time.time() - (STATE['since'] or time.time()):.1f} s")
                return {"launched": True, "enabled": True, "running": True, "pid": STATE["pid"]}
            with _lock:
                dead = STATE["proc"] is not None and not _alive()
            if dead:
                tail = log_tail(600)
                with _lock:
                    STATE.update(state="error", error="process exited")
                stop("exited")
                with _lock:
                    STATE["state"] = "error"
                raise RuntimeError("Процесс модели завершился, не открыв API" + (f". Лог:\n{tail}" if tail else f" (лог: {log_path()})"))
            time.sleep(0.5)
        stop("timeout")
        with _lock:
            STATE.update(state="error", error="timeout")
        raise RuntimeError(f"Модель не ответила за {cfg['timeout']} с — процесс закрыт. Лог: {log_path()}")


def status():
    cfg = get_config()
    with _lock:
        alive = _alive()
        st = STATE["state"]
        if STATE["proc"] is not None and not alive and st in ("starting", "running"):
            st = "exited"
        return {**cfg, "enabled": enabled(cfg), "state": st if STATE["proc"] is not None or st in ("stopped", "error") else "idle",
                "owned": STATE["proc"] is not None and alive, "pid": STATE["pid"], "since": STATE["since"],
                "error": STATE["error"], "reason": STATE["reason"], "log": log_path(), "platform": sys.platform}


atexit.register(lambda: stop("ComfyUI exit") if STATE["proc"] is not None else None)
