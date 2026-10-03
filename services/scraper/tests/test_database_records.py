"""The database boundary narrows external JSON with actual shape validation."""

import pytest

from database.records import response_records


def test_table_records_preserve_fields_and_allow_empty_results():
    assert response_records(None) == []
    assert response_records([]) == []
    assert response_records([{"id": 1, "nullable": None}]) == [{"id": 1, "nullable": None}]


@pytest.mark.parametrize("value", [True, 7, "row", {}, [None], [7], [{1: "bad key"}]])
def test_malformed_database_results_are_rejected(value):
    with pytest.raises(ValueError):
        response_records(value)
