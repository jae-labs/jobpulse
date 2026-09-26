"""Fixture tests for provider-specific careers-board adapters."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from scrapers.providers import (
    extract_ashby_opportunities,
    extract_bamboohr_opportunities,
    extract_booklet_opportunities,
    extract_candidatemanager_opportunities,
    extract_greenhouse_opportunities,
    extract_jsonld_opportunities,
    extract_lever_opportunities,
    extract_linkedin_opportunities,
    extract_personio_opportunities,
    extract_teamtailor_opportunities,
    extract_workable_opportunities,
    extract_workday_opportunities,
)

FIXTURES = Path(__file__).parent / "fixtures"


class DummyResponse:
    def __init__(self, data: bytes):
        self._data = data

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self) -> bytes:
        return self._data


class ProviderAdapterTests(unittest.TestCase):
    def test_workday_adapter_returns_unique_listings(self) -> None:
        posting = {"title": "Engineer", "locationsText": "Dublin, Ireland", "externalPath": "/job/1"}
        resp = DummyResponse(json.dumps({"jobPostings": [posting, posting], "total": 2}).encode())

        with patch("scrapers.providers.workday.urlopen", return_value=resp):
            opportunities = extract_workday_opportunities("Example", "https://example.wd5.myworkdayjobs.com/careers")

        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0]["url"], "https://example.wd5.myworkdayjobs.com/en-US/careers/job/1")

    def test_candidatemanager_extracts_irish_roles_only(self) -> None:
        page = (FIXTURES / "candidatemanager_board.html").read_text()

        opportunities = extract_candidatemanager_opportunities(
            "Example Council",
            "https://example.candidatemanager.net/CandidateManager.aspx",
            page,
        )

        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0]["title"], "Senior Data Analyst")
        self.assertEqual(opportunities[0]["location"], "Dublin, Ireland")

    def test_jsonld_normalizes_relative_url_and_prevents_duplicates(self) -> None:
        page = (FIXTURES / "jobposting.jsonld.html").read_text()
        seen_urls: set[str] = set()

        opportunities = extract_jsonld_opportunities(
            "Example Ltd",
            "https://example.ie/careers",
            page,
            seen_urls,
        )

        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0]["url"], "https://example.ie/careers/platform-engineer")
        self.assertEqual(opportunities[0]["salary_text"], "€72000")
        self.assertEqual(extract_jsonld_opportunities("Example Ltd", "https://example.ie/careers", page, seen_urls), [])

    def test_greenhouse_adapter_filters_non_irish_roles(self) -> None:
        gh_data = {
            "jobs": [
                {
                    "id": 101,
                    "title": "Backend Lead",
                    "location": {"name": "Dublin, Ireland"},
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/101",
                    "content": "Leading backend infrastructure in Dublin.",
                },
                {
                    "id": 102,
                    "title": "Frontend Lead",
                    "location": {"name": "New York, USA"},
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/102",
                    "content": "US only role.",
                },
            ]
        }
        resp = DummyResponse(json.dumps(gh_data).encode())

        with patch("scrapers.providers.greenhouse.urlopen", return_value=resp):
            opps = extract_greenhouse_opportunities("Acme", "https://boards.greenhouse.io/acme")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Backend Lead")
        self.assertEqual(opps[0]["location"], "Dublin, Ireland")

    def test_lever_adapter_filters_locations(self) -> None:
        lever_data = [
            {
                "text": "Site Reliability Engineer",
                "categories": {"location": "Dublin, Ireland", "commitment": "Full-time"},
                "hostedUrl": "https://jobs.lever.co/techco/sre-1",
                "descriptionPlain": "SRE position.",
            },
            {
                "text": "Product Manager",
                "categories": {"location": "San Francisco, CA", "commitment": "Full-time"},
                "hostedUrl": "https://jobs.lever.co/techco/pm-1",
                "descriptionPlain": "SF position.",
            },
        ]
        resp = DummyResponse(json.dumps(lever_data).encode())

        with patch("scrapers.providers.lever.urlopen", return_value=resp):
            opps = extract_lever_opportunities("TechCo", "https://jobs.lever.co/techco")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Site Reliability Engineer")

    def test_ashby_adapter_handles_secondary_locations(self) -> None:
        ashby_data = {
            "jobs": [
                {
                    "title": "Security Architect",
                    "location": "London, UK",
                    "secondaryLocations": [{"location": "Dublin, Ireland"}],
                    "jobUrl": "https://jobs.ashbyhq.com/cloudco/sec-1",
                    "employmentType": "Full-time",
                }
            ]
        }
        resp = DummyResponse(json.dumps(ashby_data).encode())

        with patch("scrapers.providers.ashby.urlopen", return_value=resp):
            opps = extract_ashby_opportunities("CloudCo", "https://jobs.ashbyhq.com/cloudco")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Security Architect")
        self.assertEqual(opps[0]["location"], "Dublin, Ireland")

    def test_workable_adapter_extracts_irish_vacancies(self) -> None:
        wk_data = {
            "results": [
                {
                    "title": "DevSecOps Engineer",
                    "shortcode": "ABC123D",
                    "location": {"city": "Dublin", "country": "Ireland"},
                    "type": "Full-time",
                }
            ]
        }
        resp = DummyResponse(json.dumps(wk_data).encode())

        with patch("scrapers.providers.workable.urlopen", return_value=resp):
            opps = extract_workable_opportunities("SecCorp", "https://apply.workable.com/seccorp/")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "DevSecOps Engineer")
        self.assertEqual(opps[0]["url"], "https://apply.workable.com/seccorp/j/ABC123D/")

    def test_bamboohr_adapter_extracts_listings(self) -> None:
        bb_data = {
            "result": [
                {
                    "id": "42",
                    "jobOpeningName": "Staff Data Engineer",
                    "location": {"city": "Dublin"},
                }
            ]
        }
        resp = DummyResponse(json.dumps(bb_data).encode())

        with patch("scrapers.providers.bamboohr.urlopen", return_value=resp):
            opps = extract_bamboohr_opportunities("DataHub", "https://datahub.bamboohr.com/jobs/")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Staff Data Engineer")
        self.assertEqual(opps[0]["url"], "https://datahub.bamboohr.com/careers/42")

    def test_linkedin_cards_extractor(self) -> None:
        html = """
        <div class="base-card">
          <h3 class="base-search-card__title">Principal Systems Engineer</h3>
          <h4 class="base-search-card__subtitle">Network Co</h4>
          <span class="job-search-card__location">Dublin, Ireland</span>
          <a class="base-card__full-link" href="https://ie.linkedin.com/jobs/view/12345?refId=xyz"></a>
        </div>
        """
        opps = extract_linkedin_opportunities("Network Co", "https://ie.linkedin.com/jobs/view", html)
        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Principal Systems Engineer")
        self.assertEqual(opps[0]["url"], "https://ie.linkedin.com/jobs/view/12345")

    def test_booklets_extractor(self) -> None:
        html = '<a href="/careers/2026/Civil-Engineer-Information-Booklet.pdf">Candidate Information Booklet - Civil Engineer</a>'
        opps = extract_booklet_opportunities("County Council", "https://council.ie/careers", html)
        self.assertEqual(len(opps), 1)
        self.assertTrue("Civil Engineer" in opps[0]["title"])
        self.assertTrue(opps[0]["url"].endswith(".pdf"))

    def test_personio_adapter_extracts_irish_positions_and_filters_foreign(self) -> None:
        xml_data = """<?xml version="1.0" encoding="utf-8"?>
        <work-positions>
          <position>
            <id>9901</id>
            <title>Senior Site Reliability Engineer</title>
            <office>Dublin</office>
            <employmentType>permanent</employmentType>
            <work-locations>
              <work-location country="IE" city="Dublin"/>
            </work-locations>
            <job-descriptions>
              <job-description>
                <name>Job Description</name>
                <value><![CDATA[<p>Responsible for high-availability systems in Dublin. Salary: €85,000</p>]]></value>
              </job-description>
            </job-descriptions>
          </position>
          <position>
            <id>9902</id>
            <title>Berlin Office Manager</title>
            <office>Berlin</office>
            <employmentType>permanent</employmentType>
            <work-locations>
              <work-location country="DE" city="Berlin"/>
            </work-locations>
            <job-descriptions>
              <job-description>
                <name>Job Description</name>
                <value><![CDATA[<p>Berlin only.</p>]]></value>
              </job-description>
            </job-descriptions>
          </position>
        </work-positions>
        """
        resp = DummyResponse(xml_data.encode("utf-8"))
        with patch("scrapers.providers.personio.urlopen", return_value=resp):
            opps = extract_personio_opportunities("TechCorp", "https://techcorp.jobs.personio.de")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Senior Site Reliability Engineer")
        self.assertEqual(opps[0]["location"], "Dublin")
        self.assertEqual(opps[0]["url"], "https://techcorp.jobs.personio.de/job/9901")
        self.assertEqual(opps[0]["salary_text"], "€85,000")

    def test_teamtailor_adapter_extracts_irish_positions_via_rss(self) -> None:
        rss_data = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:teamtailor="https://teamtailor.com">
          <channel>
            <item>
              <title>Full Stack Developer</title>
              <link>https://innovate.teamtailor.com/jobs/123-full-stack</link>
              <description><![CDATA[Join our engineering team in Dublin, Ireland. Competitive salary.]]></description>
              <teamtailor:location>Dublin, Ireland</teamtailor:location>
            </item>
            <item>
              <title>US Account Executive</title>
              <link>https://innovate.teamtailor.com/jobs/124-account-exec</link>
              <description><![CDATA[San Francisco based sales role.]]></description>
              <teamtailor:location>San Francisco, CA</teamtailor:location>
            </item>
          </channel>
        </rss>
        """
        resp = DummyResponse(rss_data.encode("utf-8"))
        with patch("scrapers.providers.teamtailor.urlopen", return_value=resp):
            opps = extract_teamtailor_opportunities("Innovate Labs", "https://innovate.teamtailor.com")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Full Stack Developer")
        self.assertEqual(opps[0]["location"], "Dublin, Ireland")
        self.assertEqual(opps[0]["url"], "https://innovate.teamtailor.com/jobs/123-full-stack")


if __name__ == "__main__":
    unittest.main()
