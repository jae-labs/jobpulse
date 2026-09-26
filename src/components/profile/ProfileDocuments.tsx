import React, { useState, useRef } from 'react';
import {
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  getUserCVSignedUrl,
  getUserCoverLetterSignedUrl,
} from '../../lib/userProfile';
import {
  useUserCvsQuery,
  useUserCoverLettersQuery,
  useSaveCvMutation,
  useDeleteCvMutation,
  useSaveCoverLetterMutation,
  useDeleteCoverLetterMutation,
} from '../../hooks/useQueries';
import { formatDate } from '../../lib/i18n';
import { useTranslation } from 'react-i18next';
import { Button, Card, TextField } from '@jae-labs/ui';

interface ProfileDocumentsProps {
  userEmail?: string | null;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentItem {
  id?: number;
  file_name: string;
  file_size: number;
  description?: string | null;
  uploaded_at: string;
}

interface DocumentSectionProps {
  title: string;
  items: DocumentItem[];
  notice: { type: 'success' | 'error'; text: string } | null;
  newDescription: string;
  onDescriptionChange: (val: string) => void;
  isUploading: boolean;
  downloadingId: number | null;
  emptyText: string;
  descriptionPlaceholder: string;
  descriptionLabel: string;
  uploadButtonText: string;
  downloadTitle: string;
  deleteTitle: string;
  onUploadFile: (file: File) => void;
  onDownload: (id?: number, fileName?: string) => void;
  onDelete: (id?: number, fileName?: string) => void;
}

const DocumentSection: React.FC<DocumentSectionProps> = ({
  title,
  items,
  notice,
  newDescription,
  onDescriptionChange,
  isUploading,
  downloadingId,
  emptyText,
  descriptionPlaceholder,
  descriptionLabel,
  uploadButtonText,
  downloadTitle,
  deleteTitle,
  onUploadFile,
  onDownload,
  onDelete,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col rounded-xl border border-ds-border-strong bg-ds-surface p-4 sm:p-5 space-y-3.5 shadow-xs">
      <h3 className="text-xs font-semibold text-ds-text-primary tracking-tight">
        {title}
      </h3>

      {notice && (
        <div
          className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
            notice.type === 'success'
              ? 'border border-ds-positive/30 bg-ds-positive/10 text-ds-positive'
              : 'border border-ds-negative/30 bg-ds-negative/10 text-ds-negative'
          }`}
        >
          {notice.type === 'success' ? (
            <Check className="size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{notice.text}</span>
        </div>
      )}

      {/* List of uploaded documents */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ds-border-strong p-4 text-center text-xs text-ds-text-muted">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id || item.file_name}
              className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-ds-border-strong bg-ds-surface hover:border-ds-border-strong transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 text-ds-accent shrink-0" />
                  <span className="text-xs font-medium text-ds-text-secondary truncate" title={item.file_name}>
                    {item.file_name}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] text-ds-accent/80 truncate mt-0.5 pl-5">
                    {item.description}
                  </p>
                )}
                <p className="text-[10px] text-ds-text-muted font-mono mt-0.5 pl-5">
                  {formatFileSize(item.file_size)} · {formatDate(item.uploaded_at)}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDownload(item.id, item.file_name)}
                  disabled={downloadingId === item.id}
                  className="size-7 rounded-lg border border-ds-border-strong bg-ds-hover hover:bg-ds-hover text-ds-text-secondary"
                  title={downloadTitle}
                  aria-label={downloadTitle}
                >
                  {downloadingId === item.id ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(item.id, item.file_name)}
                  className="size-7 rounded-lg border border-ds-border-strong bg-ds-hover/80 text-ds-text-secondary hover:text-ds-negative hover:border-ds-negative/40"
                  title={deleteTitle}
                  aria-label={deleteTitle}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Box */}
      <div className="pt-3 border-t border-ds-border space-y-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUploadFile(file);
          }}
          className="hidden"
        />
        <TextField
          density="compact"
          type="text"
          value={newDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          aria-label={descriptionLabel}
          placeholder={descriptionPlaceholder}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full h-9 gap-1.5 font-medium"
        >
          {isUploading && <RefreshCw className="size-3.5 animate-spin" />}
          <span>{uploadButtonText}</span>
        </Button>
      </div>
    </div>
  );
};

export const ProfileDocuments: React.FC<ProfileDocumentsProps> = ({ userEmail }) => {
  const { t } = useTranslation();

  const { data: cvList = [], error: cvLoadError, refetch: refetchCvs } = useUserCvsQuery(userEmail);
  const { data: coverLetterList = [], error: coverLetterLoadError, refetch: refetchCoverLetters } = useUserCoverLettersQuery(userEmail);

  const saveCvMutation = useSaveCvMutation(userEmail);
  const deleteCvMutation = useDeleteCvMutation(userEmail);
  const saveCoverLetterMutation = useSaveCoverLetterMutation(userEmail);
  const deleteCoverLetterMutation = useDeleteCoverLetterMutation(userEmail);

  // CV local form state
  const [newCvDescription, setNewCvDescription] = useState('');
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);
  const [cvNotice, setCvNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cover letter local form state
  const [newCoverLetterDescription, setNewCoverLetterDescription] = useState('');
  const [downloadingCoverLetterId, setDownloadingCoverLetterId] = useState<number | null>(null);
  const [coverLetterNotice, setCoverLetterNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isUploadingCv = saveCvMutation.isPending;
  const isUploadingCoverLetter = saveCoverLetterMutation.isPending;
  const documentLoadError = cvLoadError || coverLetterLoadError;

  const handleCvUpload = async (file: File) => {
    if (!userEmail) return;

    if (file.size > 10 * 1024 * 1024) {
      setCvNotice({ type: 'error', text: t('profile.documents.fileTooLarge') });
      return;
    }

    setCvNotice(null);

    try {
      const res = await saveCvMutation.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/pdf',
        fileData: file,
        description: newCvDescription.trim() || undefined,
      });

      if (res.success) {
        setNewCvDescription('');
        setCvNotice({ type: 'success', text: t('profile.documents.uploaded', { fileName: file.name }) });
        setTimeout(() => setCvNotice(null), 4000);
      } else {
        setCvNotice({ type: 'error', text: res.error || t('profile.documents.uploadCvFailed') });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profile.documents.processingError');
      setCvNotice({ type: 'error', text: message });
    }
  };

  const handleDownloadCv = async (id?: number, fileName?: string) => {
    if (!id) return;
    setDownloadingCvId(id);
    try {
      const res = await getUserCVSignedUrl(id);
      if (res && 'signedUrl' in res) {
        const link = document.createElement('a');
        link.href = res.signedUrl;
        link.download = res.fileName || fileName || 'Resume.pdf';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const errorText = res && 'error' in res ? res.error : t('profile.documents.loadCvFailed');
        setCvNotice({ type: 'error', text: errorText });
      }
    } catch {
      setCvNotice({ type: 'error', text: t('profile.documents.downloadCvFailed') });
    } finally {
      setDownloadingCvId(null);
    }
  };

  const handleDeleteCv = async (id?: number, fileName?: string) => {
    if (!id) return;
    if (!confirm(t('profile.documents.removeCvConfirmation', { fileName: fileName || t('profile.documents.thisCv') }))) return;
    try {
      const ok = await deleteCvMutation.mutateAsync(id);
      if (ok) {
        setCvNotice({ type: 'success', text: t('profile.documents.cvRemoved') });
        setTimeout(() => setCvNotice(null), 3000);
      }
    } catch {
      setCvNotice({ type: 'error', text: t('profile.documents.deleteFailed', 'Failed to delete document.') });
    }
  };

  const handleCoverLetterUpload = async (file: File) => {
    if (!userEmail) return;

    if (file.size > 10 * 1024 * 1024) {
      setCoverLetterNotice({ type: 'error', text: t('profile.documents.fileTooLarge') });
      return;
    }

    setCoverLetterNotice(null);

    try {
      const res = await saveCoverLetterMutation.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/pdf',
        fileData: file,
        description: newCoverLetterDescription.trim() || undefined,
      });

      if (res.success) {
        setNewCoverLetterDescription('');
        setCoverLetterNotice({ type: 'success', text: t('profile.documents.uploaded', { fileName: file.name }) });
        setTimeout(() => setCoverLetterNotice(null), 4000);
      } else {
        setCoverLetterNotice({ type: 'error', text: res.error || t('profile.documents.uploadCoverLetterFailed') });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profile.documents.processingError');
      setCoverLetterNotice({ type: 'error', text: message });
    }
  };

  const handleDownloadCoverLetter = async (id?: number, fileName?: string) => {
    if (!id) return;
    setDownloadingCoverLetterId(id);
    try {
      const res = await getUserCoverLetterSignedUrl(id);
      if (res && 'signedUrl' in res) {
        const link = document.createElement('a');
        link.href = res.signedUrl;
        link.download = res.fileName || fileName || 'Cover_Letter.pdf';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const errorText = res && 'error' in res ? res.error : t('profile.documents.loadCoverLetterFailed');
        setCoverLetterNotice({ type: 'error', text: errorText });
      }
    } catch {
      setCoverLetterNotice({ type: 'error', text: t('profile.documents.downloadCoverLetterFailed') });
    } finally {
      setDownloadingCoverLetterId(null);
    }
  };

  const handleDeleteCoverLetter = async (id?: number, fileName?: string) => {
    if (!id) return;
    if (!confirm(t('profile.documents.removeCoverLetterConfirmation', { fileName: fileName || t('profile.documents.thisCoverLetter') }))) return;
    try {
      const ok = await deleteCoverLetterMutation.mutateAsync(id);
      if (ok) {
        setCoverLetterNotice({ type: 'success', text: t('profile.documents.coverLetterRemoved') });
        setTimeout(() => setCoverLetterNotice(null), 3000);
      }
    } catch {
      setCoverLetterNotice({ type: 'error', text: t('profile.documents.deleteFailed', 'Failed to delete document.') });
    }
  };

  return (
    <Card className="space-y-4 p-5 lg:p-6">
      <div className="border-b border-ds-border pb-3">
        <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
          {t('profile.documents.title')}
        </h2>
      </div>

      {documentLoadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-ds-negative/30 bg-ds-negative/10 p-3 text-xs text-ds-negative">
          <span>{t('profile.documents.loadDocumentsFailed')}</span>
          <Button size="sm" variant="secondary" onClick={() => { void refetchCvs(); void refetchCoverLetters(); }}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* RESUMES / CVS */}
        <DocumentSection
          title={t('profile.documents.resumes')}
          items={cvList}
          notice={cvNotice}
          newDescription={newCvDescription}
          onDescriptionChange={setNewCvDescription}
          isUploading={isUploadingCv}
          downloadingId={downloadingCvId}
          emptyText={t('profile.documents.noResumes')}
          descriptionPlaceholder={t('profile.documents.cvDescriptionPlaceholder')}
          descriptionLabel={t('profile.documents.cvDescriptionLabel')}
          uploadButtonText={t('profile.documents.uploadResume')}
          downloadTitle={t('profile.documents.downloadResume')}
          deleteTitle={t('profile.documents.deleteResume')}
          onUploadFile={(file) => void handleCvUpload(file)}
          onDownload={(id, name) => void handleDownloadCv(id, name)}
          onDelete={(id, name) => void handleDeleteCv(id, name)}
        />

        {/* COVER LETTERS */}
        <DocumentSection
          title={t('profile.documents.coverLetters')}
          items={coverLetterList}
          notice={coverLetterNotice}
          newDescription={newCoverLetterDescription}
          onDescriptionChange={setNewCoverLetterDescription}
          isUploading={isUploadingCoverLetter}
          downloadingId={downloadingCoverLetterId}
          emptyText={t('profile.documents.noCoverLetters')}
          descriptionPlaceholder={t('profile.documents.coverLetterDescriptionPlaceholder')}
          descriptionLabel={t('profile.documents.coverLetterDescriptionLabel')}
          uploadButtonText={t('profile.documents.uploadCoverLetter')}
          downloadTitle={t('profile.documents.downloadCoverLetter')}
          deleteTitle={t('profile.documents.deleteCoverLetter')}
          onUploadFile={(file) => void handleCoverLetterUpload(file)}
          onDownload={(id, name) => void handleDownloadCoverLetter(id, name)}
          onDelete={(id, name) => void handleDeleteCoverLetter(id, name)}
        />
      </div>
    </Card>
  );
};
