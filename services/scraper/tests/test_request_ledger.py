"""Independent processes share reservations, denial history and cooldowns."""

from concurrent.futures import ProcessPoolExecutor

from jobpulse_scraper.network.ledger import RequestLedger, source_key


def reserve(path):
    return RequestLedger(path).reserve("synthetic.invalid", 100, 3)[0]


def test_process_reservations_do_not_overlap(tmp_path):
    path = tmp_path / "requests.sqlite3"
    with ProcessPoolExecutor(max_workers=4) as executor:
        delays = list(executor.map(reserve, [path] * 8))
    assert sorted(delays) == list(range(0, 24, 3))


def test_source_observations_record_denial_without_claiming_safe_quota(tmp_path):
    ledger = RequestLedger(tmp_path / "requests.sqlite3")
    token = source_key.set("synthetic-board")
    try:
        ledger.observe("synthetic.invalid", 100, 200, 0, 0, 3)
        ledger.observe("synthetic.invalid", 103, 429, 120, 223, 3)
    finally:
        source_key.reset(token)
    row = ledger.summary()[0]
    assert (row["source"], row["responses"], row["accepted"], row["denied"]) == ("synthetic-board", 2, 1, 1)
    assert row["latest_denial"] == {
        "status": 429,
        "observed_at": 103,
        "source_response_ordinal": 2,
        "host_responses_in_previous_minute": 2,
    }
    assert row["learned_interval_seconds"] == 6
    assert ledger.reserve("synthetic.invalid", 110, 3) == (0, 223)
    assert ledger.reserve("synthetic.invalid", 224, 3) == (0, 0)
    assert ledger.reserve("synthetic.invalid", 224, 3) == (6, 0)
