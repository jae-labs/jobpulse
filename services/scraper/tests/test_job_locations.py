import pytest

from pipeline.job_locations import verify_location
from tools.map_programme_domains import programme_sponsor


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


def test_programme_domain_requires_every_vacancy_to_name_the_same_sponsor():
    job = {
        "company": "Example Community Ltd",
        "source": "JobsIreland.ie",
        "title": "Gardener - CE Scheme - Example Community Ltd",
    }
    assert programme_sponsor("Example Community Ltd", [job])
    assert not programme_sponsor("Example Community Ltd", [job, {**job, "title": "Gardener"}])
    assert not programme_sponsor("Example Community Ltd", [{**job, "company": "Another Company"}])
    assert not programme_sponsor("Example Community Ltd", [{**job, "source": "WhatJobs Ireland"}])
    assert not programme_sponsor(
        "JobsIreland Employer",
        [{**job, "company": "JobsIreland Employer", "title": "CE Scheme - JobsIreland Employer"}],
    )
