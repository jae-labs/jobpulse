"""Unit tests for WhatJobs Ireland publisher feed adapter."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from scrapers.core.whatjobs import (
    extract_whatjobs_items,
    fetch_whatjobs_page,
    parse_whatjobs_external_id,
    sync_whatjobs,
)

SAMPLE_WHATJOBS_DATA = [
    {
        "title": "Principal environmental consultant",
        "location": "Dublin",
        "url": "https://ie.whatjobs.com/pub_api__cpl__5985510__7127?utm_campaign=publisher&geoID=253",
        "snippet": "<p>Consulting and support services across Ireland.</p> #J-18808-Ljbffr",
        "company": "AtkinsRéalis",
        "job_type": "Regular",
    },
    {
        "title": "Software Engineer",
        "location": "Cork, Ireland",
        "url": "https://ie.whatjobs.com/pub_api__cpl__5985511__7127",
        "snippet": "<p>Develop cutting-edge Python applications in Cork.</p>",
        "company": "Confidential",
        "job_type": "Full-time",
    },
    {
        "title": "Privacy Policy",
        "location": "Galway",
        "url": "https://ie.whatjobs.com/pub_api__cpl__5985512__7127",
        "snippet": "",
        "company": "Some Company",
        "job_type": "",
    },
]


class TestWhatJobs(unittest.TestCase):
    def test_parse_whatjobs_external_id(self) -> None:
        url = "https://ie.whatjobs.com/pub_api__cpl__5985510__7127?utm_campaign=test"
        ext_id = parse_whatjobs_external_id(url)
        self.assertEqual(ext_id, "5985510")

        no_id_url = "https://example.com/job/123"
        self.assertEqual(parse_whatjobs_external_id(no_id_url), "")

    def test_extract_whatjobs_items(self) -> None:
        opps = extract_whatjobs_items(SAMPLE_WHATJOBS_DATA)
        self.assertEqual(len(opps), 2)

        job1 = opps[0]
        self.assertEqual(job1["title"], "Principal environmental consultant")
        self.assertEqual(job1["company"], "AtkinsRéalis")
        self.assertEqual(job1["location"], "Dublin, Ireland")
        self.assertEqual(job1["employment_type"], "Full-time")
        self.assertEqual(job1["source"], "WhatJobs Ireland")
        self.assertNotIn("#J-18808-Ljbffr", job1["description"])

        job2 = opps[1]
        self.assertEqual(job2["title"], "Software Engineer")
        self.assertEqual(job2["company"], "Employer (via WhatJobs)")
        self.assertEqual(job2["location"], "Cork, Ireland")

    @patch("scrapers.core.whatjobs.fetch_page")
    def test_fetch_whatjobs_page(self, mock_fetch: MagicMock) -> None:
        mock_fetch.return_value = json.dumps({"data": SAMPLE_WHATJOBS_DATA})
        opps = fetch_whatjobs_page(page=1, publisher_id="7127", limit=10)
        self.assertEqual(len(opps), 2)
        mock_fetch.assert_called_once()

    @patch("scrapers.core.whatjobs.save_jobs_batch", return_value=2)
    @patch("scrapers.core.whatjobs.update_source_status")
    @patch("scrapers.core.whatjobs.fetch_whatjobs_page")
    def test_sync_whatjobs(
        self,
        mock_fetch_page: MagicMock,
        mock_update_status: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        opps = extract_whatjobs_items(SAMPLE_WHATJOBS_DATA)
        mock_fetch_page.side_effect = [opps, []]

        saved, msg = sync_whatjobs(max_pages=2, publisher_id="7127")
        self.assertEqual(saved, 2)
        self.assertIn("WhatJobs Ireland: 2 opportunities added or refreshed", msg)
        mock_save.assert_called_once()
        mock_update_status.assert_called_once()


if __name__ == "__main__":
    unittest.main()
