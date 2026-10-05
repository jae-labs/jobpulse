"""JobPulse configuration and metadata package."""

from config.loader import (
    INTEL_CAREERS_URL,
    INTEL_JOBS_URL,
    KILDARE_CAREERS_URL,
    MAYNOOTH_SEARCH_URL,
    PUBLICJOBS_URL,
    get_employers_tuples,
    load_websites_config,
    validate_websites_config,
)
from config.rules import (
    ALLOWED_SINGLE_WORD_JOBS,
    ERROR_ANTI_BOT_PATTERNS,
    GENERIC_NON_JOB_TITLES,
    NON_IRELAND_PATTERNS,
    SPECIFIC_IRISH_PLACES,
)

__all__ = [
    "KILDARE_CAREERS_URL",
    "PUBLICJOBS_URL",
    "MAYNOOTH_SEARCH_URL",
    "INTEL_JOBS_URL",
    "INTEL_CAREERS_URL",
    "load_websites_config",
    "get_employers_tuples",
    "validate_websites_config",
    "GENERIC_NON_JOB_TITLES",
    "ALLOWED_SINGLE_WORD_JOBS",
    "NON_IRELAND_PATTERNS",
    "SPECIFIC_IRISH_PLACES",
    "ERROR_ANTI_BOT_PATTERNS",
]
