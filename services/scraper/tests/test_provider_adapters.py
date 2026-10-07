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
    extract_breezy_opportunities,
    extract_candidatemanager_opportunities,
    extract_dayforce_opportunities,
    extract_eightfold_opportunities,
    extract_greenhouse_opportunities,
    extract_icims_opportunities,
    extract_jsonld_opportunities,
    extract_lever_opportunities,
    extract_linkedin_opportunities,
    extract_manatal_opportunities,
    extract_personio_opportunities,
    extract_phenom_opportunities,
    extract_pinpoint_opportunities,
    extract_recruitee_opportunities,
    extract_rippling_opportunities,
    extract_sitemap_opportunities,
    extract_smartrecruiters_opportunities,
    extract_teamtailor_opportunities,
    extract_ukg_opportunities,
    extract_workable_opportunities,
    extract_workday_opportunities,
    extract_zoho_opportunities,
)
from scrapers.providers.dayforce import parse_dayforce_board

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

    def test_workable_adapter_extracts_irish_vacancies_with_body(self) -> None:
        body = "<p>" + "Build reliable services for our Dublin team. " * 5 + "</p>"
        wk_data = {
            "jobs": [
                {
                    "title": "DevSecOps Engineer",
                    "shortcode": "ABC123D",
                    "locations": [{"city": "Dublin", "country": "Ireland"}],
                    "employment_type": "Full-time",
                    "description": body,
                },
                {
                    "title": "US Engineer",
                    "shortcode": "US1",
                    "locations": [{"city": "Austin", "country": "United States"}],
                },
            ]
        }
        resp = DummyResponse(json.dumps(wk_data).encode())

        with patch("scrapers.providers.workable.urlopen", return_value=resp):
            opps = extract_workable_opportunities("SecCorp", "https://apply.workable.com/seccorp/")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "DevSecOps Engineer")
        self.assertEqual(opps[0]["url"], "https://apply.workable.com/seccorp/j/ABC123D/")
        self.assertIn("Build reliable services", opps[0]["description"])
        self.assertNotIn("<p>", opps[0]["description"])

    def test_workable_adapter_reads_the_whole_board_not_just_a_page(self) -> None:
        # The old v3 adapter stopped after its first ~10 postings.
        jobs = [
            {
                "title": f"Engineer {index}",
                "shortcode": f"SC{index:03d}",
                "locations": [{"city": "Dublin", "country": "Ireland"}],
            }
            for index in range(12)
        ]
        resp = DummyResponse(json.dumps({"jobs": jobs}).encode())

        with patch("scrapers.providers.workable.urlopen", return_value=resp):
            opps = extract_workable_opportunities("SecCorp", "https://apply.workable.com/seccorp")

        self.assertEqual(len(opps), 12)
        self.assertEqual(opps[-1]["url"], "https://apply.workable.com/seccorp/j/SC011/")

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

    def test_recruitee_adapter_extracts_irish_vacancies(self) -> None:
        recruitee_data = {
            "offers": [
                {
                    "id": 2766071,
                    "title": "Sales Assistant - Full Time",
                    "careers_url": "https://sparcareers.recruitee.com/o/sales-assistant-full-time-179",
                    "country_code": "IE",
                    "location": "Dublin, Ireland",
                    "employment_type_code": "full_time",
                    "description": "<p>Join our SPAR retail team.</p>",
                    "requirements": "<p>Customer service skills.</p>",
                    "salary": {"min": "30000", "max": "35000", "currency": "EUR", "period": "annual"},
                },
                {
                    "id": 9999999,
                    "title": "US Warehouse Lead",
                    "careers_url": "https://sparcareers.recruitee.com/o/us-warehouse-lead",
                    "country_code": "US",
                    "location": "Chicago, IL",
                    "employment_type_code": "full_time",
                    "description": "<p>US job.</p>",
                    "requirements": "<p>Experience.</p>",
                },
            ]
        }
        resp = DummyResponse(json.dumps(recruitee_data).encode("utf-8"))
        with patch("scrapers.providers.recruitee.urlopen", return_value=resp):
            opps = extract_recruitee_opportunities("SPAR Ireland", "https://sparcareers.recruitee.com/")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Sales Assistant - Full Time")
        self.assertEqual(opps[0]["company"], "SPAR Ireland")
        self.assertEqual(opps[0]["url"], "https://sparcareers.recruitee.com/o/sales-assistant-full-time-179")
        self.assertIn("Dublin", opps[0]["location"])
        self.assertEqual(opps[0]["salary_text"], "EUR 30000 - 35000 annual")

    def test_breezy_adapter_extracts_irish_vacancies(self) -> None:
        data = [
            {
                "name": "Platform Engineer",
                "url": "https://acme.breezy.hr/p/abc-platform-engineer",
                "type": {"name": "Full-Time"},
                "salary": "€80,000",
                "location": {"city": "Dublin", "country": {"name": "Ireland", "id": "IE"}},
            },
            {
                "name": "US Sales Lead",
                "url": "https://acme.breezy.hr/p/def-us-sales",
                "type": {"name": "Full-Time"},
                "location": {"city": "Portland", "country": {"name": "United States", "id": "US"}},
            },
        ]
        with patch("scrapers.providers.breezy.urlopen", return_value=DummyResponse(json.dumps(data).encode())):
            opps = extract_breezy_opportunities("Acme", "https://acme.breezy.hr")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Platform Engineer")
        self.assertEqual(opps[0]["location"], "Dublin, Ireland")
        self.assertEqual(opps[0]["salary_text"], "€80,000")

    def test_pinpoint_adapter_extracts_irish_vacancies(self) -> None:
        data = {
            "data": [
                {
                    "title": "Senior Project Manager",
                    "url": "https://codec.pinpointhq.com/en/postings/abc",
                    "location": {"city": "Dublin", "province": "Dublin", "name": "Dublin"},
                    "employment_type_text": "Full Time",
                    "description": "<p>Deliver projects in Dublin.</p>",
                },
                {
                    "title": "Field Technician",
                    "url": "https://codec.pinpointhq.com/en/postings/def",
                    "location": {"city": "Manchester", "province": "England", "name": "Manchester"},
                    "description": "<p>UK role.</p>",
                },
            ]
        }
        with patch("scrapers.providers.pinpoint.urlopen", return_value=DummyResponse(json.dumps(data).encode())):
            opps = extract_pinpoint_opportunities("Codec", "https://codec.pinpointhq.com")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Senior Project Manager")
        self.assertEqual(opps[0]["url"], "https://codec.pinpointhq.com/en/postings/abc")

    def test_rippling_adapter_extracts_irish_vacancies(self) -> None:
        data = {
            "items": [
                {
                    "name": "Business Operations Manager",
                    "url": "https://ats.rippling.com/acme/jobs/1",
                    "locations": [{"name": "Dublin, Ireland", "country": "Ireland", "countryCode": "IE"}],
                },
                {
                    "name": "Account Executive",
                    "url": "https://ats.rippling.com/acme/jobs/2",
                    "locations": [{"name": "New York, NY", "country": "United States", "countryCode": "US"}],
                },
            ],
            "page": 0,
            "pageSize": 50,
            "totalItems": 2,
            "totalPages": 1,
        }
        with patch("scrapers.providers.rippling.urlopen", return_value=DummyResponse(json.dumps(data).encode())):
            opps = extract_rippling_opportunities("Acme", "https://ats.rippling.com/acme/jobs")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Business Operations Manager")
        self.assertEqual(opps[0]["url"], "https://ats.rippling.com/acme/jobs/1")

    def test_ukg_adapter_extracts_irish_vacancies(self) -> None:
        board = "https://recruiting2.ultipro.com/acme/JobBoard/3347ce03-ba60-4bdc-8af2-26369c80b18f"
        data = {
            "totalCount": 2,
            "opportunities": [
                {
                    "Id": "11111111-1111-1111-1111-111111111111",
                    "Title": "Electrical Engineer",
                    "FullTime": True,
                    "Locations": [
                        {
                            "LocalizedDescription": "Dublin, Ireland",
                            "Address": {"Country": {"Code": "IRL", "Name": "Ireland"}},
                        }
                    ],
                },
                {
                    "Id": "22222222-2222-2222-2222-222222222222",
                    "Title": "Plant Operator",
                    "FullTime": True,
                    "Locations": [{"LocalizedDescription": "Bloomington, MN", "Address": {"Country": {"Code": "USA"}}}],
                },
            ],
        }
        with patch("scrapers.providers.ukg.urlopen", return_value=DummyResponse(json.dumps(data).encode())):
            opps = extract_ukg_opportunities(
                "Acme", f"{board}/OpportunityDetail?opportunityId=11111111-1111-1111-1111-111111111111"
            )

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Electrical Engineer")
        self.assertEqual(opps[0]["employment_type"], "Full-Time")
        self.assertEqual(
            opps[0]["url"], f"{board}/OpportunityDetail?opportunityId=11111111-1111-1111-1111-111111111111"
        )

    def test_icims_adapter_extracts_irish_from_listing(self) -> None:
        def card(title: str, url: str, location: str) -> str:
            return (
                '<li class="iCIMS_JobCardItem">'
                '<div class="col-xs-6 header left">'
                '<span class="sr-only field-label">Location</span>'
                f"<span >{location}</span></div>"
                f'<div class="col-xs-12 title"><a href="{url}?in_iframe=1"><h3>{title}</h3></a></div>'
                f'<div class="col-xs-12 description">Role in {location}</div></li>'
            )

        page = card("Site Engineer", "https://careers-sisk.icims.com/jobs/1/engineer/job", "IE-Cork-Cork") + card(
            "US Manager", "https://careers-sisk.icims.com/jobs/2/manager/job", "US-New York-New York"
        )

        with patch("scrapers.providers.icims.urlopen", return_value=DummyResponse(page.encode())):
            opps = extract_icims_opportunities("Sisk", "https://careers-sisk.icims.com/jobs/search")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Site Engineer")
        self.assertEqual(opps[0]["location"], "Cork, Cork, Ireland")
        self.assertEqual(opps[0]["url"], "https://careers-sisk.icims.com/jobs/1/engineer/job")

    def test_eightfold_adapter_extracts_irish_vacancies(self) -> None:
        def fake(request, timeout=15, context=None):
            url = request.full_url
            if "/api/pcsx/search" in url:
                data = {
                    "data": {
                        "positions": [
                            {"id": 1, "name": "Staff Engineer", "locations": ["Dublin, Ireland"]},
                            {"id": 2, "name": "Sales Lead", "locations": ["New York, New York, US"]},
                        ],
                        "count": 2,
                    }
                }
                return DummyResponse(json.dumps(data).encode())
            return DummyResponse(json.dumps({"job_description": "<p>Platform team in Dublin.</p>"}).encode())

        with patch("scrapers.providers.eightfold.urlopen", side_effect=fake):
            opps = extract_eightfold_opportunities("PayPal", "https://paypal.eightfold.ai/careers")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Staff Engineer")
        self.assertEqual(opps[0]["location"], "Dublin, Ireland")
        self.assertIn("Platform team in Dublin", opps[0]["description"])

    def test_jsonld_handles_list_job_location_and_country(self) -> None:
        page = (
            '<script type="application/ld+json">'
            + json.dumps(
                {
                    "@type": "JobPosting",
                    "title": "Engineer",
                    "url": "https://x/1",
                    "jobLocation": [{"address": {"addressLocality": "Dublin", "addressCountry": "IE"}}],
                }
            )
            + "</script>"
        )
        opps = extract_jsonld_opportunities("Acme", "https://x/1", page, set())
        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["location"], "Dublin, IE")

    def test_sitemap_adapter_filters_to_ireland(self) -> None:
        sitemap = (
            '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            "<url><loc>https://careers.example.com/job/dublin/engineer/123/</loc></url>"
            "<url><loc>https://careers.example.com/job/berlin/designer/456/</loc></url>"
            "</urlset>"
        )

        def page(title: str, url: str, locality: str, country: str) -> str:
            payload = {
                "@type": "JobPosting",
                "title": title,
                "url": url,
                "jobLocation": [{"address": {"addressLocality": locality, "addressCountry": country}}],
            }
            return f'<script type="application/ld+json">{json.dumps(payload)}</script>'

        def fake(request, timeout=15, context=None):
            url = request.full_url
            if url.endswith("sitemap.xml"):
                return DummyResponse(sitemap.encode())
            if "/123/" in url:
                return DummyResponse(page("Site Engineer", url, "Dublin", "IE").encode())
            return DummyResponse(page("Designer", url, "Berlin", "DE").encode())

        with patch("scrapers.providers.sitemap_jsonld.urlopen", side_effect=fake):
            opps = extract_sitemap_opportunities("Example", "https://careers.example.com")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Site Engineer")
        self.assertEqual(opps[0]["location"], "Dublin, IE")

    def test_zoho_adapter_extracts_irish_openings(self) -> None:
        openings = [
            {"id": "1", "Posting_Title": "Site Engineer", "City": "Cork", "Country": "Ireland", "Publish": True},
            {"id": "2", "Posting_Title": "US Manager", "City": "Austin", "Country": "United States", "Publish": True},
        ]
        escaped = json.dumps(openings).replace('"', "&#34;")
        listing = f'<input type="hidden" value="{escaped}" id="jobs">'
        detail = '<script>var x = {"Job_Description":"<p>Build things in Cork.</p>"};</script>'

        def fake(request, timeout=15, context=None):
            url = request.full_url
            return DummyResponse((detail if "/jobs/Careers/1" in url else listing).encode())

        with patch("scrapers.providers.zoho.urlopen", side_effect=fake):
            opps = extract_zoho_opportunities("Occupli", "https://occupli.zohorecruit.com/jobs/Careers")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Site Engineer")
        self.assertIn("Cork", opps[0]["location"])
        self.assertIn("Build things in Cork", opps[0]["description"])

    def test_manatal_adapter_extracts_irish(self) -> None:
        data = {
            "next": None,
            "results": [
                {
                    "hash": "a1",
                    "position_name": "Media Sales Manager",
                    "description": "<p>Dublin role.</p>",
                    "location_display": "Dublin, Ireland",
                    "contract_details": "full_time",
                },
                {"hash": "a2", "position_name": "US Role", "location_display": "New York, United States"},
            ],
        }
        with patch("scrapers.providers.manatal.urlopen", return_value=DummyResponse(json.dumps(data).encode())):
            opps = extract_manatal_opportunities(
                "Think Differently", "https://www.careers-page.com/think-differently/job/RY95V76R"
            )

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Media Sales Manager")
        self.assertEqual(opps[0]["employment_type"], "Full-Time")

    def test_phenom_adapter_extracts_irish(self) -> None:
        def fake(request, timeout=15, context=None):
            body = json.loads(request.data.decode())
            if body.get("ddoKey") == "refineSearch":
                data = {
                    "refineSearch": {
                        "data": {
                            "jobs": [
                                {"jobSeqNo": "S1", "title": "Co-Op Engineer", "cityState": "Dublin", "locale": "en_IE"}
                            ]
                        }
                    }
                }
            else:
                data = {
                    "jobDetail": {"data": {"job": {"description": "<p>Dublin co-op.</p>", "title": "Co-Op Engineer"}}}
                }
            return DummyResponse(json.dumps(data).encode())

        with patch("scrapers.providers.phenom.urlopen", side_effect=fake):
            opps = extract_phenom_opportunities("Activision", "https://careers.activision.com/us/en/job/1")

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "Co-Op Engineer")
        self.assertEqual(opps[0]["url"], "https://careers.activision.com/ie/en/job/S1")


class DayforceAdapterTests(unittest.TestCase):
    def test_parse_dayforce_board_defaults_culture(self) -> None:
        self.assertEqual(
            parse_dayforce_board("https://jobs.dayforcehcm.com/en-US/acme/careers"),
            ("acme", "careers", "en-US"),
        )
        self.assertEqual(
            parse_dayforce_board("https://jobs.dayforcehcm.com/fr-CA/gm/candidateportal"),
            ("gm", "candidateportal", "fr-CA"),
        )
        self.assertEqual(parse_dayforce_board("https://example.com/careers"), ("", "", ""))

    def test_dayforce_keeps_irish_postings_only(self) -> None:
        page = {
            "jobPostings": [
                {
                    "jobPostingId": 1,
                    "jobTitle": "GIS Consultant",
                    "jobDescription": "Dublin role &amp; more",
                    "postingLocations": [{"cityName": "Dublin", "stateCode": "D", "isoCountryCode": "IE"}],
                },
                {
                    "jobPostingId": 2,
                    "jobTitle": "US Role",
                    "jobDescription": "US role",
                    "postingLocations": [{"cityName": "Chicago", "stateCode": "IL", "isoCountryCode": "US"}],
                },
            ],
            "maxCount": 2,
        }

        with (
            patch("scrapers.providers.dayforce._build_opener", return_value=object()),
            patch("scrapers.providers.dayforce._csrf_token", return_value="token"),
            patch("scrapers.providers.dayforce._search_page", return_value=page),
        ):
            opps = extract_dayforce_opportunities(
                "Esri Ireland", "https://jobs.dayforcehcm.com/en-US/esriholdings/ESRI-UK-IRELAND"
            )

        self.assertEqual(len(opps), 1)
        self.assertEqual(opps[0]["title"], "GIS Consultant")
        self.assertEqual(opps[0]["location"], "Dublin, D, IE")
        self.assertEqual(opps[0]["url"], "https://jobs.dayforcehcm.com/en-US/esriholdings/ESRI-UK-IRELAND/jobs/1")
        self.assertIn("Dublin role & more", opps[0]["description"])


if __name__ == "__main__":
    unittest.main()


def test_zoho_filters_all_openings_and_requires_location(monkeypatch):
    import html

    from scrapers.providers import zoho

    foreign = {"Publish": True, "Posting_Title": "Foreign", "City": "London", "Country": "UK", "id": "foreign"}
    irish = {**foreign, "Posting_Title": "Irish", "City": "Dublin", "Country": "Ireland", "id": "irish"}
    remote = {**foreign, "Posting_Title": "Remote", "City": "", "Country": "", "Remote_Job": True, "id": "remote"}
    page = '<input id="jobs" value="' + html.escape(json.dumps([foreign] * 60 + [irish, remote]), quote=True) + '">'
    monkeypatch.setattr(zoho, "_fetch", lambda url: page)
    monkeypatch.setattr(zoho, "_description", lambda host, ident: "Published description")
    results = zoho.extract_zoho_opportunities("Example", "https://example.zohorecruit.eu/jobs/Careers")
    assert [job["title"] for job in results] == ["Irish"]


def test_smartrecruiters_reads_irish_posting_on_later_page():
    foreign = {"id": "foreign", "name": "Role", "location": {"city": "London", "country": "uk"}}
    irish = {"id": "irish", "name": "Irish role", "location": {"city": "Dublin", "country": "ie"}}
    pages = [
        DummyResponse(json.dumps({"content": [foreign] * 100, "totalFound": 101}).encode()),
        DummyResponse(json.dumps({"content": [irish], "totalFound": 101}).encode()),
    ]
    with patch("scrapers.providers.smartrecruiters.urlopen", side_effect=pages) as fetch:
        jobs = extract_smartrecruiters_opportunities("Example", "https://careers.smartrecruiters.com/example")
    assert [job["title"] for job in jobs] == ["Irish role"]
    assert "offset=100" in fetch.call_args.args[0].full_url


def test_greenhouse_malformed_response_is_not_empty():
    import pytest

    with patch("scrapers.providers.greenhouse.urlopen", return_value=DummyResponse(b"{}")):
        with pytest.raises(ValueError):
            extract_greenhouse_opportunities("Example", "https://job-boards.greenhouse.io/example")
