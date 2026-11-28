import { Card, PageHeader } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { AccountDataControls } from './AccountDataControls';

interface PrivacyViewProps {
  userEmail?: string | null;
  onDeleteAccount: (confirmation: string) => Promise<void>;
}

export function PrivacyView({ userEmail, onDeleteAccount }: PrivacyViewProps) {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-5xl space-y-6 pb-16">
    <Card className="p-5 lg:p-6">
      <PageHeader title={t('privacy.notice')} />
    </Card>
    <Card className="divide-y divide-ds-border px-5 lg:px-6">
      {(['data', 'processing', 'reporting'] as const).map((section) => <section key={section} className="space-y-2 py-5 lg:py-6">
        <h2 className="text-sm font-semibold text-ds-text-primary">{t(`privacy.${section}Title`)}</h2>
        <p className="text-sm leading-relaxed text-ds-text-secondary">{t(`privacy.${section}Body`)}</p>
      </section>)}
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.accessTitle')}</h2>
      <p className="text-sm leading-relaxed text-ds-text-secondary">{t('privacy.accessBody')}</p>
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.retentionTitle')}</h2>
      <p className="text-sm leading-relaxed text-ds-text-secondary">{t('privacy.retentionBody')}</p>
      <p className="text-sm leading-relaxed text-ds-text-secondary">{t('privacy.deletionBody')}</p>
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.contactTitle')}</h2>
      <p className="text-sm leading-relaxed text-ds-text-secondary">{t('privacy.contactBody')}</p>
      <a href="mailto:luiz@justanother.engineer" className="inline-block rounded-ds-control text-sm text-ds-accent hover:underline ds-focus-ring">luiz@justanother.engineer</a>
    </Card>
    <AccountDataControls userEmail={userEmail} onDeleteAccount={onDeleteAccount} />
  </div>;
}
