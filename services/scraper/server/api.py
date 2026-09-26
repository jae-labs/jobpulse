"""HTTP REST API server for local dashboard and integrations."""

from __future__ import annotations

import gzip
import hmac
import json
import os
import re
import time
import urllib.parse
from collections import Counter
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from config.loader import get_employers_tuples, load_profile
from database.client import get_supabase, utc_now
from pipeline.runner import synchronize

GLOBAL_DATA_VERSION = int(time.time() * 1000)
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
ALLOWED_ORIGIN_SUFFIX = ".ngrok-free.app"
MAX_PAGE_SIZE = 100
MAX_REQUEST_BYTES = 64 * 1024


class ApiHandler(BaseHTTPRequestHandler):
    """REST API request handler for JobPulse backed directly by Supabase."""

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{datetime.now().isoformat()}] {format % args}", flush=True)

    def _cors_origin(self) -> str:
        origin = self.headers.get("Origin", "").strip()
        if not origin:
            return ""
        if origin in ALLOWED_ORIGINS:
            return origin
        try:
            parsed = urllib.parse.urlparse(origin)
            hostname = (parsed.hostname or "").lower()
            if hostname.endswith(ALLOWED_ORIGIN_SUFFIX):
                return origin
        except Exception:
            pass
        return ""

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        accept_encoding = self.headers.get("Accept-Encoding", "")
        use_gzip = "gzip" in accept_encoding and len(body) > 500

        if use_gzip:
            gz = gzip.compress(body)
            if len(gz) < len(body):
                body = gz
            else:
                use_gzip = False

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")

        allowed_origin = self._cors_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, ngrok-skip-browser-warning, Authorization, Accept, Origin, X-Requested-With",
            )
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0))
        if length < 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("Invalid request size")
        payload = json.loads(self.rfile.read(length)) if length else {}
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        return payload

    def _authorized(self) -> bool:
        """Allow loopback access or require a configured bearer token."""
        token = os.environ.get("JOBPULSE_API_TOKEN", "")
        client_ip = self.client_address[0] if self.client_address else ""
        if not token:
            return client_ip in {"127.0.0.1", "::1"}
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        return bool(supplied) and hmac.compare_digest(supplied, token)

    def _require_write_authorization(self) -> bool:
        if self._authorized():
            return True
        self.send_json({"error": "Write authorization required"}, HTTPStatus.UNAUTHORIZED)
        return False

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        allowed_origin = self._cors_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, ngrok-skip-browser-warning, Authorization, Accept, Origin, X-Requested-With",
            )
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self) -> None:
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/health":
            self.send_json({"status": "ok", "timestamp": utc_now()})
            return

        if path == "/api/version":
            self.send_json(
                {
                    "version": f"{GLOBAL_DATA_VERSION}",
                    "timestamp": utc_now(),
                }
            )
            return

        if not self._authorized():
            self.send_json({"error": "Authorization required"}, HTTPStatus.UNAUTHORIZED)
            return

        supabase = get_supabase()

        if path == "/api/profile":
            user_id = query_params.get("user_id", [None])[0]
            self.send_json(load_profile(user_id=user_id))
            return

        if path == "/api/jobs":
            include_full = query_params.get("full", ["false"])[0].lower() in ("true", "1")
            status_filter = query_params.get("status", [None])[0]
            domain_filter = query_params.get("domain", [None])[0]
            limit = query_params.get("limit", [None])[0]
            offset = query_params.get("offset", [0])[0]

            cols = (
                "*"
                if include_full
                else "id, dedupe_key, title, company, location, employment_type, salary_text, url, source, relevance, matched_skills, fit_tier, role_domain, seniority_level, status, last_seen_at"
            )
            query = supabase.table("jobs").select(cols)

            if status_filter and status_filter != "all":
                query = query.eq("status", status_filter)
            if domain_filter and domain_filter != "all":
                query = query.eq("role_domain", domain_filter)

            query = query.order("relevance", desc=True).order("last_seen_at", desc=True)

            if limit is not None:
                try:
                    start = max(0, int(offset))
                    page_size = min(MAX_PAGE_SIZE, max(1, int(limit)))
                    end = start + page_size - 1
                    query = query.range(start, end)
                except ValueError:
                    pass

            res = query.execute()
            self.send_json(res.data or [])
            return

        if path.startswith("/api/jobs/"):
            match = re.fullmatch(r"/api/jobs/(\d+)", path)
            if match:
                job_id = int(match.group(1))
                res = supabase.table("jobs").select("*").eq("id", job_id).limit(1).execute()
                if not res.data:
                    self.send_json({"error": "Job not found"}, HTTPStatus.NOT_FOUND)
                    return
                self.send_json(res.data[0])
            else:
                self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return

        if path == "/api/sources":
            res = supabase.table("sources").select("*").order("id").execute()
            self.send_json(res.data or [])
            return

        if path == "/api/employers":
            res = supabase.table("employers").select("*").order("priority", desc=True).order("name").execute()
            self.send_json(res.data or [])
            return

        if path == "/api/dashboard":
            res = supabase.table("jobs").select("status").execute()
            counts = Counter(r.get("status") for r in (res.data or []) if r.get("status"))
            employers_count = len(get_employers_tuples())
            self.send_json(
                {
                    "total": len(res.data or []),
                    "counts": dict(counts),
                    "employers": employers_count,
                }
            )
            return

        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        global GLOBAL_DATA_VERSION
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/sync"):
            if not self._require_write_authorization():
                return
            try:
                payload = self.read_json()
            except (ValueError, json.JSONDecodeError):
                self.send_json({"error": "Invalid JSON request"}, HTTPStatus.BAD_REQUEST)
                return
            employer = payload.get("employer")
            limit = payload.get("limit")
            full = payload.get("full", True)
            if (
                (employer is not None and not isinstance(employer, str))
                or (limit is not None and (not isinstance(limit, int) or isinstance(limit, bool) or limit < 1))
                or not isinstance(full, bool)
            ):
                self.send_json({"error": "Invalid sync parameters"}, HTTPStatus.BAD_REQUEST)
                return
            sync_result = synchronize(employer=employer, limit=limit, full=full)
            GLOBAL_DATA_VERSION = int(time.time() * 1000)
            self.send_json(sync_result)
        else:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        global GLOBAL_DATA_VERSION
        path = self.path.split("?", 1)[0]
        match = re.fullmatch(r"/api/jobs/(\d+)", path)
        if not match:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        if not self._require_write_authorization():
            return
        try:
            payload = self.read_json()
            status = payload["status"]
        except (KeyError, ValueError, json.JSONDecodeError):
            self.send_json({"error": "A status is required"}, HTTPStatus.BAD_REQUEST)
            return
        valid_statuses = {"new", "applied", "interviewing", "interested", "not_interested"}
        if not isinstance(status, str) or status not in valid_statuses:
            self.send_json({"error": f"Invalid status: {status}"}, HTTPStatus.BAD_REQUEST)
            return
        job_id = int(match.group(1))
        supabase = get_supabase()
        res = supabase.table("jobs").update({"status": status}).eq("id", job_id).execute()
        if not res.data:
            self.send_json({"error": "Job not found"}, HTTPStatus.NOT_FOUND)
            return
        GLOBAL_DATA_VERSION = int(time.time() * 1000)
        self.send_json({"id": job_id, "status": status, "success": True, "version": GLOBAL_DATA_VERSION})


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run local API server."""
    server = ThreadingHTTPServer((host, port), ApiHandler)
    print(f"JobPulse API running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
