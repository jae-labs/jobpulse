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
  Dialog,
  DialogContent,
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

interface InvitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
  currentUserRole?: string | null;
}

export const InvitationsModal: React.FC<InvitationsModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const { t, i18n } = useTranslation();
  const [emailInput, setEmailInput] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [justGeneratedLink, setJustGeneratedLink] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const emailInputId = useId();

  const { data: invitations = [], isLoading } = useInvitationsQuery(currentUserEmail);
  const createMutation = useCreateInvitationMutation(currentUserEmail);
  const deleteMutation = useDeleteInvitationMutation(currentUserEmail);

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={t('common.close', 'Close')}
        className="max-w-2xl bg-ds-surface border border-ds-border text-ds-text-primary p-6 sm:p-7 shadow-2xl overflow-y-auto max-h-[88vh]"
      >
        {/* Header */}
        <div className="flex items-center gap-3.5 pb-5 border-b border-ds-border">
          <div className="flex size-10 items-center justify-center rounded-xl bg-ds-control border border-ds-border-strong shrink-0">
            <span aria-hidden="true" className="text-xl leading-none">🎁</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-ds-text-primary">
              {t('invitations.title', 'Invite a friend')}
            </h2>
          </div>
        </div>

        {/* Invite Creation Form */}
        <div className="pt-5 pb-6 border-b border-ds-border">
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
                  size="sm"
                  disabled={createMutation.isPending || !emailInput.trim()}
                  aria-busy={createMutation.isPending}
                  className="h-9 shrink-0"
                >
                  {createMutation.isPending
                    ? t('invitations.creating', 'Inviting...')
                    : t('invitations.createInvite', 'Invite')}
                </Button>
              </div>
            </div>
          </form>

          {/* Error Message */}
          {formError && (
            <div className="mt-3.5 flex items-center gap-2 p-3 rounded-lg border border-ds-negative/30 bg-ds-negative/10 text-xs text-ds-negative">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Generated Link: Tidy Input with Inline Copy Button */}
          {justGeneratedLink && (
            <div className="mt-4 p-3 rounded-xl border border-ds-border bg-ds-control/40 space-y-2 animate-in fade-in-50">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ds-positive">
                <Check className="size-3.5" />
                <span>{t('invitations.inviteCreated', 'Invitation link created!')}</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={justGeneratedLink}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="h-9 w-full rounded-ds-control border border-ds-border-control bg-ds-panel pl-3 pr-9 font-mono text-xs text-ds-text-primary focus:border-ds-accent focus:outline-none select-all transition-colors"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyText(justGeneratedLink, 'just-generated')}
                  className="absolute right-1 top-1 bottom-1 flex items-center justify-center w-7 rounded text-ds-text-muted hover:text-ds-text-primary hover:bg-ds-hover transition-colors cursor-pointer"
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
        </div>

        {/* Existing Invitations List */}
        <div className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-text-muted">
              {t('invitations.sentInvitations', 'Invitations')}
            </h3>
            <span className="text-xs text-ds-text-muted">
              {invitations.length}
            </span>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-ds-text-muted">
              {t('common.loading', 'Loading...')}
            </div>
          ) : invitations.length === 0 ? (
            <EmptyState
              title={t('invitations.noInvitations', 'No invitations issued yet')}
              description={t('invitations.noInvitationsSub', 'Invite someone to give them access to JobPulse.')}
              className="py-8 border border-dashed border-ds-border rounded-xl"
            />
          ) : (
            <div className="divide-y divide-ds-border rounded-xl border border-ds-border bg-ds-control/40 overflow-hidden">
              {invitations.map((inv: InvitationItem) => {
                const isPending = inv.status === 'pending';
                const isAccepted = inv.status === 'accepted';
                return (
                  <div
                    key={inv.id}
                    className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-ds-hover/50 transition-colors"
                  >
                    {/* Left: Email, date */}
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
                        <div className="text-[11px] text-ds-text-muted mt-0.5">
                          {inv.created_at ? formatDate(inv.created_at, i18n.language) : ''}
                        </div>
                      </div>
                    </div>

                    {/* Right: Status Pill & Actions */}
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
                          size="sm"
                          variant="danger"
                          onClick={() => void handleDelete(inv.id)}
                          disabled={deleteMutation.isPending}
                          className="h-7 text-xs px-2.5"
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
