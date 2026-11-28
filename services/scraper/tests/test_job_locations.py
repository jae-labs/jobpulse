import pytest

from jobpulse_scraper.pipeline.job_locations import verify_location


class Provider:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def get(self, url, params):
        self.calls.append(params)
        return {"results": self.rows}


def result(**changes):
    return {"lat": 0, "lon": 0, "result_type": "city", "rank": {"confidence": 1}, **changes}


def test_vacancy_city_verification_preserves_zero_and_country_filter():
    provider = Provider([result()])
    evidence = verify_location(provider, "Dublin, Ireland", "synthetic")
    assert evidence["status"] == "verified" and evidence["precision"] == "city"
    assert evidence["latitude"] == 0 and evidence["longitude"] == 0
    assert provider.calls[0]["filter"] == "countrycode:ie"
    assert "synthetic" not in str(evidence)


@pytest.mark.parametrize("location", ["Worldwide remote", "Ireland (Remote)", "Anywhere"])
def test_remote_not_replaced_with_employer_or_city_pin(location):
    provider = Provider([result()])
    assert verify_location(provider, location, "synthetic")["status"] == "remote"
    assert provider.calls == []


@pytest.mark.parametrize(
    "row", [result(lat=91), result(lat=True), result(lon=float("nan")), result(rank={"confidence": 0.5})]
)
def test_bad_geocodes_remain_unresolved(row):
    assert verify_location(Provider([row]), "Dublin, Ireland", "synthetic")["status"] == "unresolved"


def test_equally_likely_distant_places_are_ambiguous():
    assert verify_location(Provider([result(), result(lat=30)]), "Dublin", "synthetic")["status"] == "ambiguous"
