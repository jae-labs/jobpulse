import React from 'react';
import { LogOut } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { clearAppCache } from '../../lib/queryClient';
import { BrandLogo } from '../ui/BrandLogo';
import { Button } from '../../design-system';

interface AccessDeniedViewProps {
  email?: string | null;
  error?: string | null;
  onSignOut?: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({ email, error, onSignOut }) => {
  const { t } = useTranslation();

  const handleSignOut = async () => {
    clearAppCache();
    if (onSignOut) {
      onSignOut();
      return;
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-ds-canvas text-ds-text-primary selection:bg-ds-selected">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        {/* JobPulse Logo Mark */}
        <BrandLogo size="xl" className="mb-8" />

        {/* Heading */}
        <h1 className="text-xl font-semibold tracking-tight text-ds-text-primary mb-2">
          {t('auth.accessRestricted', 'Access Restricted')}
        </h1>

        <p className="text-xs text-ds-text-muted mb-6 leading-relaxed">
          {email ? (
            <>
              <span className="text-ds-text-secondary font-medium">{email}</span>{' '}
              {t('auth.notOnAccessList', 'is not on the authorized access list.')}
            </>
          ) : (
            t('auth.notAuthorized', 'Your profile is not authorized to access JobPulse.')
          )}
        </p>

        {error && (
          <div className="w-full text-left rounded-xl border border-ds-warning-border bg-ds-warning-subtle p-3.5 mb-6 text-xs space-y-1.5">
            <div className="font-medium text-ds-warning">
              {t('auth.databaseSetupNeeded', 'Database setup needed')}
            </div>
            <div className="text-ds-text-muted leading-normal">
              <Trans i18nKey="auth.databaseSetupInstructions">
                The <code className="text-ds-warning bg-ds-warning-muted-bg px-1 py-0.5 rounded">authorized_users</code> table is not yet created in Supabase. Apply the database migrations in <code className="text-ds-warning bg-ds-warning-muted-bg px-1 py-0.5 rounded">supabase/migrations</code> via <code className="text-ds-warning bg-ds-warning-muted-bg px-1 py-0.5 rounded">npm run db:push</code>.
              </Trans>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="w-full">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => void handleSignOut()}
            className="w-full gap-2 font-semibold"
          >
            <LogOut className="size-4 text-ds-text-secondary" />
            <span>{t('auth.signOut', 'Log out')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
