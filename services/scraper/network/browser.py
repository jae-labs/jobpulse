"""Playwright headless browser manager with anti-automation flags."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

try:
    from playwright.sync_api import sync_playwright

    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False


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


def fetch_via_browser(url: str, timeout: int = 25000, wait_for_idle: bool = False) -> tuple[str, str]:
    """Fetch a URL with a real headless browser and return (final_url, page_html)."""
    import time

    def _action(page: Any) -> tuple[str, str]:
        wait_until = "networkidle" if wait_for_idle else "domcontentloaded"
        try:
            page.goto(url, wait_until=wait_until, timeout=timeout)
        except Exception:
            # Fallback to domcontentloaded if networkidle timed out
            if wait_until == "networkidle":
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=timeout)
                except Exception:
                    pass

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

        return page.url, content

    return with_browser(_action)


def with_browser(action: Callable[[Any], Any]) -> Any:
    """Execute an action within a managed, stealth-configured Playwright browser session."""
    if not HAS_PLAYWRIGHT:
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
            locale="en-IE",
            timezone_id="Europe/Dublin",
            viewport={"width": 1280, "height": 800},
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        try:
            return action(page)
        finally:
            browser.close()
