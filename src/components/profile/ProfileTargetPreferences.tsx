import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Profile } from '../../types/job';
import { WORK_MODE_OPTIONS } from './profileConstants';
import { useTranslation } from 'react-i18next';

interface ProfileTargetPreferencesProps {
  formData: Profile;
  currentWorkModes: string[];
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
  onAddTag: (
    field: 'target_roles' | 'target_locations',
    val: string,
    setVal: React.Dispatch<React.SetStateAction<string>>
  ) => void;
  onRemoveTag: (field: 'target_roles' | 'target_locations', valToRemove: string) => void;
  onToggleWorkMode: (mode: string) => void;
}

export const ProfileTargetPreferences: React.FC<ProfileTargetPreferencesProps> = ({
  formData,
  currentWorkModes,
  onChange,
  onAddTag,
  onRemoveTag,
  onToggleWorkMode,
}) => {
  const { t } = useTranslation();
  const [newTargetRole, setNewTargetRole] = useState('');
  const [newTargetLocation, setNewTargetLocation] = useState('');

  return (
    <>
      {/* Current Role */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.target.currentRole')}
          </h2>
        </div>

        <div className="space-y-1.5 max-w-xl">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.target.currentJobTitle')}
          </label>
          <input
            type="text"
            value={formData.current_role || ''}
            onChange={(e) => onChange('current_role', e.target.value)}
            placeholder={t('profile.target.currentJobTitlePlaceholder')}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Target Roles, Work Modes & Locations */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {t('profile.target.title')}
          </h2>
        </div>

        {/* Target Role(s) Tag Box */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.target.roleTitles')}
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
            {formData.target_roles?.map((role) => (
              <span
                key={role}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:border-indigo-500/50 transition-colors select-none"
              >
                <span>{role}</span>
                <button
                  type="button"
                  onClick={() => onRemoveTag('target_roles', role)}
                  className="text-indigo-400/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={newTargetRole}
              onChange={(e) => setNewTargetRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  onAddTag('target_roles', newTargetRole, setNewTargetRole);
                }
              }}
              placeholder={t('profile.target.addRolePlaceholder')}
              className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Target Locations Tag Box */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.target.locations')}
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
            {formData.target_locations?.map((loc) => (
              <span
                key={loc}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:border-sky-500/50 transition-colors select-none"
              >
                <span>{loc}</span>
                <button
                  type="button"
                  onClick={() => onRemoveTag('target_locations', loc)}
                  className="text-sky-400/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={newTargetLocation}
              onChange={(e) => setNewTargetLocation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  onAddTag('target_locations', newTargetLocation, setNewTargetLocation);
                }
              }}
              placeholder={t('profile.target.addLocationPlaceholder')}
              className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Work Mode Preferences: Multi-select */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.target.workModes')}
            </label>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {WORK_MODE_OPTIONS.map((mode) => {
                const active = currentWorkModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onToggleWorkMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200 shadow-sm shadow-indigo-500/10'
                        : 'border-zinc-700/80 bg-[#111215] text-zinc-300 hover:text-white hover:border-zinc-600'
                    }`}
                  >
                    {active && <Check className="size-3 text-indigo-300" />}
                    <span>{t(`profile.target.workModeOptions.${mode === 'On-site' ? 'onSite' : mode.toLowerCase()}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Employment Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.target.employmentType')}
            </label>
            <select
              value={formData.employment || 'Permanent only'}
              onChange={(e) => onChange('employment', e.target.value)}
              className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="Permanent only" className="bg-[#16171b] text-zinc-200">{t('profile.target.employmentOptions.permanentOnly')}</option>
              <option value="Permanent & Fixed-term" className="bg-[#16171b] text-zinc-200">{t('profile.target.employmentOptions.permanentFixedTerm')}</option>
              <option value="Contract / Specified Purpose" className="bg-[#16171b] text-zinc-200">{t('profile.target.employmentOptions.contract')}</option>
              <option value="Open to all" className="bg-[#16171b] text-zinc-200">{t('profile.target.employmentOptions.openToAll')}</option>
            </select>
          </div>

          {/* Minimum Expected Salary (€ / yr) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              {t('profile.target.minimumSalary')}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-emerald-400 font-semibold">
                €
              </span>
              <input
                type="number"
                step="1000"
                value={formData.salary_min || 50000}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange('salary_min', val);
                  onChange('minimum_salary', val);
                }}
                className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] pl-8 pr-3.5 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
