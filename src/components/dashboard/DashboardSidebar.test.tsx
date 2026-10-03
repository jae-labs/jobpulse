import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardSidebar } from './DashboardSidebar';

describe('DashboardSidebar', () => {
  it('shows numeric shortcuts only in the navigation tooltip', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar activeTab="overview" />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Data Sources')).toBeInTheDocument();

    expect(screen.queryAllByText(/^[1-3]$/)).toHaveLength(0);
    const opportunitiesLink = screen.getByRole('link', { name: 'Opportunities' });
    fireEvent.focus(opportunitiesLink);
    expect(screen.getByRole('tooltip')).toHaveTextContent('2');
    expect(opportunitiesLink.querySelector('kbd')).toBeNull();
  });

  it('exposes the navigation shortcut when a collapsed link receives focus', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar activeTab="overview" />
      </MemoryRouter>
    );

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    fireEvent.focus(overviewLink);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Go to Overview');
    expect(screen.getByRole('tooltip')).toHaveTextContent('1');
    expect(overviewLink).toHaveAttribute('aria-keyshortcuts', '1');
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
