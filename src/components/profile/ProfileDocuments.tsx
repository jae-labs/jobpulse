import React, { useState, useRef, useCallback } from 'react';
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
  MAX_DOCUMENT_SIZE_BYTES,
} from '../../lib/userProfile';
import type { DocumentUpload } from '../../lib/userProfile';
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
import type { UseMutationResult } from '@tanstack/react-query';

interface ProfileDocumentsProps {
  userId?: string | null;
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
    <div className="flex flex-col rounded-ds-card border border-ds-border-strong bg-ds-surface p-4 sm:p-5 space-y-3.5">
      <h3 className="text-xs font-semibold text-ds-text-primary tracking-tight">
        {title}
      </h3>

      {notice && (
        <div
          className={`rounded-ds-control p-2.5 text-xs flex items-center gap-2 ${
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

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-ds-control border border-dashed border-ds-border-strong p-4 text-center text-xs text-ds-text-muted">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id || item.file_name}
              className="flex items-center justify-between gap-2 p-2.5 rounded-ds-control border border-ds-border-strong bg-ds-surface hover:border-ds-border-strong transition-colors"
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
                  className="size-7 rounded-ds-control border border-ds-border-strong bg-ds-hover hover:bg-ds-hover text-ds-text-secondary"
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
                  className="size-7 rounded-ds-control border border-ds-border-strong bg-ds-hover/80 text-ds-text-secondary hover:text-ds-negative hover:border-ds-negative/40"
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

type Notice = { type: 'success' | 'error'; text: string } | null;

interface DocumentHandlers {
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  downloadingId: number | null;
  notice: Notice;
  isPending: boolean;
  handleUpload: (file: File) => void;
  handleDownload: (id?: number, fileName?: string) => void;
  handleDelete: (id?: number, fileName?: string) => void;
}

function useDocumentHandlers(opts: {
  userId?: string | null;
  saveMutation: UseMutationResult<{ success: boolean; error?: string }, Error, DocumentUpload>;
  deleteMutation: UseMutationResult<boolean, Error, number>;
  getSignedUrl: (id: number) => Promise<{ signedUrl: string; fileName?: string } | { error: string }>;
  t: ReturnType<typeof useTranslation>['t'];
  labels: {
    uploadSuccess: string;
    uploadFailed: string;
    loadFailed: string;
    downloadFailed: string;
    removeConfirm: string;
    removeConfirmFallback: string;
    removed: string;
    deleteFailed: string;
    fileTooLarge: string;
    processingError: string;
  };
}): DocumentHandlers {
  const { userId, saveMutation, deleteMutation, getSignedUrl, t, labels } = opts;
  const [description, setDescription] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!userId) return;

      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setNotice({ type: 'error', text: labels.fileTooLarge });
        return;
      }

      setNotice(null);

      try {
        const res = await saveMutation.mutateAsync({
          file,
          description: description.trim() || undefined,
        });

        if (res.success) {
          setDescription('');
          setNotice({ type: 'success', text: t(labels.uploadSuccess, { fileName: file.name }) });
          setTimeout(() => setNotice(null), 4000);
        } else {
          setNotice({ type: 'error', text: res.error || labels.uploadFailed });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : labels.processingError;
        setNotice({ type: 'error', text: message });
      }
    },
    [userId, saveMutation, description, labels, t],
  );

  const handleDownload = useCallback(
    async (id?: number, fileName?: string) => {
      if (!id) return;
      setDownloadingId(id);
      try {
        const res = await getSignedUrl(id);
        if ('signedUrl' in res) {
          const link = document.createElement('a');
          link.href = res.signedUrl;
          link.download = res.fileName || fileName || 'Document.pdf';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          setNotice({ type: 'error', text: res.error || labels.loadFailed });
        }
      } catch {
        setNotice({ type: 'error', text: labels.downloadFailed });
      } finally {
        setDownloadingId(null);
      }
    },
    [getSignedUrl, labels],
  );

  const handleDelete = useCallback(
    async (id?: number, fileName?: string) => {
      if (!id) return;
      if (!confirm(t(labels.removeConfirm, { fileName: fileName || labels.removeConfirmFallback }))) return;
      try {
        const ok = await deleteMutation.mutateAsync(id);
        if (ok) {
          setNotice({ type: 'success', text: labels.removed });
          setTimeout(() => setNotice(null), 3000);
        }
      } catch {
        setNotice({ type: 'error', text: t(labels.deleteFailed, 'Failed to delete document.') });
      }
    },
    [deleteMutation, labels, t],
  );

  return {
    description,
    setDescription,
    downloadingId,
    notice,
    isPending: saveMutation.isPending,
    handleUpload: (file: File) => void handleUpload(file),
    handleDownload: (id?: number, fileName?: string) => void handleDownload(id, fileName),
    handleDelete: (id?: number, fileName?: string) => void handleDelete(id, fileName),
  };
}

export const ProfileDocuments: React.FC<ProfileDocumentsProps> = ({ userId }) => {
  const { t } = useTranslation();

  const { data: cvList = [], error: cvLoadError, refetch: refetchCvs } = useUserCvsQuery(userId);
  const { data: coverLetterList = [], error: coverLetterLoadError, refetch: refetchCoverLetters } = useUserCoverLettersQuery(userId);

  const cv = useDocumentHandlers({
    userId,
    saveMutation: useSaveCvMutation(userId),
    deleteMutation: useDeleteCvMutation(userId),
    getSignedUrl: getUserCVSignedUrl,
    t,
    labels: {
      uploadSuccess: 'profile.documents.uploaded',
      uploadFailed: t('profile.documents.uploadCvFailed'),
      loadFailed: t('profile.documents.loadCvFailed'),
      downloadFailed: t('profile.documents.downloadCvFailed'),
      removeConfirm: 'profile.documents.removeCvConfirmation',
      removeConfirmFallback: t('profile.documents.thisCv'),
      removed: t('profile.documents.cvRemoved'),
      deleteFailed: 'profile.documents.deleteFailed',
      fileTooLarge: t('profile.documents.fileTooLarge'),
      processingError: t('profile.documents.processingError'),
    },
  });

  const cl = useDocumentHandlers({
    userId,
    saveMutation: useSaveCoverLetterMutation(userId),
    deleteMutation: useDeleteCoverLetterMutation(userId),
    getSignedUrl: getUserCoverLetterSignedUrl,
    t,
    labels: {
      uploadSuccess: 'profile.documents.uploaded',
      uploadFailed: t('profile.documents.uploadCoverLetterFailed'),
      loadFailed: t('profile.documents.loadCoverLetterFailed'),
      downloadFailed: t('profile.documents.downloadCoverLetterFailed'),
      removeConfirm: 'profile.documents.removeCoverLetterConfirmation',
      removeConfirmFallback: t('profile.documents.thisCoverLetter'),
      removed: t('profile.documents.coverLetterRemoved'),
      deleteFailed: 'profile.documents.deleteFailed',
      fileTooLarge: t('profile.documents.fileTooLarge'),
      processingError: t('profile.documents.processingError'),
    },
  });

  const documentLoadError = cvLoadError || coverLetterLoadError;

  return (
    <Card className="space-y-4 p-5 lg:p-6">
      <div className="border-b border-ds-border pb-3">
        <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
          {t('profile.documents.title')}
        </h2>
      </div>

      {documentLoadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-ds-control border border-ds-negative/30 bg-ds-negative/10 p-3 text-xs text-ds-negative">
          <span>{t('profile.documents.loadDocumentsFailed')}</span>
          <Button size="sm" variant="secondary" onClick={() => { void refetchCvs(); void refetchCoverLetters(); }}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DocumentSection
          title={t('profile.documents.resumes')}
          items={cvList}
          notice={cv.notice}
          newDescription={cv.description}
          onDescriptionChange={cv.setDescription}
          isUploading={cv.isPending}
          downloadingId={cv.downloadingId}
          emptyText={t('profile.documents.noResumes')}
          descriptionPlaceholder={t('profile.documents.cvDescriptionPlaceholder')}
          descriptionLabel={t('profile.documents.cvDescriptionLabel')}
          uploadButtonText={t('profile.documents.uploadResume')}
          downloadTitle={t('profile.documents.downloadResume')}
          deleteTitle={t('profile.documents.deleteResume')}
          onUploadFile={cv.handleUpload}
          onDownload={cv.handleDownload}
          onDelete={cv.handleDelete}
        />

        <DocumentSection
          title={t('profile.documents.coverLetters')}
          items={coverLetterList}
          notice={cl.notice}
          newDescription={cl.description}
          onDescriptionChange={cl.setDescription}
          isUploading={cl.isPending}
          downloadingId={cl.downloadingId}
          emptyText={t('profile.documents.noCoverLetters')}
          descriptionPlaceholder={t('profile.documents.coverLetterDescriptionPlaceholder')}
          descriptionLabel={t('profile.documents.coverLetterDescriptionLabel')}
          uploadButtonText={t('profile.documents.uploadCoverLetter')}
          downloadTitle={t('profile.documents.downloadCoverLetter')}
          deleteTitle={t('profile.documents.deleteCoverLetter')}
          onUploadFile={cl.handleUpload}
          onDownload={cl.handleDownload}
          onDelete={cl.handleDelete}
        />
      </div>
    </Card>
  );
};
