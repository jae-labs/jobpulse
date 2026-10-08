"""Linked cards keep vacancy titles and location evidence together."""

import re

from jobpulse_scraper.scrapers.parsers.generic_html import extract_html_link_opportunities


def parse(html: str):
    links = re.findall(r'<a href="([^"]+)">(.*?)</a>', html, re.DOTALL)
    return extract_html_link_opportunities("Example", "https://example.test/careers/", html, links, set())


def card(slug: str, title: str, location: str) -> str:
    return (
        f'<a href="/careers/{slug}/"><div class="elementor-widget-theme-post-title">'
        f"<div>{title}</div></div><div>Engineering</div><span>{location}</span></a>"
    )


def test_linked_card_uses_own_title_and_location():
    jobs = parse(card("irish", "Senior Software Engineer", "Ireland, Cork"))
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Senior Software Engineer"
    assert jobs[0]["location"] == "Ireland, Cork"
    assert jobs[0]["url"] == "https://example.test/careers/irish/"


def test_country_filter_and_neighbor_do_not_make_foreign_cards_irish():
    jobs = parse(
        "<header><span>Ireland</span></header>"
        + card("foreign", "Senior Data Engineer", "Paris, France")
        + card("unknown", "Senior Platform Engineer", "")
        + card("irish", "Senior Software Engineer", "Dublin, Ireland")
        + card("foreign-dublin", "Senior Support Engineer", "Dublin, Ohio")
    )
    assert [job["url"] for job in jobs] == ["https://example.test/careers/irish/"]


def test_unstructured_link_does_not_fabricate_location_from_neighbor():
    jobs = parse('<div>Dublin Ireland</div><a href="/jobs/platform/">Senior Platform Engineer</a>')
    assert len(jobs) == 1
    assert jobs[0]["location"] == ""
