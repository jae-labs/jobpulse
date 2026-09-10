import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BrandLogo } from '../ui/BrandLogo';

interface LoginViewProps {
  onSignInError?: (error: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSignInError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!supabase) {
        throw new Error('Supabase client is not configured.');
      }

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to connect to Google.';
      setError(msg);
      onSignInError?.(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-black text-zinc-100 selection:bg-white/20 overflow-hidden">
      {/* Subtle Linear-style ambient purple glow in background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.09)_0%,transparent_60%)]"
      />

      <div className="relative z-10 w-full max-w-[340px] flex flex-col items-center text-center">
        {/* JobPulse Minimalist Logo Mark */}
        <BrandLogo size="xl" className="mb-6" />

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-8">
          Log in to JobPulse
        </h1>

        {/* Action Button: Linear-style pill gradient button */}
        <div className="w-full flex flex-col items-center">
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isLoading}
            className="group w-full max-w-[320px] h-11 sm:h-12 rounded-full bg-gradient-to-r from-[#5a64d8] via-[#6366f1] to-[#7952e8] hover:from-[#656fe2] hover:via-[#6c70f8] hover:to-[#845df0] text-white text-sm font-medium flex items-center justify-center transition-all duration-150 cursor-pointer border border-white/25 shadow-[0_2px_12px_rgba(99,102,241,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_4px_20px_rgba(99,102,241,0.45)] active:scale-[0.985] disabled:opacity-70 disabled:cursor-not-allowed select-none"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin text-white" />
                <span>Connecting...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <svg
                  className="size-4 shrink-0 fill-current text-white"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </span>
            )}
          </button>

          {/* Optional Error Display */}
          {error && (
            <p className="text-xs text-rose-400 pt-3 animate-fadeIn">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
