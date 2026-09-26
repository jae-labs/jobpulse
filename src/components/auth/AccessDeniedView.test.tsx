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

  it('renders generic verification error callout when error is present without exposing internal infrastructure', () => {
    render(<AccessDeniedView error="Connection refused" />);
    expect(screen.getByText('Unable to verify access')).toBeInTheDocument();
    expect(screen.queryByText(/authorized_users/i)).toBeNull();
    expect(screen.queryByText(/npm run db:push/i)).toBeNull();
    expect(screen.queryByText(/Database setup needed/i)).toBeNull();
  });

  it('handles sign out on button click', async () => {
    const handleSignOut = vi.fn();
    render(<AccessDeniedView onSignOut={handleSignOut} />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(handleSignOut).toHaveBeenCalledTimes(1);
  });
});
