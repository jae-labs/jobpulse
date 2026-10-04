import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Card, Select, TextField } from '@jae-labs/ui';
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
  const [editingSalary, setEditingSalary] = useState(false);
  const wholeEuro = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });

  return (
    <>
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

      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.target.title')}
          </h2>
        </div>

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
                    className={`flex h-9 items-center gap-1.5 rounded-ds-control border px-3 text-xs font-medium transition-colors cursor-pointer ds-focus-ring ${
                      active
                        ? 'border-ds-accent bg-ds-accent-subtle text-ds-text-primary'
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

          <div className="space-y-1.5">
            <label htmlFor="profile-employment" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.target.employmentType')}
            </label>
            <Select
              id="profile-employment"
              density="compact"
              value={formData.employment || ''}
              onChange={(e) => onChange('employment', e.target.value)}
            >
              <option value="">{t('profile.notSpecified')}</option>
              <option value="Permanent only" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.permanentOnly')}</option>
              <option value="Permanent & Fixed-term" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.permanentFixedTerm')}</option>
              <option value="Contract / Specified Purpose" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.contract')}</option>
              <option value="Open to all" className="bg-ds-panel text-ds-text-secondary">{t('profile.target.employmentOptions.openToAll')}</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-minimum-salary" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.target.minimumSalary')}
            </label>
            <TextField
              id="profile-minimum-salary"
              density="compact"
              inputMode="numeric"
              startAdornment={<span className="font-mono font-semibold text-ds-positive">€</span>}
              value={editingSalary ? (formData.salary_min || '') : wholeEuro.format(formData.salary_min ?? 0)}
              onFocus={() => setEditingSalary(true)}
              onBlur={() => setEditingSalary(false)}
              onChange={(e) => onChange('salary_min', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
              placeholder="0"
              className="h-9"
            />
          </div>
        </div>
      </Card>
    </>
  );
};
