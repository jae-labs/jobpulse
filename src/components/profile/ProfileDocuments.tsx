import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { UserCVMetadata, UserCoverLetterMetadata } from '../../types/job';
import {
  loadUserCVsMetadata,
  downloadUserCVBlob,
  saveUserCV,
  deleteUserCV,
  loadUserCoverLettersMetadata,
  downloadUserCoverLetterBlob,
  saveUserCoverLetter,
  deleteUserCoverLetter,
} from '../../lib/userProfile';
import { formatDate } from '../../lib/i18n';
import { useTranslation } from 'react-i18next';
import { Button, Card, TextField, Pill } from '../../design-system';

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
  pillVariant: 'status-new' | 'status-interested';
  notice: { type: 'success' | 'error'; text: string } | null;
  newDescription: string;
  onDescriptionChange: (val: string) => void;
  isUploading: boolean;
  downloadingId: number | null;
  emptyText: string;
  descriptionPlaceholder: string;
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
  pillVariant,
  notice,
  newDescription,
  onDescriptionChange,
  isUploading,
  downloadingId,
  emptyText,
  descriptionPlaceholder,
  uploadButtonText,
  downloadTitle,
  deleteTitle,
  onUploadFile,
  onDownload,
  onDelete,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col rounded-xl border border-ds-border-strong bg-ds-workspace p-4 sm:p-5 space-y-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-ds-accent shrink-0" />
          <h3 className="text-xs font-semibold text-ds-text-primary tracking-tight">
            {title}
          </h3>
        </div>
        <Pill asChild size="sm" variant={pillVariant}>
          <span>{t('profile.documents.fileCount', { count: items.length })}</span>
        </Pill>
      </div>

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
              className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-ds-border-strong bg-ds-workspace hover:border-ds-border-strong transition-colors"
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
                <button
                  type="button"
                  onClick={() => onDownload(item.id, item.file_name)}
                  disabled={downloadingId === item.id}
                  className="size-7 rounded-lg border border-ds-border-strong bg-ds-hover hover:bg-ds-hover text-ds-text-secondary flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                  title={downloadTitle}
                  aria-label={downloadTitle}
                >
                  {downloadingId === item.id ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id, item.file_name)}
                  className="size-7 rounded-lg border border-ds-border-strong bg-ds-hover/80 text-ds-text-secondary hover:text-ds-negative hover:border-ds-negative/40 flex items-center justify-center transition-colors cursor-pointer"
                  title={deleteTitle}
                  aria-label={deleteTitle}
                >
                  <Trash2 className="size-3" />
                </button>
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
          {isUploading ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          <span>{uploadButtonText}</span>
        </Button>
      </div>
    </div>
  );
};

export const ProfileDocuments: React.FC<ProfileDocumentsProps> = ({ userEmail }) => {
  const { t } = useTranslation();
  // CV state
  const [cvList, setCvList] = useState<UserCVMetadata[]>([]);
  const [newCvDescription, setNewCvDescription] = useState('');
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);
  const [cvNotice, setCvNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cover letter state
  const [coverLetterList, setCoverLetterList] = useState<UserCoverLetterMetadata[]>([]);
  const [newCoverLetterDescription, setNewCoverLetterDescription] = useState('');
  const [isUploadingCoverLetter, setIsUploadingCoverLetter] = useState(false);
  const [downloadingCoverLetterId, setDownloadingCoverLetterId] = useState<number | null>(null);
  const [coverLetterNotice, setCoverLetterNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load CV and Cover letter metadata when userEmail is ready
  useEffect(() => {
    if (userEmail) {
      void loadUserCVsMetadata(userEmail).then((list) => setCvList(list));
      void loadUserCoverLettersMetadata(userEmail).then((list) => setCoverLetterList(list));
    }
  }, [userEmail]);

  const handleCvUpload = async (file: File) => {
    if (!userEmail) return;

    if (file.size > 10 * 1024 * 1024) {
      setCvNotice({ type: 'error', text: t('profile.documents.fileTooLarge') });
      return;
    }

    setIsUploadingCv(true);
    setCvNotice(null);

    try {
      const res = await saveUserCV(
        userEmail,
        file.name,
        file.size,
        file.type || 'application/pdf',
        file,
        newCvDescription.trim() || undefined
      );

      if (res.success) {
        const list = await loadUserCVsMetadata(userEmail);
        setCvList(list);
        setNewCvDescription('');
        setCvNotice({ type: 'success', text: t('profile.documents.uploaded', { fileName: file.name }) });
        setTimeout(() => setCvNotice(null), 4000);
      } else {
        setCvNotice({ type: 'error', text: res.error || t('profile.documents.uploadCvFailed') });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profile.documents.processingError');
      setCvNotice({ type: 'error', text: message });
    } finally {
      setIsUploadingCv(false);
    }
  };

  const handleDownloadCv = async (id?: number, fileName?: string) => {
    if (!id) return;
    setDownloadingCvId(id);
    try {
      const res = await downloadUserCVBlob(id);
      if (res && res.blob) {
        const url = URL.createObjectURL(res.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = res.fileName || fileName || 'Resume.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        setCvNotice({ type: 'error', text: t('profile.documents.loadCvFailed') });
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
    const ok = await deleteUserCV(id);
    if (ok) {
      setCvList((prev) => prev.filter((item) => item.id !== id));
      setCvNotice({ type: 'success', text: t('profile.documents.cvRemoved') });
      setTimeout(() => setCvNotice(null), 3000);
    }
  };

  const handleCoverLetterUpload = async (file: File) => {
    if (!userEmail) return;

    if (file.size > 10 * 1024 * 1024) {
      setCoverLetterNotice({ type: 'error', text: t('profile.documents.fileTooLarge') });
      return;
    }

    setIsUploadingCoverLetter(true);
    setCoverLetterNotice(null);

    try {
      const res = await saveUserCoverLetter(
        userEmail,
        file.name,
        file.size,
        file.type || 'application/pdf',
        file,
        newCoverLetterDescription.trim() || undefined
      );

      if (res.success) {
        const list = await loadUserCoverLettersMetadata(userEmail);
        setCoverLetterList(list);
        setNewCoverLetterDescription('');
        setCoverLetterNotice({ type: 'success', text: t('profile.documents.uploaded', { fileName: file.name }) });
        setTimeout(() => setCoverLetterNotice(null), 4000);
      } else {
        setCoverLetterNotice({ type: 'error', text: res.error || t('profile.documents.uploadCoverLetterFailed') });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profile.documents.processingError');
      setCoverLetterNotice({ type: 'error', text: message });
    } finally {
      setIsUploadingCoverLetter(false);
    }
  };

  const handleDownloadCoverLetter = async (id?: number, fileName?: string) => {
    if (!id) return;
    setDownloadingCoverLetterId(id);
    try {
      const res = await downloadUserCoverLetterBlob(id);
      if (res && res.blob) {
        const url = URL.createObjectURL(res.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = res.fileName || fileName || 'Cover_Letter.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        setCoverLetterNotice({ type: 'error', text: t('profile.documents.loadCoverLetterFailed') });
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
    const ok = await deleteUserCoverLetter(id);
    if (ok) {
      setCoverLetterList((prev) => prev.filter((item) => item.id !== id));
      setCoverLetterNotice({ type: 'success', text: t('profile.documents.coverLetterRemoved') });
      setTimeout(() => setCoverLetterNotice(null), 3000);
    }
  };

  return (
    <Card className="space-y-4 p-5 lg:p-6">
      <div className="border-b border-ds-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.documents.title')}
          </h2>
          <p className="text-[11px] text-ds-text-secondary mt-0.5">
            {t('profile.documents.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* RESUMES / CVS */}
        <DocumentSection
          title={t('profile.documents.resumes')}
          items={cvList}
          pillVariant="status-new"
          notice={cvNotice}
          newDescription={newCvDescription}
          onDescriptionChange={setNewCvDescription}
          isUploading={isUploadingCv}
          downloadingId={downloadingCvId}
          emptyText={t('profile.documents.noResumes')}
          descriptionPlaceholder={t('profile.documents.cvDescriptionPlaceholder')}
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
          pillVariant="status-interested"
          notice={coverLetterNotice}
          newDescription={newCoverLetterDescription}
          onDescriptionChange={setNewCoverLetterDescription}
          isUploading={isUploadingCoverLetter}
          downloadingId={downloadingCoverLetterId}
          emptyText={t('profile.documents.noCoverLetters')}
          descriptionPlaceholder={t('profile.documents.coverLetterDescriptionPlaceholder')}
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
