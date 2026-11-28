import React, { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Copy,
  Check,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import {
  Card,
  PageHeader,
  Button,
  TextField,
  Pill,
  EmptyState,
} from '@jae-labs/ui';
import {
  useInvitationsQuery,
  useCreateInvitationMutation,
  useDeleteInvitationMutation,
  type InvitationItem,
} from '../../hooks/useQueries';
import { formatDate } from '../../lib/i18n';

interface MemberManagementViewProps {
  currentUserId?: string | null;
}

export const MemberManagementView: React.FC<MemberManagementViewProps> = ({ currentUserId }) => {
  const { t, i18n } = useTranslation();
  const [emailInput, setEmailInput] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [justGeneratedLink, setJustGeneratedLink] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const emailInputId = useId();

  const { data: invitations = [], isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInvitationsQuery(currentUserId);
  const createMutation = useCreateInvitationMutation(currentUserId);
  const deleteMutation = useDeleteInvitationMutation(currentUserId);

  const getInviteUrl = (code: string | null, email: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!code) return `${origin}/?email=${encodeURIComponent(email)}`;
    return `${origin}/?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`;
  };

  const handleCopyText = async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(identifier);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCode(identifier);
      setTimeout(() => setCopiedCode(null), 2500);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setJustGeneratedLink(null);

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setFormError(t('invitations.invalidEmail', 'Please enter a valid email address.'));
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        email: cleanEmail,
      });

      if (res && res.invite_code) {
        const fullUrl = getInviteUrl(res.invite_code, cleanEmail);
        setJustGeneratedLink(fullUrl);
      }
      setEmailInput('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setFormError(t('invitations.genericError', { message: msg }));
    }
  };

  const handleDelete = async (invitationId: number) => {
    try {
      await deleteMutation.mutateAsync(invitationId);
    } catch {
      // Handled via mutation state
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <Card className="p-5 lg:p-6">
        <PageHeader title={t('memberManagement.title')} />
      </Card>

      <Card className="space-y-4 p-5 lg:p-6">
        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div>
            <label htmlFor={emailInputId} className="block text-xs font-medium text-ds-text-secondary mb-1.5">
              {t('invitations.emailLabel', 'Email address')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <TextField
                  id={emailInputId}
                  type="email"
                  maxLength={254}
                  placeholder={t('invitations.emailPlaceholder', 'name@example.com')}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  disabled={createMutation.isPending}
                  required
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="md"
                disabled={createMutation.isPending || !emailInput.trim()}
                aria-busy={createMutation.isPending}
                className="shrink-0"
              >
                {createMutation.isPending
                  ? t('invitations.creating', 'Inviting...')
                  : t('invitations.createInvite', 'Invite')}
              </Button>
            </div>
          </div>
        </form>

        {formError && (
          <div className="flex items-center gap-2 p-3 rounded-ds-control border border-ds-negative/30 bg-ds-negative/10 text-xs text-ds-negative">
            <AlertCircle className="size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {justGeneratedLink && (
          <div className="p-3 rounded-ds-card border border-ds-border bg-ds-control/40 space-y-2 ds-content-enter">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ds-positive">
              <Check className="size-3.5" />
              <span>{t('invitations.inviteCreated', 'Invitation link created!')}</span>
            </div>
            <div className="relative flex items-center">
              <TextField
                density="compact"
                readOnly
                value={justGeneratedLink}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="bg-ds-panel font-mono pr-9 select-all"
              />
              <button
                type="button"
                onClick={() => void handleCopyText(justGeneratedLink, 'just-generated')}
                className="absolute right-1 top-1 bottom-1 flex items-center justify-center w-7 rounded-ds-control text-ds-text-muted hover:text-ds-text-primary hover:bg-ds-hover ds-motion-control cursor-pointer"
                title={copiedCode === 'just-generated' ? t('invitations.linkCopied', 'Copied!') : t('invitations.copyLink', 'Copy')}
                aria-label={t('invitations.copyLink', 'Copy')}
              >
                {copiedCode === 'just-generated' ? (
                  <Check className="size-3.5 text-ds-positive" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5 lg:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ds-text-primary">
            {t('memberManagement.directoryTitle')}
          </h2>
          <span className="text-xs text-ds-text-muted">
            {invitations.length}
          </span>
        </div>

        {isError ? (
          <div role="alert" className="flex items-center gap-3 text-xs text-ds-text-secondary">
            <p>{t('common.loadError')}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>{t('common.retry')}</Button>
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-xs text-ds-text-muted">
            {t('common.loading', 'Loading...')}
          </div>
        ) : invitations.length === 0 ? (
          <EmptyState
            title={t('invitations.noInvitations', 'No invitations issued yet')}
            description={t('invitations.noInvitationsSub', 'Invite someone to give them access to JobPulse.')}
            className="py-8 border border-dashed border-ds-border rounded-ds-card"
          />
        ) : (
          <div className="divide-y divide-ds-border rounded-ds-card border border-ds-border bg-ds-control/40 overflow-hidden">
            {invitations.map((inv: InvitationItem) => {
              const isPending = inv.status === 'pending';
              const isAccepted = inv.status === 'accepted';
              return (
                <div
                  key={inv.id}
                  className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-ds-hover/50 ds-motion-control"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-full bg-ds-panel border border-ds-border flex items-center justify-center shrink-0 text-ds-text-muted">
                      {isAccepted ? (
                        <UserCheck className="size-4 text-ds-positive" />
                      ) : (
                        <Users className="size-3.5 text-ds-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-ds-text-primary truncate" title={inv.email}>
                        {inv.email}
                      </div>
                      <div className="text-xs text-ds-text-muted mt-0.5">
                        {inv.created_at ? formatDate(inv.created_at, i18n.language) : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Pill
                      size="sm"
                      tone={isAccepted ? 'positive' : 'warning'}
                    >
                      {isAccepted
                        ? t('invitations.statusAccepted', 'Accepted')
                        : t('invitations.statusPending', 'Pending')}
                    </Pill>

                    {isPending && (
                      <Button
                        size="xs"
                        variant="danger"
                        onClick={() => void handleDelete(inv.id)}
                        disabled={deleteMutation.isPending}
                        title={t('invitations.delete', 'Delete')}
                      >
                        <span>{t('invitations.delete', 'Delete')}</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasNextPage ? (
          <Button variant="secondary" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
          </Button>
        ) : null}
      </Card>
    </div>
  );
};
