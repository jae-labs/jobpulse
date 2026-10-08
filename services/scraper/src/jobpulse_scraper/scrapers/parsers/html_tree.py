"""Small read-only HTML tree for replayable careers-page parsers."""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    parent: Element | None = field(default=None, repr=False)
    children: list[Element | str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(child.text if isinstance(child, Element) else child for child in self.children).strip()

    def elements(self):
        for child in self.children:
            if isinstance(child, Element):
                yield child
                yield from child.elements()


class TreeParser(HTMLParser):
    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.root = Element("root", {})
        self.current = self.root
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, dict((key, value or "") for key, value in attrs), self.current)
        self.current.children.append(node)
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
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Element(tag, dict((key, value or "") for key, value in attrs), self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node.parent is not None:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)
