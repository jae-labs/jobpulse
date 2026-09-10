import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders title, value, and badgeText', () => {
    render(<StatCard title="Tracked Roles" value={142} badgeText="Active" />);
    expect(screen.getByText('Tracked Roles')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('triggers onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<StatCard title="Clickable" value={10} onClick={handleClick} />);
    fireEvent.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('displays change percentage and label correctly', () => {
    render(
      <StatCard
        title="Conversion"
        value="45%"
        changePercent={12}
        changeLabel="vs last week"
      />
    );
    expect(screen.getByText('↑ 12%')).toBeInTheDocument();
    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });
});
