import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Profile } from '../../types/job';
import { useTranslation } from 'react-i18next';

interface ProfileQualificationsProps {
  formData: Profile;
  currentCertifications: string[];
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
  onAddTag: (
    field: 'keywords' | 'languages' | 'tools_software',
    val: string,
    setVal: React.Dispatch<React.SetStateAction<string>>
  ) => void;
  onRemoveTag: (field: 'keywords' | 'languages' | 'tools_software', valToRemove: string) => void;
  onAddCertification: (val: string) => void;
  onRemoveCertification: (val: string) => void;
}

export const ProfileQualifications: React.FC<ProfileQualificationsProps> = ({
  formData,
  currentCertifications,
  onChange,
  onAddTag,
  onRemoveTag,
  onAddCertification,
  onRemoveCertification,
}) => {
  const { t } = useTranslation();
  const [newKeyword, setNewKeyword] = useState('');
  const [newLanguage, setNewLanguage] = useState('');
  const [newTool, setNewTool] = useState('');
  const [newCertification, setNewCertification] = useState('');

  return (
    <>
      {/* Education & Qualifications */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.qualifications.educationTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.qualifications.education')}
            </label>
            <input
              type="text"
              value={formData.education || ''}
              onChange={(e) => onChange('education', e.target.value)}
              placeholder={t('profile.qualifications.educationPlaceholder')}
              className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Certifications Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.qualifications.certifications')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
              {currentCertifications.map((cert) => (
                <span
                  key={cert}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:border-emerald-500/50 transition-colors select-none"
                >
                  <span>{cert}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveCertification(cert)}
                    className="text-emerald-400/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    onAddCertification(newCertification);
                    setNewCertification('');
                  }
                }}
                placeholder={t('profile.qualifications.addCertificationPlaceholder')}
                className="min-w-[220px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Languages Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.qualifications.languages')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
              {formData.languages?.map((lang) => (
                <span
                  key={lang}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-200 hover:border-purple-500/50 transition-colors select-none"
                >
                  <span>{lang}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveTag('languages', lang)}
                    className="text-purple-400/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    onAddTag('languages', newLanguage, setNewLanguage);
                  }
                }}
                placeholder={t('profile.qualifications.addLanguagePlaceholder')}
                className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tools & Software */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.qualifications.toolsTitle')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
          {formData.tools_software?.map((tool) => (
            <span
              key={tool}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-200 hover:border-teal-500/50 transition-colors select-none"
            >
              <span>{tool}</span>
              <button
                type="button"
                onClick={() => onRemoveTag('tools_software', tool)}
                className="text-teal-400/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                onAddTag('tools_software', newTool, setNewTool);
              }
            }}
            placeholder={t('profile.qualifications.addToolPlaceholder')}
            className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Core Competencies & Keywords */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.qualifications.keywordsTitle')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[52px] focus-within:border-indigo-500 transition-all">
          {(formData.keywords ?? []).map((kw) => (
            <span
              key={kw}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-mono text-amber-200 hover:border-amber-500/50 transition-colors select-none"
            >
              <span>{kw}</span>
              <button
                type="button"
                onClick={() => onRemoveTag('keywords', kw)}
                className="text-amber-400/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                onAddTag('keywords', newKeyword, setNewKeyword);
              }
            }}
            placeholder={
              formData.keywords.length === 0
                ? t('profile.qualifications.skillPlaceholder')
                : t('profile.qualifications.addKeywordPlaceholder')
            }
            className="min-w-[140px] flex-1 bg-transparent px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Career Objective & Experience Summary */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.qualifications.summaryTitle')}
          </h2>
        </div>

        <div className="space-y-1.5">
          <textarea
            rows={6}
            value={formData.summary || ''}
            onChange={(e) => onChange('summary', e.target.value)}
            placeholder={t('profile.qualifications.summaryPlaceholder')}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] p-3.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors leading-relaxed font-sans"
          />
        </div>
      </div>
    </>
  );
};
