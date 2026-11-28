import { useId, useState } from 'react';
import { Button, Card, Dialog, DialogContent, TextField } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { useExportAccountMutation } from '../../hooks/useQueries';

interface AccountDataControlsProps {
  userEmail?: string | null;
  onDeleteAccount: (confirmation: string) => Promise<void>;
}

export function AccountDataControls({ userEmail, onDeleteAccount }: AccountDataControlsProps) {
  const { t } = useTranslation();
  const exportAccount = useExportAccountMutation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deleteTitleId = useId();
  const deleteDescriptionId = useId();
  const deleteInputId = useId();

  const handleDeleteDialogChange = (open: boolean) => {
    if (isDeletingAccount) return;
    setIsDeleteDialogOpen(open);
    if (!open) {
      setDeleteConfirmation('');
      setDeleteError(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount || !userEmail || deleteConfirmation.trim().toLowerCase() !== userEmail.toLowerCase()) return;
    setDeleteError(null);
    setIsDeletingAccount(true);
    try {
      await onDeleteAccount(deleteConfirmation.trim());
    } catch {
      setIsDeletingAccount(false);
      setDeleteError(t('privacy.deleteAccountFailed'));
    }
  };

  return <>
    <Card className="space-y-3 p-5 lg:p-6">
      <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.notice')}</h2>
      <p className="text-xs leading-relaxed text-ds-text-secondary">{t('privacy.intro')}</p>
      <Button type="button" variant="secondary" size="sm" disabled={exportAccount.isPending}
        onClick={() => void exportAccount.mutateAsync().catch(() => {})}>
        {exportAccount.isPending ? t('common.loading') : t('privacy.exportAccount')}
      </Button>
      {exportAccount.isError && <p role="alert" className="text-xs text-ds-negative">{t('privacy.exportFailed')}</p>}
    </Card>
    {userEmail && <>
      <Card className="space-y-4 border-ds-negative/40 p-5 lg:p-6">
        <div>
          <h2 className="text-sm font-semibold text-ds-text-primary">{t('privacy.dangerZone')}</h2>
          <p className="mt-1 text-xs text-ds-text-secondary">{t('privacy.deleteAccountDescription')}</p>
        </div>
        <Button type="button" variant="danger" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
          {t('privacy.deleteAccount')}
        </Button>
      </Card>

      <Dialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <DialogContent
          closeLabel={t('common.close')}
          aria-labelledby={deleteTitleId}
          aria-describedby={deleteDescriptionId}
          className="max-w-md"
        >
          <h2 id={deleteTitleId} className="text-lg font-semibold text-ds-text-primary">
            {t('privacy.deleteAccountConfirmTitle')}
          </h2>
          <p id={deleteDescriptionId} className="mt-2 text-sm text-ds-text-secondary">
            {t('privacy.deleteAccountConfirmDescription')}
          </p>
          <div className="mt-5 space-y-2">
            <label htmlFor={deleteInputId} className="text-xs font-medium text-ds-text-secondary">
              {t('privacy.deleteAccountEmailLabel', { email: userEmail })}
            </label>
            <TextField
              id={deleteInputId}
              type="email"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              disabled={isDeletingAccount}
            />
          </div>
          {deleteError && <p role="alert" className="mt-3 text-xs text-ds-negative">{deleteError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={isDeletingAccount} onClick={() => handleDeleteDialogChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isDeletingAccount || deleteConfirmation.trim().toLowerCase() !== userEmail.toLowerCase()}
              aria-busy={isDeletingAccount}
              onClick={() => void handleDeleteAccount()}
            >
              {isDeletingAccount ? t('privacy.deletingAccount') : t('privacy.deleteAccount')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>}
  </>;
}
