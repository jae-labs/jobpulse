"""Playwright headless browser manager with anti-automation flags."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from email.message import Message
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlsplit

from jobpulse_scraper.contracts import FetchResponse
from jobpulse_scraper.network.experience import event, run_key
from jobpulse_scraper.network.ledger import source_key
from jobpulse_scraper.network.request_policy import gate

try:
    from playwright.async_api import async_playwright

except ImportError:
    async_playwright = None

MAX_BROWSER_REQUESTS = 128
TRACKING_HOSTS = {
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "connect.facebook.net",
    "snap.licdn.com",
    "redditstatic.com",
    "phenomtrackapi.phenompeople.com",
    "bugherd.com",
}
OPTIONAL_MEDIA_HOSTS = {"player.vimeo.com"}


def should_block_browser_request(resource_type: str, host: str) -> bool:
    """Skip nonessential browser assets before they affect source denial learning."""
    normalized_host = host.lower().rstrip(".")
    blocked_hosts = TRACKING_HOSTS | OPTIONAL_MEDIA_HOSTS
    return resource_type in {"image", "font", "media", "ping"} or any(
        normalized_host == blocked or normalized_host.endswith("." + blocked) for blocked in blocked_hosts
    )


class BrowserRequestBudgetExceeded(RuntimeError):
    """A browser session exhausts its bounded remote request budget."""


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


async def _dismiss_cookie_banner(page: Any) -> None:
    """Best-effort click of a common cookie/consent banner so it doesn't block the DOM."""
    for selector in COOKIE_BANNER_SELECTORS:
        try:
            locator = page.locator(selector).first
            if await locator.is_visible(timeout=500):
                await locator.click(timeout=1000)
                return
        except Exception:
            continue


def fetch_browser_response(url: str, timeout: int = 120000, wait_for_idle: bool = False) -> FetchResponse:
    """Fetch a URL with a real headless browser and return (final_url, page_html)."""
    gate.check(url)

    async def _action(page: Any) -> FetchResponse:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=min(timeout, 30000))
        gate.check(url)
        if response is None:
            raise RuntimeError("Browser navigation returned no HTTP response")
        if response.status >= 400:
            raise HTTPError(page.url, response.status, "Browser navigation failed", Message(), None)

        await _dismiss_cookie_banner(page)

        # Give SPA / challenge scripts a brief moment to finish
        content = await page.content()
        if any(
            marker in content.lower() for marker in ["challenge-container", "awswaf", "cf-challenge", "token.awswaf"]
        ):
            await page.wait_for_timeout(3500)
            content = await page.content()
        elif "phenom" in content.lower() or "search-results" in url.lower():
            await page.wait_for_timeout(3000)
            content = await page.content()
        elif wait_for_idle or len(content) < 8000:
            await page.wait_for_timeout(1500)
            content = await page.content()

        return FetchResponse(page.url, response.status, content.encode(), "text/html")

    return with_browser(_action)


def fetch_via_browser(url: str, timeout: int = 120000, wait_for_idle: bool = False) -> tuple[str, str]:
    response = fetch_browser_response(url, timeout, wait_for_idle)
    return response.url, response.body.decode()


def with_browser(action: Callable[[Any], Awaitable[Any]]) -> Any:
    """Execute an action within a managed, stealth-configured Playwright browser session."""
    return asyncio.run(_with_browser(action))


async def _with_browser(action: Callable[[Any], Awaitable[Any]]) -> Any:
    if async_playwright is None:
        raise RuntimeError("Playwright is not installed or available in this environment.")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            ignore_https_errors=True,
            locale="en-IE",
            timezone_id="Europe/Dublin",
            viewport={"width": 1280, "height": 800},
            service_workers="block",
        )
        context.set_default_timeout(15000)
        context.set_default_navigation_timeout(30000)
        failures: list[Exception] = []
        current_source = source_key.get()
        current_run = run_key.get()

        accepted = 0
        asset_slots = asyncio.Semaphore(4)
        active_assets: set[Any] = set()

        def release_asset(request: Any) -> None:
            if request in active_assets:
                active_assets.remove(request)
                asset_slots.release()

        async def pace_route(route: Any) -> None:
            nonlocal accepted
            request = route.request
            host = (urlsplit(request.url).hostname or "").lower()
            if should_block_browser_request(request.resource_type, host):
                await route.abort()
                return
            if accepted >= MAX_BROWSER_REQUESTS:
                failures.append(BrowserRequestBudgetExceeded("Browser request budget exhausted"))
                await route.abort()
                return
            accepted += 1
            if request.url.startswith(("http://", "https://")):
                try:
                    token = source_key.set(current_source)
                    try:
                        delay = gate.reserve_delay(
                            request.url, static_asset=request.resource_type in {"script", "stylesheet"}
                        )
                    finally:
                        source_key.reset(token)
                    if delay:
                        await asyncio.sleep(delay)
                    gate.check(request.url)
                except Exception as error:
                    failures.append(error)
                    if isinstance(error, HTTPError):
                        event(
                            "cooldown_skipped",
                            host,
                            transport="browser",
                            resource=request.resource_type,
                            run=current_run,
                        )
                    await route.abort()
                    return
            if request.resource_type in {"script", "stylesheet"}:
                await asset_slots.acquire()
                active_assets.add(request)
                try:
                    gate.check(request.url)
                    event("request_sent", host, transport="browser", resource=request.resource_type, run=current_run)
                    await route.continue_()
                except Exception:
                    release_asset(request)
                    raise
            else:
                if request.url.startswith(("http://", "https://")):
                    event("request_sent", host, transport="browser", resource=request.resource_type, run=current_run)
                await route.continue_()

        def observe_response(response: Any) -> None:
            token = source_key.set(current_source)
            try:
                gate.observe(
                    response.url,
                    response.status,
                    response.headers.get("retry-after"),
                    transport="browser",
                    resource=response.request.resource_type,
                    run=current_run,
                )
            finally:
                source_key.reset(token)
            try:
                gate.check(response.url)
            except Exception as error:
                failures.append(error)

        await context.route("**/*", pace_route)
        context.on("response", observe_response)
        context.on("requestfinished", release_asset)
        context.on("requestfailed", release_asset)
        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        try:
            try:
                result = await action(page)
            except Exception as error:
                if failures:
                    raise failures[0] from error
                raise
            if failures:
                raise failures[0]
            return result
        finally:
            await browser.close()
