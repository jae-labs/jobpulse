import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { BrandLogo } from '../ui/BrandLogo';
import { reportError } from '../../lib/logger';
import { Button } from '@jae-labs/ui';

interface LoginViewProps {
  onSignInError?: (error: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSignInError }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const inviteEmail = searchParams?.get('email');

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!supabase) {
        throw new Error('Supabase client is not initialized');
      }

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (err: unknown) {
      reportError(err);
      const message = err instanceof Error ? err.message : t('auth.signInErrorDefault', 'Unable to sign in with Google');
      setError(message);
      onSignInError?.(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-ds-canvas text-ds-text-primary selection:bg-ds-selected overflow-hidden">
      {/* Background Subtle Gradient Glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,var(--ds-color-accent-subtle)_0%,transparent_60%)]"
      />

      <div className="relative z-10 w-full max-w-[340px] flex flex-col items-center text-center">
        {/* JobPulse Minimalist Logo Mark */}
        <BrandLogo size="xl" className="mb-6" />

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary mb-6">
          {t('auth.loginTitle', 'Log in to JobPulse')}
        </h1>

        {/* Invitation Banner */}
        {inviteEmail && (
          <div className="mb-6 w-full rounded-xl border border-ds-accent/40 bg-ds-accent/10 p-3.5 text-xs text-ds-text-primary text-center animate-in fade-in-50">
            <p className="font-semibold text-ds-accent">
              {t('auth.invitationBannerTitle', "You've been invited to JobPulse!")}
            </p>
            <p className="text-ds-text-secondary mt-1 font-mono text-[11px] truncate">
              {inviteEmail}
            </p>
            <p className="text-ds-text-muted mt-1 text-[11px]">
              {t('auth.invitationBannerSubtitle', 'Sign in with Google to claim your access.')}
            </p>
          </div>
        )}

        {/* Action Button: Design-system Button */}
        <div className="w-full flex flex-col items-center">
          <Button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isLoading}
            size="lg"
            className="w-full max-w-[320px] rounded-full shadow-lg"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin" />
                <span>{t('auth.connecting', 'Connecting...')}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <svg
                  className="size-4 shrink-0 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{t('auth.continueWithGoogle', 'Continue with Google')}</span>
              </span>
            )}
          </Button>

          {/* Optional Error Display */}
          {error && (
            <p className="text-xs text-ds-negative pt-3 animate-fadeIn">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
