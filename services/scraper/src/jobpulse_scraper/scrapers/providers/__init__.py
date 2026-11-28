"""Provider-specific careers-board adapters."""

from jobpulse_scraper.scrapers.providers.amazon import extract_amazon_opportunities
from jobpulse_scraper.scrapers.providers.ashby import extract_ashby_opportunities
from jobpulse_scraper.scrapers.providers.bamboohr import extract_bamboohr_opportunities
from jobpulse_scraper.scrapers.providers.booklets import extract_booklet_opportunities
from jobpulse_scraper.scrapers.providers.breezy import extract_breezy_opportunities
from jobpulse_scraper.scrapers.providers.candidatemanager import extract_candidatemanager_opportunities
from jobpulse_scraper.scrapers.providers.corehr_tables import (
    extract_corehr_table_opportunities,
    extract_thehirelab_opportunities,
)
from jobpulse_scraper.scrapers.providers.dayforce import extract_dayforce_opportunities
from jobpulse_scraper.scrapers.providers.eightfold import extract_eightfold_opportunities
from jobpulse_scraper.scrapers.providers.greenhouse import extract_greenhouse_opportunities
from jobpulse_scraper.scrapers.providers.hubspot import extract_hubspot_opportunities
from jobpulse_scraper.scrapers.providers.icims import extract_icims_opportunities
from jobpulse_scraper.scrapers.providers.jobtrain import extract_jobtrain_opportunities
from jobpulse_scraper.scrapers.providers.jsonld import extract_jsonld_opportunities
from jobpulse_scraper.scrapers.providers.lever import extract_lever_opportunities
from jobpulse_scraper.scrapers.providers.lidl import extract_lidl_opportunities
from jobpulse_scraper.scrapers.providers.linkedin import extract_linkedin_opportunities
from jobpulse_scraper.scrapers.providers.manatal import extract_manatal_opportunities
from jobpulse_scraper.scrapers.providers.musgrave import extract_musgrave_opportunities
from jobpulse_scraper.scrapers.providers.oracle import extract_oracle_opportunities
from jobpulse_scraper.scrapers.providers.personio import extract_personio_opportunities
from jobpulse_scraper.scrapers.providers.phenom import extract_phenom_opportunities
from jobpulse_scraper.scrapers.providers.pinpoint import extract_pinpoint_opportunities
from jobpulse_scraper.scrapers.providers.recruitee import extract_recruitee_opportunities
from jobpulse_scraper.scrapers.providers.rezoomo import extract_rezoomo_opportunities
from jobpulse_scraper.scrapers.providers.rippling import extract_rippling_opportunities
from jobpulse_scraper.scrapers.providers.sitemap_jsonld import extract_sitemap_opportunities
from jobpulse_scraper.scrapers.providers.smartrecruiters import extract_smartrecruiters_opportunities
from jobpulse_scraper.scrapers.providers.teamtailor import extract_teamtailor_opportunities
from jobpulse_scraper.scrapers.providers.ukg import extract_ukg_opportunities
from jobpulse_scraper.scrapers.providers.workable import extract_workable_opportunities
from jobpulse_scraper.scrapers.providers.workday import extract_workday_opportunities
from jobpulse_scraper.scrapers.providers.zoho import extract_zoho_opportunities

__all__ = [
    "extract_amazon_opportunities",
    "extract_ashby_opportunities",
    "extract_bamboohr_opportunities",
    "extract_booklet_opportunities",
    "extract_breezy_opportunities",
    "extract_candidatemanager_opportunities",
    "extract_corehr_table_opportunities",
    "extract_dayforce_opportunities",
    "extract_eightfold_opportunities",
    "extract_greenhouse_opportunities",
    "extract_hubspot_opportunities",
    "extract_icims_opportunities",
    "extract_jobtrain_opportunities",
    "extract_jsonld_opportunities",
    "extract_lever_opportunities",
    "extract_lidl_opportunities",
    "extract_linkedin_opportunities",
    "extract_manatal_opportunities",
    "extract_musgrave_opportunities",
    "extract_oracle_opportunities",
    "extract_personio_opportunities",
    "extract_phenom_opportunities",
    "extract_pinpoint_opportunities",
    "extract_recruitee_opportunities",
    "extract_rezoomo_opportunities",
    "extract_rippling_opportunities",
    "extract_sitemap_opportunities",
    "extract_smartrecruiters_opportunities",
    "extract_teamtailor_opportunities",
    "extract_thehirelab_opportunities",
    "extract_ukg_opportunities",
    "extract_workable_opportunities",
    "extract_workday_opportunities",
    "extract_zoho_opportunities",
]
