import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import axe from 'axe-core';
import { Button, Card, Pill, TextField } from '../design-system';
import { BrandLogo } from '../components/ui/BrandLogo';
import { StatCard } from '../components/ui/StatCard';
import { StatusPill, MatchScoreBadge } from '../components/ui/StatusPill';

describe('Accessibility (axe-core WCAG AA)', () => {
  it('passes accessibility audits for design-system primitives', async () => {
    const { container } = render(
      <main>
        <Card>
          <h1>Design System Primitives</h1>
          <Button variant="primary" type="button">Action Button</Button>
          <TextField placeholder="Search query" aria-label="Search" />
          <Pill variant="status-new">New Status</Pill>
        </Card>
      </main>
    );

    const results = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    });

    expect(results.violations).toEqual([]);
  });

  it('passes accessibility audits for domain widgets and status badges', async () => {
    const { container } = render(
      <main>
        <BrandLogo size="md" />
        <StatCard
          title="Active Opportunities"
          value={42}
          onClick={() => {}}
          subValue="Total active jobs"
        />
        <StatusPill status="interviewing" />
        <MatchScoreBadge score={88} />
      </main>
    );

    const results = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    });

    expect(results.violations).toEqual([]);
  });
});
