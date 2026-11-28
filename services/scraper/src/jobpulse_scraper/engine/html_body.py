"""Pure balanced public job description containers."""

from html.parser import HTMLParser

from jobpulse_scraper.engine.text_cleaner import clean_html_description


class _JobBodyParser(HTMLParser):
    """Capture balanced description containers, excluding unrelated page chrome."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.depth = 0
        self.capture_depth: int | None = None
        self.parts: list[str] = []
        self.bodies: list[str] = []
        self.dedicated = False
        self.dedicated_bodies: list[str] = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        markers = " ".join(str(attributes.get(key) or "") for key in ("class", "id", "data-automation-id"))
        is_body = (
            str(attributes.get("id") or "").lower().endswith("_jobdetailsgroup")
            or attributes.get("itemprop") == "description"
            or any(
                marker in markers.lower().split()
                for marker in (
                    "job-description",
                    "jobdescription",
                    "jobpostingdescription",
                    "job_description",
                    "job-details",
                )
            )
        )
        if (is_body and not self.dedicated) or (self.capture_depth is None and tag in {"article", "main"}):
            self.capture_depth = self.depth
            self.parts = []
            self.dedicated = is_body
        if self.capture_depth is not None:
            self.parts.append(self.get_starttag_text() or "")
        if tag not in {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }:
            self.depth += 1

    def handle_startendtag(self, tag, attrs):
        # HTML void elements do not add a level even when written as XML <br/>.
        self.handle_starttag(tag, attrs)
        if tag not in {"br", "hr", "img", "input", "link", "meta", "source", "wbr"}:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        self.depth = max(0, self.depth - 1)
        if self.capture_depth is not None:
            self.parts.append(f"</{tag}>")
            if self.depth == self.capture_depth:
                body = clean_html_description("".join(self.parts))
                if self.dedicated:
                    self.dedicated_bodies.append(body)
                else:
                    self.bodies.append(body)
                self.capture_depth = None
                self.dedicated = False

    def handle_data(self, data):
        if self.capture_depth is not None:
            self.parts.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")
