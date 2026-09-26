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
    render(<LoginView />);
    expect(screen.getByText('Log in to JobPulse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('triggers signInWithOAuth when clicking the continue button', async () => {
    const { supabase } = await import('../../lib/supabase');
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

  it('renders invitation banner when invite email is present in URL', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        search: '?invite=token123&email=invited%40example.com',
      },
    });

    render(<LoginView />);

    expect(screen.getByText(/You've been invited to JobPulse!/i)).toBeInTheDocument();
    expect(screen.getByText('invited@example.com')).toBeInTheDocument();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
