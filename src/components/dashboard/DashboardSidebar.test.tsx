import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardSidebar } from './DashboardSidebar';

describe('DashboardSidebar', () => {
  it('renders navigation items with numeric shortcut badges', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar activeTab="overview" />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Data Sources')).toBeInTheDocument();

    const badges = screen.getAllByText(/^[1-3]$/);
    expect(badges).toHaveLength(3);
    expect(badges.map((b) => b.textContent)).toEqual(['1', '2', '3']);
  });

  it('updates title with shortcut number when sidebar is collapsed', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar activeTab="overview" />
      </MemoryRouter>
    );

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toHaveAttribute('title', expect.stringContaining('(1)'));
  });

  it('releases sidebar link focus after a pointer click', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar activeTab="overview" />
      </MemoryRouter>
    );

    const opportunitiesLink = screen.getByRole('link', { name: /opportunities/i });
    opportunitiesLink.focus();
    fireEvent.click(opportunitiesLink, { detail: 1 });

    expect(opportunitiesLink).not.toHaveFocus();
  });
});
