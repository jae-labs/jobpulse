// Irish labour-market chart sources and explicit annualisation assumptions.
export const irelandMarket = {
  minimumWageHoursPerWeek: 39,
  weeksPerYear: 52,
  sources: {
    labourHistory: 'https://data.cso.ie/table/QLF01',
    earningsHistory: 'https://data.cso.ie/table/EHQ03',
    vacanciesHistory: 'https://data.cso.ie/table/EHQ16',
    wageHistory: 'https://www.workplacerelations.ie/en/what_you_should_know/hours-and-wages/national%20minimum%20wage/previous-rates-of-pay-under-the-national-minimum-wage.html',
  },
} as const;

export const irelandMarketChartIds = ['ireland-labour-chart', 'ireland-pay-chart', 'ireland-permits-chart'] as const;
export type IrelandMarketChartId = typeof irelandMarketChartIds[number];

// Q2 observations, not annual averages; extracted from QLF01, EHQ03 and EHQ16
// (all sexes / employees / sectors), dataset releases 20 and 25 August 2026.
// QLF01 reports thousands: converted to whole people. Minimum wage is the adult
// rate in force at Q2, sourced from Government / WRC published rates.
export const irelandMarketHistory = [
  { period: 'Q2 2017', labourForce: 2348200, unemployed: 160800, vacancies: 19500, meanWeekly: 720.52, meanHourly: 22.27, minimumHourly: 9.25 },
  { period: 'Q2 2018', labourForce: 2407500, unemployed: 145900, vacancies: 22100, meanWeekly: 745.03, meanHourly: 22.94, minimumHourly: 9.55 },
  { period: 'Q2 2019', labourForce: 2443700, unemployed: 132200, vacancies: 21600, meanWeekly: 771.39, meanHourly: 23.69, minimumHourly: 9.8 },
  { period: 'Q2 2020', labourForce: 2283900, unemployed: 122600, vacancies: 13800, meanWeekly: 817.34, meanHourly: 25.38, minimumHourly: 10.1 },
  { period: 'Q2 2021', labourForce: 2568600, unemployed: 186400, vacancies: 24100, meanWeekly: 851.14, meanHourly: 26.08, minimumHourly: 10.2 },
  { period: 'Q2 2022', labourForce: 2722300, unemployed: 121100, vacancies: 35300, meanWeekly: 873.32, meanHourly: 26.76, minimumHourly: 10.5 },
  { period: 'Q2 2023', labourForce: 2804900, unemployed: 122200, vacancies: 29100, meanWeekly: 912.12, meanHourly: 28.19, minimumHourly: 11.3 },
  { period: 'Q2 2024', labourForce: 2885400, unemployed: 131200, vacancies: 29500, meanWeekly: 964.54, meanHourly: 29.75, minimumHourly: 12.7 },
  { period: 'Q2 2025', labourForce: 2958900, unemployed: 140800, vacancies: 31500, meanWeekly: 1007.58, meanHourly: 30.79, minimumHourly: 13.5 },
  { period: 'Q2 2026', labourForce: 2990200, unemployed: 151000, vacancies: 30000, meanWeekly: 1046.88, meanHourly: 31.96, minimumHourly: 14.15 },
] as const;
