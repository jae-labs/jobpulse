"""Tests for scraper text cleaner and description formatting."""

from engine.text_cleaner import clean_description_text, format_description_text


def test_format_description_text_empty():
    assert format_description_text("") == ""
    assert format_description_text("   ") == ""


def test_format_description_text_html_entities_and_whitespace():
    raw = "Role:&nbsp;Senior Developer &amp; Architect&#39;s Team.<br/>• First item&nbsp;&nbsp;• Second item"
    result = format_description_text(raw)
    assert "&amp;" not in result
    assert "&nbsp;" not in result
    assert "&#39;" not in result
    assert "Senior Developer & Architect's Team." in result
    assert "• First item" in result
    assert "• Second item" in result


def test_format_description_text_injects_headers_when_dense():
    raw = (
        "Acme is looking for a senior engineer. "
        "Key Responsibilities Design backend services and maintain pipelines. "
        "Requirements 5+ years of Python experience; Strong SQL skills; Docker knowledge. "
        "What We Offer Competitive compensation and remote work."
    )
    result = format_description_text(raw)
    assert "\n\nKey Responsibilities:\n" in result
    assert "\n\nRequirements:\n" in result
    assert "\n\nWhat We Offer:\n" in result
    assert "• Strong SQL skills" in result
    assert "• Docker knowledge" in result


def test_format_description_text_preserves_already_structured_text():
    raw = (
        "About the role:\n"
        "We are hiring.\n\n"
        "Responsibilities:\n"
        "• Task 1\n"
        "• Task 2\n"
        "• Task 3\n"
        "• Task 4\n"
        "• Task 5\n"
        "• Task 6\n"
        "• Task 7\n"
        "• Task 8\n"
    )
    result = format_description_text(raw)
    assert "• Task 1" in result
    assert "• Task 8" in result
    # Shouldn't distort or double-break already well-structured text
    assert result.count("\n") >= 8


def test_format_description_text_normalizes_bullet_variants():
    raw = (
        "Qualifications:\n"
        "- Experience with distributed systems\n"
        "* Strong communication\n"
        "• • Kubernetes expertise\n"
        "· Python proficiency"
    )
    result = format_description_text(raw)
    assert "• Experience with distributed systems" in result
    assert "• Strong communication" in result
    assert "• Kubernetes expertise" in result
    assert "• Python proficiency" in result
    assert "• •" not in result


def test_clean_description_text_handles_boilerplate_and_short_fallbacks():
    # Very short text falls back to employer opportunity note
    stub = clean_description_text("Too short", "Stripe", "Staff Engineer")
    assert "Stripe opportunity: Staff Engineer" in stub

    # Normal description gets cleaned and formatted
    desc = (
        "<p>Stripe is building economic infrastructure.</p>"
        "<p>Responsibilities: Design resilient payment gateways. Qualifications: Python and Go experience.</p>"
    )
    cleaned = clean_description_text(desc, "Stripe", "Staff Engineer")
    assert "<p>" not in cleaned
    assert "Stripe is building economic infrastructure." in cleaned
    assert "Responsibilities:" in cleaned
    assert "Qualifications:" in cleaned
