"""Unit tests for JobsIreland.ie scraper and card extractor."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from scrapers.core.jobsireland import (
    extract_jobsireland_cards,
    fetch_jobsireland_page,
    parse_longlats_map,
    sync_jobsireland,
)

SAMPLE_JOBSIRELAND_HTML = """
<div class="job-list full paginated job-description-box" id="jobslist">
    <div class="row">
        <input type="hidden" class="totalCount" value="4923" />
        <div class="job-heading position-box" data-vacancyid="2472864" tabindex="0">
            <input type="hidden" id="JobId" value="2472864" />
            <input type="hidden" id="JobReference" value="#JOB-2472864" />
            <input type="hidden" id="JobTitle" value="Chef De Partie" />
            <input type="hidden" id="Location" value="Unit 1, Sallygardens, Ballyjamesduff, Co. Cavan, A82 R983" />
            <input type="hidden" id="StartDate" value="2026-09-30T23:47:04" />
            <input type="hidden" id="EndDate" value="2026-10-28T00:00:00" />
            <div class="paid-btn-box">
                <a href="#" class="paid-btn button position-paid">PAID POSITION</a>
            </div>
            <div class="job-detail-main-box">
                <div class="left-icon-box">
                    <img src="https://jobseeker.jobsireland.ie/logo.png" alt="Logo of FF FLAVOUR HOUSE LIMITED">
                </div>
                <div class="job-detail-right-box">
                    <div class="title-box">
                        <div class="job-title-box">
                            <h3>Chef De Partie</h3>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="job-heading position-box" data-vacancyid="2472850" tabindex="0">
            <input type="hidden" id="JobId" value="2472850" />
            <input type="hidden" id="JobReference" value="#JOB-2472850" />
            <input type="hidden" id="JobTitle" value="Steel Fixer" />
            <input type="hidden" id="Location" value="Ginnets Great, Summerhill, Co. Meath, A83 PF24" />
            <input type="hidden" id="StartDate" value="2026-09-30T21:04:16" />
            <input type="hidden" id="EndDate" value="2026-10-28T00:00:00" />
            <div class="paid-btn-box">
                <a href="#" class="paid-btn button position-paid">PAID POSITION</a>
            </div>
            <div class="job-detail-main-box">
                <div class="left-icon-box">
                    <img src="/Media/Default/images/JobsIrelandAvatar.jpg" alt="Default Logo of Company Details Confidential">
                </div>
                <div class="job-detail-right-box">
                    <div class="title-box">
                        <div class="job-title-box">
                            <h3>Steel Fixer</h3>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<ul class="drop" id="longlats" style="display: none;">
    <li>53.8647041320801;-7.20643520355225;Unit 1, Sallygardens, Ballyjamesduff, Co. Cavan, A82 R983;Chef De Partie;2472864;#JOB-2472864</li>
    <li>53.5221633911133;-6.72537088394165;Ginnets Great, Summerhill, Co. Meath, A83 PF24;Steel Fixer;2472850;#JOB-2472850</li>
</ul>
"""


class TestJobsIreland(unittest.TestCase):
    def test_parse_longlats_map(self) -> None:
        geo = parse_longlats_map(SAMPLE_JOBSIRELAND_HTML)
        self.assertIn("2472864", geo)
        self.assertEqual(geo["2472864"]["lat"], "53.8647041320801")
        self.assertEqual(geo["2472864"]["lon"], "-7.20643520355225")
        self.assertIn("Cavan", geo["2472864"]["address"])

    def test_extract_jobsireland_cards(self) -> None:
        cards = extract_jobsireland_cards(SAMPLE_JOBSIRELAND_HTML)
        self.assertEqual(len(cards), 2)

        job1 = cards[0]
        self.assertEqual(job1["title"], "Chef De Partie")
        self.assertEqual(job1["company"], "FF FLAVOUR HOUSE LIMITED")
        self.assertIn("Co. Cavan", job1["location"])
        self.assertTrue(job1["location"].endswith("Ireland"))
        self.assertEqual(job1["employment_type"], "Paid Position")
        self.assertEqual(job1["url"], "https://jobsireland.ie/en-US/job-Details?id=2472864")
        self.assertEqual(job1["source"], "JobsIreland.ie")
        self.assertIn("53.8647041320801", job1["description"])

        job2 = cards[1]
        self.assertEqual(job2["title"], "Steel Fixer")
        self.assertEqual(job2["company"], "JobsIreland Employer")
        self.assertIn("Co. Meath", job2["location"])
        self.assertEqual(job2["url"], "https://jobsireland.ie/en-US/job-Details?id=2472850")

    @patch("scrapers.core.jobsireland.fetch_page", return_value=SAMPLE_JOBSIRELAND_HTML)
    def test_fetch_jobsireland_page(self, mock_fetch: MagicMock) -> None:
        total, opps = fetch_jobsireland_page(page=1, page_size=100)
        self.assertEqual(total, 4923)
        self.assertEqual(len(opps), 2)
        mock_fetch.assert_called_once()

    @patch("scrapers.core.jobsireland.save_jobs_batch", return_value=2)
    @patch("scrapers.core.jobsireland.update_source_status")
    @patch("scrapers.core.jobsireland.fetch_jobsireland_page")
    def test_sync_jobsireland(
        self,
        mock_fetch_page: MagicMock,
        mock_update_status: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        cards = extract_jobsireland_cards(SAMPLE_JOBSIRELAND_HTML)
        mock_fetch_page.return_value = (2, cards)

        saved, msg = sync_jobsireland(max_pages=1, page_size=2)
        self.assertEqual(saved, 2)
        self.assertIn("JobsIreland.ie: 2 opportunities added or refreshed", msg)
        mock_save.assert_called_once()
        mock_update_status.assert_called_once()


if __name__ == "__main__":
    unittest.main()
