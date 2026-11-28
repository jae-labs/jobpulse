import { consumeInvitationParameters } from '../../lib/invitationContext';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginView } from './LoginView';

// Mock supabase client
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe('LoginView', () => {
  it('renders login heading and Google sign-in button', () => {
    consumeInvitationParameters();
    render(<LoginView />);
    expect(screen.getByText('Log in to JobPulse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('triggers signInWithOAuth when clicking the continue button', async () => {
    const { supabase } = await import('../../lib/supabase');
    consumeInvitationParameters();
    render(<LoginView />);

    const button = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(button);

    expect(supabase?.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        queryParams: expect.objectContaining({ prompt: 'select_account' }),
      }),
    });
  });

  it('renders the invitation banner while clearing sensitive URL parameters', () => {
    window.history.replaceState({}, '', '/?invite=token123&email=invited%40example.com');
    consumeInvitationParameters();
    render(<LoginView />);
    expect(screen.getByText(/You've been invited to JobPulse!/i)).toBeInTheDocument();
    expect(screen.getByText('invited@example.com')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});
