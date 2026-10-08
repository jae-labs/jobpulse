"""Playwright headless browser manager with anti-automation flags."""

from __future__ import annotations

from collections.abc import Callable
from email.message import Message
from typing import Any
from urllib.error import HTTPError

from jobpulse_scraper.contracts import FetchResponse
from jobpulse_scraper.network.ledger import source_key
from jobpulse_scraper.network.request_policy import gate

try:
    from playwright.sync_api import sync_playwright

except ImportError:
    sync_playwright = None


COOKIE_BANNER_SELECTORS = [
    "#onetrust-accept-btn-handler",
    "button#onetrust-accept-btn-handler",
    "button[id*='accept' i]",
    "button[class*='accept' i]",
    "button:has-text('Accept All')",
    "button:has-text('Accept all')",
    "button:has-text('Accept Cookies')",
    "button:has-text('Allow all')",
    "button:has-text('I Accept')",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
]


def _dismiss_cookie_banner(page: Any) -> None:
    """Best-effort click of a common cookie/consent banner so it doesn't block the DOM."""
    for selector in COOKIE_BANNER_SELECTORS:
        try:
            locator = page.locator(selector).first
            if locator.is_visible(timeout=500):
                locator.click(timeout=1000)
                return
        except Exception:
            continue


def fetch_browser_response(url: str, timeout: int = 120000, wait_for_idle: bool = False) -> FetchResponse:
    """Fetch a URL with a real headless browser and return (final_url, page_html)."""
    import time

    gate.check(url)

    def _action(page: Any) -> FetchResponse:
        wait_until = "networkidle" if wait_for_idle else "domcontentloaded"
        try:
            response = page.goto(url, wait_until=wait_until, timeout=timeout)
        except Exception:
            gate.check(url)
            if wait_until != "networkidle":
                raise
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        gate.check(url)
        if response is None:
            raise RuntimeError("Browser navigation returned no HTTP response")
        if response.status >= 400:
            raise HTTPError(page.url, response.status, "Browser navigation failed", Message(), None)

        _dismiss_cookie_banner(page)

        # Give SPA / challenge scripts a brief moment to finish
        content = page.content()
        if any(
            marker in content.lower() for marker in ["challenge-container", "awswaf", "cf-challenge", "token.awswaf"]
        ):
            time.sleep(3.5)
            content = page.content()
        elif "phenom" in content.lower() or "search-results" in url.lower():
            time.sleep(3.0)
            content = page.content()
        elif len(content) < 8000:
            time.sleep(1.5)
            content = page.content()

        return FetchResponse(page.url, response.status, content.encode(), "text/html")

    return with_browser(_action)


def fetch_via_browser(url: str, timeout: int = 120000, wait_for_idle: bool = False) -> tuple[str, str]:
    response = fetch_browser_response(url, timeout, wait_for_idle)
    return response.url, response.body.decode()


def with_browser(action: Callable[[Any], Any]) -> Any:
    """Execute an action within a managed, stealth-configured Playwright browser session."""
    if sync_playwright is None:
        raise RuntimeError("Playwright is not installed or available in this environment.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            ignore_https_errors=True,
            locale="en-IE",
            timezone_id="Europe/Dublin",
            viewport={"width": 1280, "height": 800},
        )
        failures: list[Exception] = []
        current_source = source_key.get()

        def pace_route(route: Any) -> None:
            request = route.request
            if request.resource_type in {"image", "font", "media"}:
                route.abort()
                return
            if request.url.startswith(("http://", "https://")):
                try:
                    gate.wait(request.url)
                except Exception as error:
                    failures.append(error)
                    route.abort()
                    return
            route.continue_()

        def observe_response(response: Any) -> None:
            token = source_key.set(current_source)
            try:
                gate.observe(response.url, response.status, response.headers.get("retry-after"))
            finally:
                source_key.reset(token)
            try:
                gate.check(response.url)
            except Exception as error:
                failures.append(error)

        context.route("**/*", pace_route)
        context.on("response", observe_response)
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        try:
            result = action(page)
            if failures:
                raise failures[0]
            return result
        finally:
            browser.close()
