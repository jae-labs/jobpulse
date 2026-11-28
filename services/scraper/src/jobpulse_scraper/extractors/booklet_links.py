"""Pure selection of a role-specific public booklet linked by an official page."""

from urllib.parse import urljoin, urlsplit

from jobpulse_scraper.scrapers.parsers.html_tree import TreeParser


def find_job_booklet(page: str, title: str, source_url: str) -> str | None:
    source = urlsplit(source_url)
    if source.hostname not in {"www.housingagency.ie", "housingagency.ie"}:
        return None
    normalized_title = " ".join(title.casefold().split())
    if not normalized_title:
        return None
    tree = TreeParser(page).root
    for container in tree.elements():
        if "housing-editor-content" not in container.attrs.get("class", "").split():
            continue
        for node in container.elements():
            if node.tag != "a" or normalized_title not in " ".join(node.text.casefold().split()):
                continue
            url = urljoin(source_url, node.attrs.get("href", ""))
            parts = urlsplit(url)
            if (
                parts.scheme == "https"
                and parts.hostname == source.hostname
                and not parts.username
                and not parts.password
                and parts.path.lower().endswith(".pdf")
            ):
                return url
    return None
