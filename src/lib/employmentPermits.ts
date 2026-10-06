// Annual employment permits, including renewals.
// Total issued figures extracted from the Department of Enterprise, Tourism and
// Employment "Permits by nationality" spreadsheets (Grand Total / Total column):
// https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/statistics/
// 2016-2019 use the "Total" column (New + Renewal); 2020 onwards use the "Issued" Grand Total.
export const employmentPermitYears = [
  { year: 2016, issued: 9373 },
  { year: 2017, issued: 11361 },
  { year: 2018, issued: 13398 },
  { year: 2019, issued: 16383 },
  { year: 2020, issued: 16419 },
  { year: 2021, issued: 16275 },
  { year: 2022, issued: 39955 },
  { year: 2023, issued: 30981 },
  { year: 2024, issued: 39390 },
  { year: 2025, issued: 31044 },
] as const;

export const employmentPermitSources = {
  statistics: 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/statistics/',
} as const;
