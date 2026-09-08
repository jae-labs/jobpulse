import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BrandLogo } from '../ui/BrandLogo';

interface LoginViewProps {
  onSignInError?: (error: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = () => {
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
      setError(err?.message || 'Failed to connect to Google.');
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-black text-zinc-100 selection:bg-white/20">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        {/* JobPulse Minimalist Logo Mark */}
        <BrandLogo size="xl" className="mb-8" />

        {/* Title */}
        <h1 className="text-xl font-semibold tracking-tight text-white mb-8">
          Log in to JobPulse
        </h1>

        {/* Action Button */}
        <div className="w-full space-y-4">
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 text-white text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin" />
                <span>Connecting...</span>
              </span>
            ) : (
              'Continue with Google'
            )}
          </button>

          {/* Optional Error Display */}
          {error && (
            <p className="text-xs text-rose-400 pt-2 animate-fadeIn">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
