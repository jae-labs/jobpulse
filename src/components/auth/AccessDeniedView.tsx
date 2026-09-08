import React from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BrandLogo } from '../ui/BrandLogo';

interface AccessDeniedViewProps {
  email?: string | null;
  error?: string | null;
  onSignOut?: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({ email, error, onSignOut }) => {
  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
      return;
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-black text-zinc-100 selection:bg-white/20">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        {/* JobPulse Logo Mark */}
        <BrandLogo size="xl" className="mb-8" />

        {/* Heading */}
        <h1 className="text-xl font-semibold tracking-tight text-white mb-2">
          Access Restricted
        </h1>

        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          {email ? (
            <>
              <span className="text-zinc-200 font-medium">{email}</span> is not on the authorized access list.
            </>
          ) : (
            'Your account is not authorized to access JobPulse.'
          )}
        </p>

        {error && (
          <div className="w-full text-left rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 mb-6 text-xs space-y-1.5">
            <div className="font-medium text-amber-300">Database setup needed</div>
            <div className="text-zinc-400 leading-normal">
              The <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded">authorized_users</code> table is not yet created in Supabase. Run the <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded">supabase_schema.sql</code> script in your Supabase SQL Editor.
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="w-full">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <LogOut className="size-4 text-zinc-300" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
