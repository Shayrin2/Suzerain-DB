#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 - "$project_dir" <<'PY'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
import threading
import webbrowser

handler = partial(SimpleHTTPRequestHandler, directory=sys.argv[1])
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Suzerain is available at {url}", flush=True)
    print("Keep this window open while using the app. Press Ctrl+C to stop.", flush=True)
    threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
PY
