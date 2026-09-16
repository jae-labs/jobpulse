import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessDeniedView } from './AccessDeniedView';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

vi.mock('../../lib/queryClient', () => ({
  clearAppCache: vi.fn(),
}));

describe('AccessDeniedView', () => {
  it('renders restricted heading and unauthorized user email', () => {
    render(<AccessDeniedView email="unauthorized@example.com" />);
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText('unauthorized@example.com')).toBeInTheDocument();
  });

  it('renders database migration instructions when error is present', () => {
    render(<AccessDeniedView error="Table not found" />);
    expect(screen.getByText('Database setup needed')).toBeInTheDocument();
  });

  it('handles sign out on button click', async () => {
    const handleSignOut = vi.fn();
    render(<AccessDeniedView onSignOut={handleSignOut} />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(handleSignOut).toHaveBeenCalledTimes(1);
  });
});
