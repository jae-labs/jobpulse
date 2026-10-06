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


def test_paginated_records_read_beyond_api_limit():
    from types import SimpleNamespace

    from database.records import select_all_records

    rows = [{"id": i} for i in range(1001)]
    ranges = []

    class Query:
        def range(self, start, end):
            ranges.append((start, end))
            self.rows = rows[start : end + 1]
            return self

        def execute(self):
            return SimpleNamespace(data=self.rows)

    assert select_all_records(Query) == rows
    assert ranges == [(0, 999), (1000, 1999)]
