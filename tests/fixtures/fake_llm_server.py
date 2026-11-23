"""Fake OpenAI-compatible model server for the launcher tests: `python fake_llm_server.py PORT PIDFILE [DELAY] [LOAD503]`.
Spawns a grandchild (a sleeper) so tree-kill can be checked, waits DELAY s (model «loading»), then serves /v1/models.
With LOAD503 > 0 it first answers 503 for that many seconds (llama-server style loading)."""
import http.server
import json
import os
import subprocess
import sys
import time

port, pidfile = int(sys.argv[1]), sys.argv[2]
delay = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
load503 = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(600)"])
with open(pidfile, "w") as f:
    json.dump({"server": os.getpid(), "child": child.pid}, f)
time.sleep(delay)
t0 = time.time()


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if time.time() - t0 < load503:
            self.send_response(503); self.end_headers(); self.wfile.write(b'{"error":"loading"}'); return
        if self.path.rstrip("/").endswith("/models"):
            body = json.dumps({"data": [{"id": "fake-qwen"}]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *a):
        pass


http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
