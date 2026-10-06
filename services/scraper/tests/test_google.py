"""Google careers feed: embedded-payload parsing and Irish filtering."""

from __future__ import annotations

from scrapers.core.google import _ds1_payload, extract_google_items


def _record(job_id: str, title: str, brand: str, locations: list[str], about: str = "") -> list:
    record: list = [""] * 13
    record[0] = job_id
    record[1] = title
    record[7] = brand
    record[9] = [[name, [name], None, None, "", ""] for name in locations]
    record[10] = [None, about]
    return record


def test_extract_google_keeps_multi_location_irish_roles() -> None:
    records = [
        _record("1", "Engineer", "Google", ["Dublin, Ireland"], "<p>Build things</p>"),
        _record("2", "Analyst", "Google", ["Dublin, Ireland", "Hamburg, Germany"]),
        _record("3", "US Role", "Google", ["New York, United States"]),
    ]
    opportunities = extract_google_items(records)
    assert [o["title"] for o in opportunities] == ["Engineer", "Analyst"]
    assert opportunities[0]["location"] == "Dublin, Ireland"
    assert opportunities[0]["source"] == "Google"
    assert opportunities[0]["company"] == "Google"
    assert opportunities[0]["url"].endswith("/results/1")
    assert "Build things" in opportunities[0]["description"]


def test_ds1_payload_anchors_on_the_ds1_script() -> None:
    decoy = "<script>AF_initDataCallback({key: 'ds:0', data:[[1]], sideChannel: {}})</script>"
    real = '<script>AF_initDataCallback({key: \'ds:1\', data:[[["9","Role",null,null,null,null,null,"Google"]], null, 1, 20], sideChannel: {}})</script>'
    payload = _ds1_payload(decoy + real)
    assert payload is not None
    assert payload[2] == 1
    assert payload[0][0][0] == "9"


def test_ds1_payload_missing_returns_none() -> None:
    assert _ds1_payload("<html><script>key: 'ds:0'</script></html>") is None
