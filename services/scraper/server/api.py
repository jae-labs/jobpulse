"""HTTP REST API server for local dashboard and integrations."""

from __future__ import annotations

import gzip
import hmac
import json
import os
import re
import threading
import time
import urllib.parse
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from postgrest.types import CountMethod

from config.loader import get_employers_tuples
from database.client import get_supabase, utc_now
from database.records import response_records
from pipeline.runner import synchronize

GLOBAL_DATA_VERSION = int(time.time() * 1000)
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
# Presence of any of these means the request arrived through a proxy or tunnel, so
# the peer address is not the true client and loopback trust must not apply.
FORWARDED_HEADERS = (
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "Forwarded",
    "X-Real-IP",
    "CF-Connecting-IP",
    "X-Original-Forwarded-For",
)
MAX_PAGE_SIZE = 100
MAX_REQUEST_BYTES = 64 * 1024
SYNC_LOCK = threading.Lock()


class ApiHandler(BaseHTTPRequestHandler):
    """REST API request handler for JobPulse backed directly by Supabase."""

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{datetime.now().isoformat()}] {format % args}", flush=True)

    def _cors_origin(self) -> str:
        origin = self.headers.get("Origin", "").strip()
        if not origin:
            return ""
        configured_origin = os.environ.get("JOBPULSE_ALLOWED_ORIGIN", "").strip()
        if origin in ALLOWED_ORIGINS or (configured_origin and origin == configured_origin):
            return origin
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
        self.send_header("Vary", "Origin, Accept-Encoding")

        allowed_origin = self._cors_origin()
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, ngrok-skip-browser-warning, Authorization, Accept, Origin, X-Requested-With",
            )
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

    def _is_direct_loopback(self) -> bool:
        """Trust loopback only for a direct request, never through a proxy or tunnel."""
        client_ip = self.client_address[0] if self.client_address else ""
        if client_ip not in {"127.0.0.1", "::1"}:
            return False
        if any(self.headers.get(header) for header in FORWARDED_HEADERS):
            return False
        host = (self.headers.get("Host") or "").strip()
        if host.startswith("["):
            host = host[1 : host.find("]")] if "]" in host else host
        else:
            host = host.split(":", 1)[0]
        return host.lower() in {"127.0.0.1", "localhost", "::1"}

    def _authorized(self) -> bool:
        """Reject untrusted browser origins before checking loopback/token access."""
        origin = self.headers.get("Origin")
        if origin is not None and not self._cors_origin():
            return False
        token = os.environ.get("JOBPULSE_API_TOKEN", "")
        if not token:
            return self._is_direct_loopback() and (origin is None or origin.strip() in ALLOWED_ORIGINS)
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return False
        supplied = authorization.removeprefix("Bearer ").strip()
        return bool(supplied) and hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8"))

    def _require_write_authorization(self) -> bool:
        if self._authorized():
            return True
        self.send_json({"error": "Write authorization required"}, HTTPStatus.UNAUTHORIZED)
        return False

    def do_OPTIONS(self) -> None:
        allowed_origin = self._cors_origin()
        if self.headers.get("Origin") is not None and not allowed_origin:
            self.send_json({"error": "Origin not allowed"}, HTTPStatus.FORBIDDEN)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Vary", "Origin")
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, ngrok-skip-browser-warning, Authorization, Accept, Origin, X-Requested-With",
            )
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

        if path == "/api/jobs":
            include_full = query_params.get("full", ["false"])[0].lower() in ("true", "1")
            if query_params.get("status", ["all"])[0] != "all":
                self.send_json(
                    {"error": "Status filtering requires a candidate; use get_jobs_page."}, HTTPStatus.BAD_REQUEST
                )
                return
            domain_filter = query_params.get("domain", [None])[0]
            limit = query_params.get("limit", [None])[0]
            offset = query_params.get("offset", [0])[0]

            cols = (
                "*"
                if include_full
                else "id, dedupe_key, title, company, location, employment_type, salary_text, url, source, last_seen_at"
            )
            query = supabase.table("jobs").select(cols)

            if domain_filter and domain_filter != "all":
                self.send_json(
                    {"error": "Domain filtering requires a candidate evaluation; use get_jobs_page."},
                    HTTPStatus.BAD_REQUEST,
                )
                return

            query = query.order("last_seen_at", desc=True).order("id", desc=True)

            if limit is not None:
                try:
                    start = max(0, int(offset))
                    page_size = min(MAX_PAGE_SIZE, max(1, int(limit)))
                    end = start + page_size - 1
                    query = query.range(start, end)
                except ValueError:
                    pass

            res = query.execute()
            self.send_json(response_records(res.data))
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
            self.send_json(response_records(res.data))
            return

        if path == "/api/employers":
            res = supabase.table("employers").select("*").order("priority", desc=True).order("name").execute()
            self.send_json(response_records(res.data))
            return

        if path == "/api/dashboard":
            res = supabase.table("jobs").select("id", count=CountMethod.exact, head=True).execute()
            employers_count = len(get_employers_tuples())
            self.send_json(
                {
                    "total": res.count or 0,
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
            if not SYNC_LOCK.acquire(blocking=False):
                self.send_json({"error": "A sync is already running. Retry after it completes."}, HTTPStatus.CONFLICT)
                return
            try:
                sync_result = synchronize(employer=employer, limit=limit, full=full)
            except RuntimeError:
                self.send_json(
                    {
                        "error": "Sync did not complete; persisted vacancies were retained. Retry the sync for incomplete vacancies."
                    },
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
                return
            finally:
                SYNC_LOCK.release()
            GLOBAL_DATA_VERSION = int(time.time() * 1000)
            status = HTTPStatus.OK
            if sync_result.get("status") == "incomplete":
                status = HTTPStatus.MULTI_STATUS if sync_result.get("added", 0) else HTTPStatus.SERVICE_UNAVAILABLE
            self.send_json(sync_result, status)
        else:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run local API server."""
    server = ThreadingHTTPServer((host, port), ApiHandler)
    print(f"JobPulse API running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
