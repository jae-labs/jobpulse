import { Suspense } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OverviewView } from './OverviewView';
import type { OverviewMetrics, Job } from '../../types/job';

const mockMetrics: OverviewMetrics = {
  total: 120, evaluated: 45, locations: [],
  high_fit: 45,
  counts: {
    new: 70,
    applied: 25,
    interviewing: 15,
    saved: 8,
    not_interested: 2,
  },
  stage_averages: { new: 84, applied: 88, interviewing: 91, saved: 86, not_interested: 58 },
  categories: [
    { name: 'Cloud & Platform Engineering', value: 50, avgMatch: 88 },
    { name: 'Cybersecurity', value: 30, avgMatch: 82 },
  ],
  relevance_distribution: [
    { range: '90-100%', min: 90, max: 100, count: 20 },
    { range: '80-89%', min: 80, max: 89, count: 25 },
  ],
  top_skills: [
    { skill: 'Kubernetes', count: 40, percentage: 80 },
    { skill: 'Terraform', count: 35, percentage: 70 },
  ],
};

const mockJobs: Job[] = [
  {
    id: 1,
    title: 'Staff Platform Engineer',
    company: 'Stripe',
    location: 'Dublin',
    employment_type: 'Permanent',
    salary_text: '€120,000',
    url: 'https://example.com/jobs/1',
    source: 'direct',
    status: 'new',
    relevance: 95,
    last_seen_at: '2026-09-01T10:00:00Z',
    matched_skills: ['Kubernetes', 'Go'],
  },
];

describe('OverviewView', () => {
  afterEach(() => window.localStorage.clear());

  it('restores widget order for the signed-in user', async () => {
    window.localStorage.setItem(
      'jobpulse:overview-widget-order:test-user',
      JSON.stringify(['high-fit-opportunities', 'ireland-enterprises', 'tracked-opportunities', 'ireland-labour-force', 'ireland-unemployment', 'ireland-minimum-wage', 'ireland-average-earnings', 'ireland-opportunities']),
    );
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          userId="test-user"
          overviewMetrics={mockMetrics}
          jobs={mockJobs}
          onNavigateToJobs={vi.fn()}
        />
      </Suspense>
    );

    const highFit = await screen.findByText('High-Match');
    const tracked = await screen.findByText('Opportunities');
    expect(highFit.compareDocumentPosition(tracked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Obsolete reference widgets are filtered from saved layouts; charts remain.
    expect(await screen.findByRole('heading', { name: 'Ireland · workforce & opportunities' })).toBeInTheDocument();
    expect(screen.queryByText('Enterprises · 10+ people')).not.toBeInTheDocument();
    const order: string[] = JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-order:test-user')!);
    expect(order).not.toContain('ireland-enterprises');
    expect(order).toContain('ireland-pay-chart');
  });

  it('keeps historical charts without the six removed reference cards', async () => {
    render(<OverviewView overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Ireland · workforce & opportunities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ireland · minimum wage & mean earnings' })).toBeInTheDocument();
    for (const label of ['Enterprises · 10+ people', 'Labour force · estimate', 'Unemployment', 'Minimum wage', 'Mean earnings · annualised', 'JobsIreland opportunities']) {
      expect(screen.queryByRole('heading', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Fixed reference')).not.toBeInTheDocument();
  });

  it('uses the same shared sector for chart navigation and opportunities', async () => {
    const navigate = vi.fn();
    render(<Suspense fallback={<div>Loading...</div>}>
      <OverviewView overviewMetrics={{ ...mockMetrics, categories: [{ name: 'Synthetic Sector', value: 120, avgMatch: 88 }] }} onNavigateToJobs={navigate} />
    </Suspense>);
    fireEvent.click(await screen.findByTitle('Synthetic Sector'));
    expect(navigate).toHaveBeenCalledWith({ status: 'all', sector: 'Synthetic Sector', minMatch: 0 });
  });

  it('renders summary stat cards with correct metrics', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          jobs={mockJobs}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(await screen.findByText('45')).toBeInTheDocument();
  });

  it('shows each pipeline stage average alongside its count', async () => {
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView overviewMetrics={mockMetrics} jobs={mockJobs} onNavigateToJobs={vi.fn()} />
      </Suspense>
    );

    expect(await screen.findByText('84% avg match')).toBeInTheDocument();
    expect(screen.getByText('91% avg match')).toBeInTheDocument();
  });

  it('triggers navigation when stat card is clicked', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          jobs={mockJobs}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    const totalOpportunitiesCard = (await screen.findByText('Opportunities')).closest('button');
    expect(totalOpportunitiesCard).not.toBeNull();
    fireEvent.click(totalOpportunitiesCard!);

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', sector: 'all', minMatch: 0 });
  });

  it('navigates to high-fit filter when high-fit card is clicked', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          jobs={mockJobs}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    const highFitCard = (await screen.findByText('High-Match')).closest('button');
    expect(highFitCard).not.toBeNull();
    fireEvent.click(highFitCard!);

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', sector: 'all', minMatch: 75 });
  });
});
