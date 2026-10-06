"""Only documented HQ substitutions with unchanged catalog identity can be restored."""

import pytest

from tools.repair_employer_locations import read_catalog_snapshot, restoration_location


def test_snapshot_reader_never_imports_private_rows(tmp_path):
    snapshot = tmp_path / "synthetic.sql"
    snapshot.write_text(
        'COPY "public"."user_profiles" ("id", "name") FROM stdin;\n1\tSynthetic private marker\n\\.\n'
        'COPY "public"."jobs" ("id", "dedupe_key", "company", "url", "location") FROM stdin;\n'
        "1\tfixture\tExample\thttps://example.invalid\tIreland (Remote)\n\\.\n"
    )
    assert read_catalog_snapshot(snapshot) == {
        1: {
            "dedupe_key": "fixture",
            "company": "Example",
            "url": "https://example.invalid",
            "location": "Ireland (Remote)",
        }
    }
    snapshot.write_text("No COPY data")
    with pytest.raises(ValueError):
        read_catalog_snapshot(snapshot)


def test_repair_requires_known_hq_substitution_and_same_identity():
    baseline = {
        "dedupe_key": "fixture",
        "company": "Example",
        "url": "https://example.invalid",
        "location": "Ireland (Remote)",
    }
    job = {**baseline, "location": "Dublin, Ireland (Remote)"}
    employer = {"location": "Dublin, Ireland"}
    assert restoration_location(job, baseline, employer) == "Ireland (Remote)"
    assert restoration_location({**job, "location": "Cork, Ireland"}, baseline, employer) is None
    assert restoration_location({**job, "url": "https://example.invalid/changed"}, baseline, employer) is None
    assert restoration_location(job, {**baseline, "location": "Galway, Ireland"}, employer) is None
