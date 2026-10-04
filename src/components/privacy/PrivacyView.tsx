import { Button, Card, PageHeader } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { useExportAccountMutation } from '../../hooks/useQueries';

export function PrivacyView() {
  const { t } = useTranslation();
  const exportAccount = useExportAccountMutation();
  return <div className="mx-auto max-w-5xl space-y-6 pb-16">
    <Card className="p-5 lg:p-6">
      <PageHeader title={t('privacy.notice')} />
    </Card>
    <Card className="divide-y divide-ds-border px-5 lg:px-6">
      {(['data', 'processing', 'reporting'] as const).map((section) => <section key={section} className="space-y-2 py-5 lg:py-6">
        <h2 className="text-sm font-semibold text-ds-text-primary">{t(`privacy.${section}Title`)}</h2>
        <p className="max-w-prose text-sm leading-relaxed text-ds-text-secondary">{t(`privacy.${section}Body`)}</p>
      </section>)}
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.accessTitle')}</h2>
      <p className="max-w-prose text-sm leading-relaxed text-ds-text-secondary">{t('privacy.accessBody')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={exportAccount.isPending}
          onClick={() => void exportAccount.mutateAsync().catch(() => {})}>
          {exportAccount.isPending ? t('common.loading') : t('privacy.exportAccount')}
        </Button>
      </div>
      {exportAccount.isError && <p role="alert" className="text-xs text-ds-negative">{t('privacy.exportFailed')}</p>}
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.retentionTitle')}</h2>
      <p className="max-w-prose text-sm leading-relaxed text-ds-text-secondary">{t('privacy.retentionBody')}</p>
      <p className="max-w-prose text-sm leading-relaxed text-ds-text-secondary">{t('privacy.deletionBody')}</p>
    </Card>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.contactTitle')}</h2>
      <p className="max-w-prose text-sm leading-relaxed text-ds-text-secondary">{t('privacy.contactBody')}</p>
      <a href="mailto:luiz@justanother.engineer" className="inline-block rounded-ds-control text-sm text-ds-accent hover:underline ds-focus-ring">luiz@justanother.engineer</a>
    </Card>
  </div>;
}
