"""Playwright-based dynamic page detail extractor."""

from __future__ import annotations

from typing import Any

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description, strip_cookie_boilerplate


def extract_playwright_job_spec(url: str, title: str, company: str, page: Any = None) -> dict[str, str]:
    """Render dynamic JavaScript/SPA job pages and extract job spec text from target containers."""
    try:
        from playwright.sync_api import sync_playwright

        def _extract_from_page(pg: Any) -> str:
            pg.goto(url, timeout=20000, wait_until="domcontentloaded")
            try:
                pg.click(
                    'button:has-text("Accept Cookies"), button:has-text("Accept All"), button:has-text("Agree")',
                    timeout=2000,
                )
            except Exception:
                pass
            pg.wait_for_timeout(1500)

            # Prioritize dedicated job specification containers
            selectors = [
                # SAP SuccessFactors standard containers
                "span.jobdescription",
                "div.jobdescription",
                'div[itemprop="description"]',
                # Workday standard containers
                '[data-automation-id="jobPostingDescription"]',
                '[data-automation-id="job-posting-details"]',
                '[data-automation-id="jobPostingPage"]',
                # Generic ATS containers
                "div.job-description",
                "div.job-details",
                "section.job-description",
                "div#job-description",
                "article",
                "main",
                '[role="main"]',
            ]
            for sel in selectors:
                try:
                    el = pg.query_selector(sel)
                    if el:
                        h = el.inner_html()
                        if h and "<" in h and ">" in h:
                            t = clean_html_description(h)
                        else:
                            t = el.inner_text()
                        if len(t) > 200:
                            return strip_cookie_boilerplate(t)
                except Exception:
                    continue

            body = pg.query_selector("body")
            if body:
                h = body.inner_html()
                if h and "<" in h and ">" in h:
                    return strip_cookie_boilerplate(clean_html_description(h))
            return strip_cookie_boilerplate(pg.inner_text("body") or "")

        if page:
            clean = _extract_from_page(page)
        else:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                ctx = browser.new_page(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                try:
                    clean = _extract_from_page(ctx)
                finally:
                    browser.close()

        if len(clean) > 200:
            sal = extract_salary_from_context(clean, title)
            return {
                "description": clean[:25000].strip(),
                "salary_text": sal,
            }
    except Exception:
        pass
    return {}
