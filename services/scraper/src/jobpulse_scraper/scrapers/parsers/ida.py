"""Pure parsing of rendered IDA careers cards."""

from urllib.parse import urljoin

from jobpulse_scraper.scrapers.parsers.html_tree import TreeParser


def parse_ida_page(page: str, url: str) -> list[dict[str, object]]:
    tree = TreeParser(page).root
    jobs = {}
    for anchor in tree.elements():
        href = anchor.attrs.get("href", "")
        if anchor.tag != "a" or not (anchor.text.lower() == "view job" or "candidatemanager" in href):
            continue
        parent = anchor.parent
        for _ in range(5):
            if parent is None:
                break
            heading = next(
                (
                    node
                    for node in parent.elements()
                    if node.tag in {"h2", "h3", "h4"}
                    or node.attrs.get("class") == "title"
                    or (node.tag == "strong" and node.parent and node.parent.tag == "p")
                ),
                None,
            )
            if heading and heading.text and href:
                job_url = urljoin(url, href)
                jobs[job_url] = {
                    "title": heading.text,
                    "company": "IDA Ireland",
                    "location": "Dublin / Regional Ireland",
                    "employment_type": "Permanent",
                    "description": "",
                    "description_is_snippet": True,
                    "url": job_url,
                    "source": "IDA Ireland",
                }
                break
            parent = parent.parent
    if not jobs and not any(
        marker in tree.text.lower() for marker in ("open roles", "no vacancies", "no current", "careers at ida")
    ):
        raise ValueError("Unrecognized IDA careers page")
    return list(jobs.values())
