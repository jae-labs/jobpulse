import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationsPanel } from './NotificationsPanel';

describe('NotificationsPanel', () => {
  it('opens an accessible empty notifications sheet and returns focus when closed', async () => {
    render(<NotificationsPanel />);
    const bell = screen.getByRole('button', { name: 'Open notifications' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('data-side', 'right');
    expect(panel).toHaveAttribute('data-motion', 'slide');
    expect(screen.getByRole('heading', { name: 'No notifications yet' })).toBeInTheDocument();
    expect(screen.getByText('New updates will appear here.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(bell).toHaveFocus());
  });

  it('dismisses with Escape', async () => {
    render(<NotificationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
