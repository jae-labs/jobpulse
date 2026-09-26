"""Text cleaning, HTML stripping, cookie banner stripping, and PDF title normalization."""

from __future__ import annotations

import html
import re
from urllib.parse import unquote

from config.rules import (
    ERROR_ANTI_BOT_PATTERNS,
    IRISH_CITY_DISPLAY_NAMES,
    NORTHERN_IRELAND_CITY_DISPLAY_NAMES,
)

VAGUE_LOCATION_VALUES = {"", "not specified", "unspecified", "various", "flexible", "location"}
WORK_MODE_TAGS = {"hybrid": "Hybrid", "remote": "Remote", "on-site": "On-site", "onsite": "On-site"}


def clean_text(value: str) -> str:
    """Strip HTML tags, scripts, and normalize whitespace."""
    value = re.sub(r"<(script|style|noscript)[^>]*>[\s\S]*?</\1>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def clean_html_description(value: str) -> str:
    """Convert HTML description into structured text preserving paragraphs and bullet points."""
    if not value:
        return ""
    text = re.sub(r"<(script|style|noscript)[^>]*>[\s\S]*?</\1>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h[1-6]|tr|blockquote|section|article)>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n• ", text, flags=re.IGNORECASE)
    text = re.sub(r"</(ul|ol)>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"([^\n])\s*•\s*", r"\1\n• ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


COMMON_SECTION_HEADERS: tuple[str, ...] = (
    "Company Description",
    "Corporate Security Responsibility",
    "Information Security",
    "Security Responsibilities",
    "Equal Opportunity Employer",
    "Equal Opportunity",
    "Diversity & Inclusion",
    "Diversity and Inclusion",
    "Core Competencies",
    "Personal Attributes",
    "Skills & Experience",
    "Skills and Experience",
    "Skills & Requirements",
    "Key Responsibilities",
    "Core Responsibilities",
    "Primary Responsibilities",
    "Role & Responsibilities",
    "Responsibilities",
    "Qualifications Required",
    "Required Qualifications",
    "Minimum Qualifications",
    "Basic Qualifications",
    "Essential Requirements",
    "Qualifications",
    "Requirements",
    "Preferred Qualifications",
    "Preferred Requirements",
    "Preferred",
    "What You’ll Do",
    "What You'll Do",
    "What You Will Do",
    "What You’ll Need",
    "What You'll Need",
    "What You Will Need",
    "You Will Need",
    "What You’ll Bring",
    "What You'll Bring",
    "All about you",
    "About you",
    "Who You Are",
    "Who we are looking for",
    "Ideal Candidate",
    "What We Offer",
    "Benefits & Perks",
    "Perks & Benefits",
    "Salary & Benefits",
    "Compensation",
    "Benefits",
    "Work Environment",
    "Work Mode & Location",
    "Application Process",
    "How to Apply",
    "Our Purpose",
    "Our Mission",
    "Company Overview",
    "About The Company",
    "About The Role",
    "About The Team",
    "About Us",
    "Job Overview",
    "Role Overview",
    "Overview",
    "Job Summary",
    "Role Summary",
    "Position Summary",
    "Title and Summary",
    "The Role",
    "Role",
)

# Sort headers longest-first to ensure longest match takes precedence
_SORTED_HEADERS: tuple[str, ...] = tuple(sorted(COMMON_SECTION_HEADERS, key=len, reverse=True))
_HEADERS_PATTERN_STR: str = "|".join(re.escape(h) for h in _SORTED_HEADERS)

_HEADER_PATTERN: re.Pattern[str] = re.compile(
    rf"(?:([.!?])|([a-z0-9)]))\s+\b({_HEADERS_PATTERN_STR})\b\s*(:)?\s*",
    re.IGNORECASE,
)


def _header_repl(match: re.Match[str]) -> str:
    punct = match.group(1)
    word_end = match.group(2)
    title = match.group(3)
    has_colon = bool(match.group(4))

    # If there is no trailing colon, require the first letter to be uppercase
    # so lowercase words in normal prose (e.g. "competitive compensation") are preserved.
    if not has_colon and not title[0].isupper():
        return match.group(0)

    p = punct or (f"{word_end}." if word_end else "")
    clean_title = title.strip().title() if title.isupper() else title.strip()
    return f"{p}\n\n{clean_title}:\n"


def _clean_whitespace(text: str) -> str:
    """Normalize HTML artifacts, entities, whitespace, and line breaks."""
    s = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    s = re.sub(r"</p>", "\n\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<p[^>]*>", "", s, flags=re.IGNORECASE)
    s = html.unescape(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]", " ", s)
    s = re.sub(r"[^\S\n]+$", "", s, flags=re.MULTILINE)
    s = re.sub(
        r"^[ \t]*[•·\u2022\u2023\u25e6\u2043\u2219][ \t]*[•·\u2022\u2023\u25e6\u2043\u2219]+[ \t]*",
        "• ",
        s,
        flags=re.MULTILINE,
    )
    s = re.sub(r"(?:•\s*){2,}", "• ", s)
    s = re.sub(r"^[ \t]*[-*·][ \t]+", "• ", s, flags=re.MULTILINE)
    s = re.sub(r"\n{2,}[ \t]*•", "\n• ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def format_description_text(raw: str) -> str:
    """
    Format description text into clean, human-readable structured text:
    - Normalizes HTML entities, unicode whitespace, and carriage returns
    - Preserves and standardizes bullet points
    - Reconstructs paragraph breaks and section headers when source lacks newlines
    - Breaks semicolon-separated lists into bullet points
    - Cleans up trailing punctuation and excessive blank lines
    """
    if not raw:
        return ""
    s = _clean_whitespace(raw)

    newline_count = s.count("\n")
    if newline_count < 8:
        # 1. Normalize bullet characters to standard bullet and ensure newline before bullets
        s = re.sub(r"[\u2022\u2023\u25e6\u2043\u2219•]\s*", "\n• ", s)

        # 2. Section headers to detect and break into separate paragraphs (longest match first)
        s = _HEADER_PATTERN.sub(_header_repl, s)

        # 3. Semicolons followed by capital letters in bulleted lists (e.g. "; Ensure...")
        s = re.sub(r";\s+([A-Z][a-z]+)", r";\n• \1", s)

        # 4. Ensure bullet points always start on their own line
        s = re.sub(r"([^\n])\s*•\s*", r"\1\n• ", s)

        # 5. Clean up leading punctuation glitches
        s = re.sub(r"^\s*[:.]\s*", "", s, flags=re.MULTILINE)

    return _clean_whitespace(s)


def strip_cookie_boilerplate(text: str) -> str:
    """Remove cookie consent banners, ATS headers, JS scripts, and boilerplate."""
    cleaned = text
    # 1. Remove JS / script blocks
    cleaned = re.sub(r'"\)\.appendTo\("head"\);.*?//\]\]>', " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"\$\(window\)\.on\(.*?\}\);", " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"\$\(window\)\.load\(.*?\}\);", " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'\{[\s\r\n]*"themeOptions":[\s\S]*$', " ", cleaned)
    cleaned = re.sub(r"'\)\.attr\([^\n]+", " ", cleaned)
    cleaned = re.sub(r"\/\/\s*\$\(window\)[\s\S]*?\}\);", " ", cleaned)

    # 2. Remove cookie banners & consent disclaimers
    cleaned = re.sub(
        r"By continuing to use this website, you consent to the use of cookies.*?Accept\s+Close",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"We use cookies to offer you the best possible website experience.*?Accept All Cookies",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"Privacy and Cookies Cookies help us improve your website experience.*?Accept\s+Close",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"or choose to opt out of cookies.*?Accept All Cookies", " ", cleaned, flags=re.DOTALL | re.IGNORECASE
    )
    cleaned = re.sub(
        r"We (?:would like to )?use cookies.*?find out more\.", " ", cleaned, flags=re.DOTALL | re.IGNORECASE
    )
    cleaned = re.sub(
        r"^(?:.*?(?:Allied Irish Bank|Allied Irish Banks|AIB)\s+)?(?:We (?:would like to )?use cookies|Welcome!|This website uses cookies|We use cookies on this site).*?(?:Accept Cookies|Accept All|Decline|Read Full Privacy Message|find out more\.)\s*(?:Accept Cookies)?\s*",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"session so the server can identify the visitor.*?Accept All Cookies",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"Cookie (?:Notice|Policy|Consent|Settings|Preferences).*?(?:Accept|Decline|Allow|Reject|Got it|Close)\s*",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"This website uses cookies.*?(?:Accept|Decline|Allow|Reject|Got it|Close)\s*",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"Careers at Workday.*?Join Our Talent Community!\s*", " ", cleaned, flags=re.DOTALL | re.IGNORECASE
    )
    cleaned = re.sub(r"Recruitment Privacy Statement.*?reserved\.\s*", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"Toggle navigation\s*", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"Follow Us\s+Recruitment Privacy Statement.*", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)

    # 3. Remove SuccessFactors / ATS headers & search/alert preambles
    cleaned = re.sub(
        r"^.*?Job Details\s*\|\s*[A-Za-z0-9\s]+(?:ESB Careers|Electricity Supply Board|CRH|SAP|AIB|Glanbia|Zurich Insurance|FBD Holdings|Canada Life).*?(?:Create Alert\s*(?:×\s*Select how often \(in days\) to receive an alert:)?|Apply now\s*[»>]|Apply Now\s*|Apply now via Sign Up\s*[»>])\s*",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^.*?(?:E-mail similar jobs to me|JOB SEARCH|Search by Keyword|Search Jobs Careers).*?(?:Select how often \(in days\) to receive an alert:\s*(?:Create Alert\s*)?|Clear\s*)+",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^.*?(?:Modify All Cookies\s+Accept All Cookies\s+Our Group Career Streams.*?Apply now\s*[»>]\s*)",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^.*?(?:Modify All Cookies\s+Accept All Cookies\s+JOB OPPORTUNITIES.*?JOIN OUR TALENT COMMUNITY\s*)",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^.*?(?:Modify All Cookies\s+Filter jobs by Posting Language.*?Login\s*)",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^.*?Language\s+Deutsch\s*\(Deutschland\).*?View Profile\s*", " ", cleaned, flags=re.DOTALL | re.IGNORECASE
    )

    # 4. Remove ATS trailing footers
    cleaned = re.sub(
        r"(?:Apply now\s*[»>]|Apply Now\s*|Apply now via Sign Up\s*[»>])?\s*Find similar jobs:.*$",
        " ",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(r"Opens in a new tab\..*?All Rights Reserved\.", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"©\s*Copyright\s*\d{4}.*?All Rights Reserved\.", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"\/\/\s*\$\(window\)\.load[\s\S]*$", " ", cleaned)
    cleaned = re.sub(r"session so the server can identify the visitor[\s\S]*$", " ", cleaned)

    # 5. Remove stray leading & trailing snippets
    cleaned = re.sub(
        r"^(?:(?:via\s+Sign\s+Up\s*[»>]|Apply\s+now(?:\s+via\s+Sign\s+Up)?\s*[»>]|Apply\s+Now|Start\s+apply\s+with\s+LinkedIn\s+Start\s+Please\s+wait\.{1,3}|[×x]\s*Select\s+how\s+often\s*\(in\s*days\)\s*to\s*receive\s*an\s*alert:)\s*)+",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"(?:Apply now\s*[»>]\s*|Apply now\s*|Apply Now\s*|Start apply with LinkedIn\s*|Start Please wait\.{1,3}\s*)+$",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"^\s*Apply now\s*[»>]\s*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\s*Skip to main content\s*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[ \t\r\f\v]+", " ", cleaned)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def clean_description_text(desc: str, company: str, title: str) -> str:
    """Ensure description is free of anti-bot text, cookie boilerplate, and properly formatted."""
    if not desc or len(desc.strip()) < 30:
        return f"{company} opportunity: {title}. Consult official employer portal for full specifications."

    desc_l = desc.lower()
    for pat in ERROR_ANTI_BOT_PATTERNS:
        if re.search(pat, desc_l):
            return f"{company} opportunity: {title}. Consult official employer portal for full specifications."

    if "<" in desc and ">" in desc:
        desc = clean_html_description(desc)

    cleaned = strip_cookie_boilerplate(desc)
    cleaned = format_description_text(cleaned)

    if len(cleaned) < 50:
        return f"{company} opportunity: {title}. Consult official employer portal for full specifications."
    return cleaned


def normalize_location(raw: str) -> str:
    """
    Normalize a scraped location string into a consistent "City, Country" display
    format instead of showing raw ATS text (a bare "Hybrid", a full sentence, an
    empty string, etc.) verbatim. Best-effort: falls back to "Ireland" for vague
    or unrecognized text, since callers only reach here after Ireland geo-filtering.
    """
    text = re.sub(r"\s+", " ", (raw or "")).strip()
    text_l = text.lower()

    work_mode = next((label for key, label in WORK_MODE_TAGS.items() if key in text_l), None)

    for city in IRISH_CITY_DISPLAY_NAMES:
        if re.search(rf"\b{re.escape(city.lower())}\b", text_l):
            return f"{city}, Ireland" + (f" ({work_mode})" if work_mode else "")

    for city in NORTHERN_IRELAND_CITY_DISPLAY_NAMES:
        if re.search(rf"\b{re.escape(city.lower())}\b", text_l):
            return f"{city}, Northern Ireland" + (f" ({work_mode})" if work_mode else "")

    if text_l in VAGUE_LOCATION_VALUES or text_l in WORK_MODE_TAGS:
        return f"Ireland ({work_mode})" if work_mode else "Ireland"

    if "ireland" in text_l:
        return f"Ireland ({work_mode})" if work_mode else "Ireland"

    # Unrecognized text that still passed Ireland geo-filtering upstream - keep it
    # only if it's short and location-shaped (no verbs/punctuation of a sentence).
    if len(text) <= 40 and not re.search(r"[.!?]", text) and len(text.split()) <= 5:
        return text

    return f"Ireland ({work_mode})" if work_mode else "Ireland"


def clean_pdf_title(link_text: str, href: str) -> str:
    """Derive clean, readable job title from PDF anchor text or filename."""
    filename = unquote(href.split("/")[-1])
    fn_clean = re.sub(r"\.pdf$", "", filename, flags=re.I)
    fn_clean = re.sub(r"[-_]+", " ", fn_clean)
    fn_clean = re.sub(
        r"\b(qualifications|particulars|rolling competition|candidate information booklet|information booklet|advert|advertisement|job spec|spec|application form|rolling competiton)\b",
        "",
        fn_clean,
        flags=re.I,
    )
    fn_clean = re.sub(
        r"\b(202[4-7]|february|january|march|april|may|june|july|august|september|october|november|december)\b",
        "",
        fn_clean,
        flags=re.I,
    )
    fn_clean = re.sub(r"\s+", " ", fn_clean).strip(" -")

    generic_terms = {
        "advertisement",
        "candidate booklet",
        "link to qualifications",
        "link to qualifications and particulars",
        "download",
        "apply now",
        "view here",
        "click here",
        "read more",
        "view",
        "pdf",
        "booklet",
    }
    clean_lt = clean_text(link_text)
    if clean_lt and not any(gen == clean_lt.lower().strip() for gen in generic_terms):
        clean_lt = re.sub(
            r"\s*Candidate Information Booklet.*$|\s*rolling competition.*$|\.pdf$",
            "",
            clean_lt,
            flags=re.I,
        )
        clean_lt = re.sub(r"\s+", " ", clean_lt).strip(" -")
        if len(clean_lt) > 3:
            return clean_lt
    if fn_clean and len(fn_clean) > 3:
        return fn_clean.title()
    return clean_lt or filename


def extract_surrounding_text(html_content: str, href: str, window: int = 350) -> str:
    """Extract snippet of clean text around a link in HTML to infer metadata (e.g. salary)."""
    pos = html_content.find(href)
    if pos == -1:
        return ""
    start = max(0, pos - window)
    end = min(len(html_content), pos + len(href) + window)
    return clean_text(html_content[start:end])
