import React from 'react';
import { Check } from 'lucide-react';
import { Card, Select, TextField } from '../../design-system';
import type { Profile } from '../../types/job';
import { WORK_MODE_OPTIONS } from './profileConstants';
import { useTranslation } from 'react-i18next';
import { TagChipInput } from './TagChipInput';

interface ProfileTargetPreferencesProps {
  formData: Profile;
  currentWorkModes: string[];
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
  onToggleWorkMode: (mode: string) => void;
}

export const ProfileTargetPreferences: React.FC<ProfileTargetPreferencesProps> = ({
  formData,
  currentWorkModes,
  onChange,
  onToggleWorkMode,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Current Role */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.target.currentRole')}
          </h2>
        </div>

        <div className="space-y-1.5 w-full">
          <label htmlFor="profile-current-role" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.target.currentJobTitle')}
          </label>
          <TextField
            id="profile-current-role"
            density="compact"
            type="text"
            value={formData.current_role || ''}
            onChange={(e) => onChange('current_role', e.target.value)}
            placeholder={t('profile.target.currentJobTitlePlaceholder')}
            className="h-9"
          />
        </div>
      </Card>

      {/* Target Roles, Work Modes & Locations */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.target.title')}
          </h2>
        </div>

        {/* Target Role(s) Tag Box */}
        <div className="space-y-1.5">
          <label htmlFor="profile-target-roles" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.target.roleTitles')}
          </label>
          <TagChipInput
            items={formData.target_roles || []}
            onChange={(next) => onChange('target_roles', next)}
            placeholder={t('profile.target.addRolePlaceholder')}
            theme="accent"
            inputId="profile-target-roles"
          />
        </div>

        {/* Target Locations Tag Box */}
        <div className="space-y-1.5">
          <label htmlFor="profile-target-locations" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.target.locations')}
          </label>
          <TagChipInput
            items={formData.target_locations || []}
            onChange={(next) => onChange('target_locations', next)}
            placeholder={t('profile.target.addLocationPlaceholder')}
            theme="accent"
            inputId="profile-target-locations"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Work Mode Preferences: Multi-select */}
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-ds-text-secondary">
              {t('profile.target.workModes')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {WORK_MODE_OPTIONS.map((mode) => {
                const active = currentWorkModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onToggleWorkMode(mode)}
                    className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors cursor-pointer ds-focus-ring ${
                      active
                        ? 'border-ds-accent bg-ds-accent-subtle text-ds-text-primary shadow-sm'
                        : 'border-ds-border bg-ds-control text-ds-text-secondary hover:border-ds-border-strong hover:bg-ds-hover hover:text-ds-text-primary'
                    }`}
                  >
                    {active && <Check className="size-3 text-ds-accent" />}
                    <span>{t(`profile.target.workModeOptions.${mode === 'On-site' ? 'onSite' : mode.toLowerCase()}`)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Employment Type */}
          <div className="space-y-1.5">
            <label htmlFor="profile-employment" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.target.employmentType')}
            </label>
            <Select
              id="profile-employment"
              density="compact"
              value={formData.employment || 'Permanent only'}
              onChange={(e) => onChange('employment', e.target.value)}
            >
              <option value="Permanent only" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.permanentOnly')}</option>
              <option value="Permanent & Fixed-term" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.permanentFixedTerm')}</option>
              <option value="Contract / Specified Purpose" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.contract')}</option>
              <option value="Open to all" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.openToAll')}</option>
            </Select>
          </div>

          {/* Minimum Expected Salary (€ / yr) */}
          <div className="space-y-1.5">
            <label htmlFor="profile-minimum-salary" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.target.minimumSalary')}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-ds-positive">
                €
              </span>
              <TextField
                id="profile-minimum-salary"
                density="compact"
                type="number"
                step="1000"
                value={formData.salary_min || 50000}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange('salary_min', val);
                  onChange('minimum_salary', val);
                }}
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
};
