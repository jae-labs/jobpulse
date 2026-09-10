import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { JobCard } from './JobCard';
import type { Job } from '../../types/job';

const mockJob: Job = {
  id: 101,
  title: 'Principal Software Engineer',
  company: 'Acme Corp',
  location: 'Remote, UK',
  employment_type: 'Full-time',
  role_domain: 'Engineering',
  salary_text: '£110,000 - £130,000',
  description: 'Design and build resilient distributed systems.',
  url: 'https://example.com/jobs/1',
  source: 'direct',
  status: 'new',
  relevance: 92,
  last_seen_at: '2026-09-01T10:00:00Z',
  matched_skills: ['TypeScript', 'React', 'Go', 'Kubernetes'],
};

describe('JobCard', () => {
  it('renders job metadata correctly including title, company, location, and skills', () => {
    const handleSelect = vi.fn();
    render(<JobCard job={mockJob} onSelect={handleSelect} />);

    expect(screen.getByText('Principal Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Remote, UK')).toBeInTheDocument();
    expect(screen.getByText('£110,000 - £130,000')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('triggers onSelect callback when clicked', () => {
    const handleSelect = vi.fn();
    render(<JobCard job={mockJob} onSelect={handleSelect} />);

    const card = screen.getByRole('button', { name: /principal software engineer/i });
    fireEvent.click(card);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(mockJob);
  });

  it('uses a native button so keyboard users receive built-in activation support', () => {
    const handleSelect = vi.fn();
    render(<JobCard job={mockJob} onSelect={handleSelect} isSelected />);

    const card = screen.getByRole('button', { name: /principal software engineer/i });
    expect(card).toHaveAttribute('type', 'button');
    expect(card).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders fallback company when company is empty or dot', () => {
    const jobWithoutCompany = { ...mockJob, company: '.' };
    render(<JobCard job={jobWithoutCompany} onSelect={vi.fn()} />);

    expect(screen.getByText('Public sector')).toBeInTheDocument();
  });
});
