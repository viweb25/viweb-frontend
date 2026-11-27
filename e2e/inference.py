"""Deterministic HTTP inference fixture for one seeded model."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

FIXTURE = json.loads(Path(__file__).with_name("fixture.json").read_text())
ORG = FIXTURE["owner"]["workspaceId"]
MODEL = FIXTURE["program"]["modelJobId"]
PREVIEW = f"/api/v1/demo/trained-models/{ORG}/{MODEL}/preview"
DETECTIONS = [
    {"label": "Straight label", "confidence": 0.9, "x1": 0.2, "y1": 0.2, "x2": 0.4, "y2": 0.4},
    {"label": "Straight label", "confidence": 0.4, "x1": 0.6, "y1": 0.6, "x2": 0.8, "y2": 0.8},
]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health/live":
            self.respond({"status": "ok"})
        else:
            self.send_error(404)

    def do_POST(self):
        url = urlsplit(self.path)
        if url.path != PREVIEW:
            self.send_error(404)
            return
        try:
            confidence = float(parse_qs(url.query)["confidence"][0])
            size = int(self.headers["Content-Length"])
        except (KeyError, ValueError, TypeError):
            self.send_error(422)
            return
        if not 0 < size <= 5 * 1024 * 1024 or not 0 <= confidence <= 1:
            self.send_error(422)
            return
        image = self.rfile.read(size)
        if self.headers["Content-Type"] != "image/jpeg" or not (
            image.startswith(b"\xff\xd8\xff") and image.endswith(b"\xff\xd9")
        ):
            self.send_error(422)
            return
        self.respond([box for box in DETECTIONS if box["confidence"] >= confidence])

    def respond(self, value):
        content = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


ThreadingHTTPServer(("0.0.0.0", 8001), Handler).serve_forever()
