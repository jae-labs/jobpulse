"""Browser assets render without blocking pacing, repeated navigation or unbounded requests."""

import asyncio
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import AsyncMock, MagicMock

import pytest

from jobpulse_scraper.network import browser, request_policy
from jobpulse_scraper.network.ledger import RequestLedger, source_key


def test_nonessential_browser_requests_are_blocked_before_denial_learning():
    assert browser.should_block_browser_request("document", "player.vimeo.com")
    assert browser.should_block_browser_request("script", "www.google-analytics.com")
    assert browser.should_block_browser_request("image", "jobs.example.test")
    assert not browser.should_block_browser_request("document", "jobs.example.test")
    assert not browser.should_block_browser_request("xhr", "jobs.example.test")


def test_navigation_is_single_domcontentloaded_attempt(monkeypatch):
    page = MagicMock()
    page.goto = AsyncMock(side_effect=RuntimeError("synthetic timeout"))
    monkeypatch.setattr(browser.gate, "check", lambda _: None)
    monkeypatch.setattr(browser, "with_browser", lambda action: asyncio.run(action(page)))
    with pytest.raises(RuntimeError, match="synthetic timeout"):
        browser.fetch_browser_response("https://example.invalid", wait_for_idle=True)
    page.goto.assert_awaited_once_with("https://example.invalid", wait_until="domcontentloaded", timeout=30000)


@pytest.mark.parametrize("asset_count,exhausted", [(12, False), (140, True)])
def test_real_browser_renders_paced_assets_and_bounds_remote_requests(monkeypatch, tmp_path, asset_count, exhausted):
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            received.append(self.path)
            if self.path == "/":
                body = (
                    "<html><body>"
                    + "".join(f'<script src="/asset/{i}.js"></script>' for i in range(asset_count))
                    + '<script src="https://www.google-analytics.com/synthetic.js"></script>'
                    + '<iframe src="https://player.vimeo.com/video/synthetic"></iframe>'
                    + '<script>fetch("/api/jobs").then(r=>r.json()).then(j=>document.body.dataset.job=j.title)</script>'
                    + "</body></html>"
                ).encode()
                content_type = "text/html"
            elif self.path.startswith("/asset/"):
                body, content_type = b"window.syntheticAssetLoaded=true;", "application/javascript"
            else:
                body, content_type = b'{"title":"Synthetic Engineer"}', "application/json"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setattr(request_policy, "STATE_PATH", tmp_path / "cooldowns.json")
    monkeypatch.setattr(
        browser.gate, "settings", lambda _: {"min_interval_seconds": 0.01, "block_cooldown_seconds": 900}
    )
    url = f"http://127.0.0.1:{server.server_port}/"

    async def action(page):
        await page.goto(url, wait_until="domcontentloaded", timeout=10000)
        if not exhausted:
            await page.wait_for_function('document.body.dataset.job === "Synthetic Engineer"', timeout=5000)
        return await page.content()

    token = source_key.set("synthetic-browser")
    try:
        if exhausted:
            with pytest.raises(browser.BrowserRequestBudgetExceeded):
                browser.with_browser(action)
            assert len(received) <= browser.MAX_BROWSER_REQUESTS
        else:
            assert "Synthetic Engineer" in browser.with_browser(action)
            assert received.count("/") == 1 and "/api/jobs" in received
            assert len(received) == asset_count + 2
            summary = RequestLedger((tmp_path / "cooldowns.json").with_suffix(".sqlite3")).summary()
            assert all(row["source"] == "synthetic-browser" for row in summary)
    finally:
        source_key.reset(token)
        server.shutdown()
        server.server_close()
        thread.join()
