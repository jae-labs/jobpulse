import { Suspense } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OverviewView } from './OverviewView';
import type { OverviewMetrics, Job } from '../../types/job';

const mockMetrics: OverviewMetrics = {
  total: 120,
  high_fit: 45,
  counts: {
    new: 70,
    applied: 25,
    interviewing: 15,
    interested: 8,
    not_interested: 2,
  },
  stage_averages: { new: 84, applied: 88, interviewing: 91, interested: 86, not_interested: 58 },
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
      JSON.stringify(['high-fit-opportunities', 'tracked-opportunities']),
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

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', domain: 'all', minMatch: 0 });
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

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', domain: 'all', minMatch: 75 });
  });
});
