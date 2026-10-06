import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IrelandMarketChart } from './IrelandMarketChart';
import { irelandMarketHistory } from '../../lib/irelandMarket';
import { employmentPermitYears, employmentPermitSources } from '../../lib/employmentPermits';

describe('Ireland line charts', () => {
  it('plots comparable Q2 earnings observations with a legend and switches the pay basis', () => {
    render(<IrelandMarketChart id="ireland-pay-chart" />);
    const legend = screen.getByRole('list', { name: 'Chart legend' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(legend).toHaveTextContent('Average salary');
    expect(screen.queryByText('View data')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    expect(screen.getByRole('button', { name: 'Hourly' })).toHaveAttribute('aria-pressed', 'true');
    expect(legend).toHaveTextContent('Average hourly salary');
  });

  it('keeps three historical lines in actual counts over the full ten-year range', () => {
    render(<IrelandMarketChart id="ireland-labour-chart" />);
    expect(screen.queryByRole('group', { name: 'Workforce chart scale' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Total numbers' })).not.toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Chart legend' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(3);
    expect(legend).toHaveTextContent('Employed or looking for work');
    expect(legend).toHaveTextContent('Unemployed');
    expect(legend).toHaveTextContent('Opportunities');
    expect(screen.getByRole('link', { name: /CSO vacancies/ })).toHaveAttribute('href', 'https://data.cso.ie/table/EHQ16');
    expect(irelandMarketHistory).toHaveLength(10);
    expect(irelandMarketHistory[0]).toMatchObject({ period: 'Q2 2017', labourForce: 2_348_200, vacancies: 19_500, minimumHourly: 9.25 });
    expect(screen.queryByRole('button', { name: '5 years' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10 years' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ireland · Q2 observations, 2017–2026')).not.toBeInTheDocument();
  });

  it('plots the last ten years of employment permits issued as a single annual series', () => {
    render(<IrelandMarketChart id="ireland-permits-chart" />);
    const legend = screen.getByRole('list', { name: 'Chart legend' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(1);
    expect(legend).toHaveTextContent('Employment permits issued');
    expect(screen.queryByRole('group', { name: 'Pay comparison basis' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DETE employment permit statistics/ }))
      .toHaveAttribute('href', employmentPermitSources.statistics);
    expect(employmentPermitYears).toHaveLength(10);
    expect(employmentPermitYears[0]).toEqual({ year: 2016, issued: 9373 });
    expect(employmentPermitYears.at(-1)).toEqual({ year: 2025, issued: 31044 });
  });
});
