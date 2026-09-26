"""Provider-specific careers-board adapters.

Each adapter receives an employer, listing URL, and optional HTML/API payload, then
returns normalized opportunity records without database side effects.
"""

from scrapers.providers.amazon import extract_amazon_opportunities
from scrapers.providers.ashby import extract_ashby_opportunities
from scrapers.providers.bamboohr import extract_bamboohr_opportunities
from scrapers.providers.booklets import extract_booklet_opportunities
from scrapers.providers.candidatemanager import extract_candidatemanager_opportunities
from scrapers.providers.corehr_tables import (
    extract_corehr_table_opportunities,
    extract_thehirelab_opportunities,
)
from scrapers.providers.greenhouse import extract_greenhouse_opportunities
from scrapers.providers.hubspot import extract_hubspot_opportunities
from scrapers.providers.jobtrain import extract_jobtrain_opportunities
from scrapers.providers.jsonld import extract_jsonld_opportunities
from scrapers.providers.lever import extract_lever_opportunities
from scrapers.providers.lidl import extract_lidl_opportunities
from scrapers.providers.linkedin import extract_linkedin_opportunities
from scrapers.providers.musgrave import extract_musgrave_opportunities
from scrapers.providers.oracle import extract_oracle_opportunities
from scrapers.providers.personio import extract_personio_opportunities
from scrapers.providers.rezoomo import extract_rezoomo_opportunities
from scrapers.providers.smartrecruiters import extract_smartrecruiters_opportunities
from scrapers.providers.teamtailor import extract_teamtailor_opportunities
from scrapers.providers.workable import extract_workable_opportunities
from scrapers.providers.workday import extract_workday_opportunities

__all__ = [
    "extract_amazon_opportunities",
    "extract_ashby_opportunities",
    "extract_bamboohr_opportunities",
    "extract_booklet_opportunities",
    "extract_candidatemanager_opportunities",
    "extract_corehr_table_opportunities",
    "extract_greenhouse_opportunities",
    "extract_hubspot_opportunities",
    "extract_jobtrain_opportunities",
    "extract_jsonld_opportunities",
    "extract_lever_opportunities",
    "extract_lidl_opportunities",
    "extract_linkedin_opportunities",
    "extract_musgrave_opportunities",
    "extract_oracle_opportunities",
    "extract_personio_opportunities",
    "extract_rezoomo_opportunities",
    "extract_smartrecruiters_opportunities",
    "extract_teamtailor_opportunities",
    "extract_thehirelab_opportunities",
    "extract_workable_opportunities",
    "extract_workday_opportunities",
]
