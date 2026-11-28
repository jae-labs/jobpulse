"""Compare execution engines against synthetic ATS, paginated HTML and rendered HTML."""

from __future__ import annotations

import asyncio
import json
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.http import HtmlResponse

from jobpulse_scraper.contracts import FetchResponse, SourceTarget
from jobpulse_scraper.network import request_policy
from jobpulse_scraper.network.transport import BrowserTransport, HttpTransport
from jobpulse_scraper.scrapers.adapters import ADAPTERS

BODY = "Published engineering role in Dublin. " * 30


def posting(number: int) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": f"Engineer {number}",
        "description": BODY,
        "url": f"https://synthetic.invalid/jobs/{number}",
        "hiringOrganization": {"@type": "Organization", "name": "Synthetic"},
        "jobLocation": {
            "@type": "Place",
            "address": {"@type": "PostalAddress", "addressLocality": "Dublin", "addressCountry": "IE"},
        },
    }


class FixtureServer(BaseHTTPRequestHandler):
    denied = 0

    def log_message(self, format: str, *args):
        pass

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/denied":
            type(self).denied += 1
            self.send_response(429)
            self.send_header("Retry-After", "60")
            self.end_headers()
            return
        if path == "/ats":
            body = json.dumps(
                {"jobs": [{"id": 1, "title": "Engineer", "location": {"name": "Dublin"}, "content": BODY}]}
            ).encode()
        elif path == "/browser":
            payload = json.dumps(json.dumps(posting(9)))
            body = (
                "<html><script>setTimeout(()=>{let s=document.createElement('script');"
                "s.type='application/ld+json';s.textContent=" + payload + ";document.head.appendChild(s)},100)"
                "</script></html>"
            ).encode()
        elif path.startswith("/html/"):
            number = int(path.rsplit("/", 1)[1])
            link = f'<a rel="next" href="/html/{number + 1}">Next</a>' if number < 3 else ""
            body = (
                f'<html><script type="application/ld+json">{json.dumps(posting(number))}</script>{link}</html>'.encode()
            )
        else:
            body = b"<html></html>"
        self.send_response(200)
        self.send_header("Content-Type", "application/json" if path == "/ats" else "text/html")
        self.end_headers()
        self.wfile.write(body)


class PolicyMiddleware:
    async def process_request(self, request):
        if request.meta.get("browser"):
            response = await asyncio.to_thread(BrowserTransport().fetch, request.url)
            return HtmlResponse(
                response.url, status=response.status, body=response.body, encoding="utf-8", request=request
            )
        await asyncio.to_thread(request_policy.gate.wait, request.url)
        return None

    def process_response(self, request, response):
        if not request.meta.get("browser"):
            retry = response.headers.get("Retry-After")
            request_policy.gate.observe(response.url, response.status, retry.decode() if retry else None)
        return response


class PilotSpider(scrapy.Spider):
    name = "synthetic_architecture_pilot"

    def __init__(self, origin: str, denied_origin: str, results: list, failures: list, **kwargs):
        super().__init__(**kwargs)
        self.origin, self.denied_origin, self.results, self.failures = origin, denied_origin, results, failures

    async def start(self):
        for path, provider in [("/ats", "greenhouse"), ("/html/1", "jsonld"), ("/browser", "jsonld")]:
            yield scrapy.Request(
                self.origin + path,
                callback=self.parse,
                errback=self.failed,
                meta={"provider": provider, "browser": path == "/browser"},
            )
        for _ in range(2):
            yield scrapy.Request(
                self.denied_origin + "/denied",
                callback=self.parse,
                errback=self.failed,
                dont_filter=True,
                meta={"provider": "jsonld"},
            )

    def parse(self, response):
        target = SourceTarget(response.meta["provider"], "Synthetic", response.url, "synthetic")
        jobs = ADAPTERS[target.provider].parser(target, FetchResponse(response.url, response.status, response.body))
        self.results.extend(job.as_record() for job in jobs)
        for href in response.css('a[rel="next"]::attr(href)').getall():
            yield response.follow(href, callback=self.parse, errback=self.failed, meta={"provider": "jsonld"})

    def failed(self, failure):
        self.failures.append(type(failure.value).__name__)


def main():
    with tempfile.TemporaryDirectory(prefix="jobpulse-pilot-") as directory:
        server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureServer)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        denied_origin = f"http://localhost:{server.server_port}"
        request_policy.gate.settings = lambda url: {"min_interval_seconds": 1, "block_cooldown_seconds": 60}
        report = {}
        from jobpulse_scraper.network.ledger import RequestLedger, source_key

        source_key.set("synthetic-pilot")
        baseline = []
        failures = []
        request_policy.STATE_PATH = Path(directory) / "composed.json"
        start = time.monotonic()
        for path, provider in [
            ("/ats", "greenhouse"),
            ("/html/1", "jsonld"),
            ("/html/2", "jsonld"),
            ("/html/3", "jsonld"),
            ("/browser", "jsonld"),
        ]:
            target = SourceTarget(provider, "Synthetic", origin + path, "synthetic")
            response = (BrowserTransport() if path == "/browser" else HttpTransport()).fetch(target.url)
            baseline.extend(job.as_record() for job in ADAPTERS[provider].parser(target, response))
        observations = RequestLedger(request_policy.STATE_PATH.with_suffix(".sqlite3")).summary()
        if not observations or any(row["source"] != "synthetic-pilot" for row in observations):
            raise AssertionError("Browser and HTTP requests retain their source identity")

        for _ in range(2):
            try:
                HttpTransport().fetch(denied_origin + "/denied")
            except Exception as error:
                failures.append(type(error).__name__)
        report["composed"] = {
            "seconds": round(time.monotonic() - start, 3),
            "jobs": len(baseline),
            "failures": failures,
            "remote_denials": FixtureServer.denied,
        }
        FixtureServer.denied = 0
        request_policy.STATE_PATH = Path(directory) / "scrapy.json"
        results = []
        failures = []
        start = time.monotonic()
        process = CrawlerProcess(
            {
                "LOG_ENABLED": False,
                "ROBOTSTXT_OBEY": False,
                "RETRY_ENABLED": False,
                "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
                "DOWNLOAD_TIMEOUT": 120,
                "DOWNLOADER_MIDDLEWARES": {"__main__.PolicyMiddleware": 50},
            }
        )
        process.crawl(PilotSpider, origin=origin, denied_origin=denied_origin, results=results, failures=failures)
        process.start()
        report["scrapy"] = {
            "seconds": round(time.monotonic() - start, 3),
            "jobs": len(results),
            "failures": failures,
            "remote_denials": FixtureServer.denied,
        }
        report["parser_parity"] = sorted(baseline, key=lambda row: row["url"]) == sorted(
            results, key=lambda row: row["url"]
        )
        server.shutdown()
        thread.join()
        server.server_close()
        print(json.dumps(report, indent=2))
        if not report["parser_parity"] or len(results) != 5 or FixtureServer.denied != 1:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
