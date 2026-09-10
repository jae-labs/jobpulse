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

interface ProfileDocumentsProps {
  userEmail?: string | null;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ProfileDocuments: React.FC<ProfileDocumentsProps> = ({ userEmail }) => {
  const { t } = useTranslation();
  // CV state
  const [cvList, setCvList] = useState<UserCVMetadata[]>([]);
  const [newCvDescription, setNewCvDescription] = useState('');
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);
  const [cvNotice, setCvNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const cvInputRef = useRef<HTMLInputElement | null>(null);

  // Cover letter state
  const [coverLetterList, setCoverLetterList] = useState<UserCoverLetterMetadata[]>([]);
  const [newCoverLetterDescription, setNewCoverLetterDescription] = useState('');
  const [isUploadingCoverLetter, setIsUploadingCoverLetter] = useState(false);
  const [downloadingCoverLetterId, setDownloadingCoverLetterId] = useState<number | null>(null);
  const [coverLetterNotice, setCoverLetterNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const coverLetterInputRef = useRef<HTMLInputElement | null>(null);

  // Load CV and Cover letter metadata when userEmail is ready
  useEffect(() => {
    if (userEmail) {
      void loadUserCVsMetadata(userEmail).then((list) => setCvList(list));
      void loadUserCoverLettersMetadata(userEmail).then((list) => setCoverLetterList(list));
    }
  }, [userEmail]);

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userEmail) return;

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

  const handleCoverLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userEmail) return;

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
    <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
      <div className="border-b border-white/[0.06] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.documents.title')}
          </h2>
          <p className="text-[11px] text-zinc-300 mt-0.5">
            {t('profile.documents.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* RESUMES / CVS */}
        <div className="flex flex-col rounded-xl border border-white/[0.12] bg-[#111215] p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-indigo-400 shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100 tracking-tight">
                {t('profile.documents.resumes')}
              </h3>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 font-mono">
              {t('profile.documents.fileCount', { count: cvList.length })}
            </span>
          </div>

          {cvNotice && (
            <div
              className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                cvNotice.type === 'success'
                  ? 'border border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                  : 'border border-rose-500/30 bg-rose-950/30 text-rose-300'
              }`}
            >
              {cvNotice.type === 'success' ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{cvNotice.text}</span>
            </div>
          )}

          {/* List of uploaded CVs */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {cvList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700/80 p-4 text-center text-xs text-zinc-400">
                {t('profile.documents.noResumes')}
              </div>
            ) : (
              cvList.map((cv) => (
                <div
                  key={cv.id || cv.file_name}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-700/80 bg-[#111215] hover:border-zinc-600 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs font-medium text-zinc-200 truncate" title={cv.file_name}>
                        {cv.file_name}
                      </span>
                    </div>
                    {cv.description && (
                      <p className="text-[11px] text-indigo-300/80 truncate mt-0.5 pl-5">
                        {cv.description}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5 pl-5">
                      {formatFileSize(cv.file_size)} · {formatDate(cv.uploaded_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDownloadCv(cv.id, cv.file_name)}
                      disabled={downloadingCvId === cv.id}
                      className="size-7 rounded-lg border border-zinc-700/80 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                      title={t('profile.documents.downloadResume')}
                      aria-label={t('profile.documents.downloadResume')}
                    >
                      {downloadingCvId === cv.id ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCv(cv.id, cv.file_name)}
                      className="size-7 rounded-lg border border-zinc-700/80 bg-zinc-800/80 text-zinc-300 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors cursor-pointer"
                      title={t('profile.documents.deleteResume')}
                      aria-label={t('profile.documents.deleteResume')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Upload New Resume Box */}
          <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
            <input
              ref={cvInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => void handleCvUpload(e)}
              className="hidden"
            />
            <input
              type="text"
              value={newCvDescription}
              onChange={(e) => setNewCvDescription(e.target.value)}
              placeholder={t('profile.documents.cvDescriptionPlaceholder')}
              className="w-full rounded-lg border border-zinc-700/80 bg-[#16171b] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => cvInputRef.current?.click()}
              disabled={isUploadingCv}
              className="w-full h-9 px-3.5 rounded-lg border border-indigo-500/50 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUploadingCv ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>{t('profile.documents.uploadResume')}</span>
            </button>
          </div>
        </div>

        {/* COVER LETTERS */}
        <div className="flex flex-col rounded-xl border border-white/[0.12] bg-[#111215] p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-violet-400 shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100 tracking-tight">
                {t('profile.documents.coverLetters')}
              </h3>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-500/40 font-mono">
              {t('profile.documents.fileCount', { count: coverLetterList.length })}
            </span>
          </div>

          {coverLetterNotice && (
            <div
              className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                coverLetterNotice.type === 'success'
                  ? 'border border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                  : 'border border-rose-500/30 bg-rose-950/30 text-rose-300'
              }`}
            >
              {coverLetterNotice.type === 'success' ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{coverLetterNotice.text}</span>
            </div>
          )}

          {/* List of uploaded Cover Letters */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {coverLetterList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700/80 p-4 text-center text-xs text-zinc-400">
                {t('profile.documents.noCoverLetters')}
              </div>
            ) : (
              coverLetterList.map((cl) => (
                <div
                  key={cl.id || cl.file_name}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-700/80 bg-[#111215] hover:border-zinc-600 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-violet-400 shrink-0" />
                      <span className="text-xs font-medium text-zinc-200 truncate" title={cl.file_name}>
                        {cl.file_name}
                      </span>
                    </div>
                    {cl.description && (
                      <p className="text-[11px] text-violet-300/80 truncate mt-0.5 pl-5">
                        {cl.description}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5 pl-5">
                      {formatFileSize(cl.file_size)} · {formatDate(cl.uploaded_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDownloadCoverLetter(cl.id, cl.file_name)}
                      disabled={downloadingCoverLetterId === cl.id}
                      className="size-7 rounded-lg border border-zinc-700/80 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                      title={t('profile.documents.downloadCoverLetter')}
                      aria-label={t('profile.documents.downloadCoverLetter')}
                    >
                      {downloadingCoverLetterId === cl.id ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCoverLetter(cl.id, cl.file_name)}
                      className="size-7 rounded-lg border border-zinc-700/80 bg-zinc-800/80 text-zinc-300 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors cursor-pointer"
                      title={t('profile.documents.deleteCoverLetter')}
                      aria-label={t('profile.documents.deleteCoverLetter')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Upload New Cover Letter Box */}
          <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
            <input
              ref={coverLetterInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => void handleCoverLetterUpload(e)}
              className="hidden"
            />
            <input
              type="text"
              value={newCoverLetterDescription}
              onChange={(e) => setNewCoverLetterDescription(e.target.value)}
              placeholder={t('profile.documents.coverLetterDescriptionPlaceholder')}
              className="w-full rounded-lg border border-zinc-700/80 bg-[#16171b] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => coverLetterInputRef.current?.click()}
              disabled={isUploadingCoverLetter}
              className="w-full h-9 px-3.5 rounded-lg border border-violet-500/50 bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUploadingCoverLetter ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>{t('profile.documents.uploadCoverLetter')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
