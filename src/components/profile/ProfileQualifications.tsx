import React from 'react';
import type { Profile } from '../../types/job';
import { useTranslation } from 'react-i18next';
import { Card, Textarea, TextField } from '../../design-system';
import { TagChipInput } from './TagChipInput';

interface ProfileQualificationsProps {
  formData: Profile;
  currentCertifications: string[];
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
}

export const ProfileQualifications: React.FC<ProfileQualificationsProps> = ({
  formData,
  currentCertifications,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Education & Qualifications */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.educationTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.education')}
            </label>
            <TextField
              density="compact"
              type="text"
              value={formData.education || ''}
              onChange={(e) => onChange('education', e.target.value)}
              placeholder={t('profile.qualifications.educationPlaceholder')}
            />
          </div>

          {/* Certifications Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.certifications')}
            </label>
            <TagChipInput
              items={currentCertifications}
              onChange={(next) => onChange('certifications', next.join(', '))}
              placeholder={t('profile.qualifications.addCertificationPlaceholder')}
              theme="positive"
            />
          </div>

          {/* Languages Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.languages')}
            </label>
            <TagChipInput
              items={formData.languages || []}
              onChange={(next) => onChange('languages', next)}
              placeholder={t('profile.qualifications.addLanguagePlaceholder')}
              theme="accent"
            />
          </div>
        </div>
      </Card>

      {/* Tools & Software */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.toolsTitle')}
          </h2>
        </div>

        <TagChipInput
          items={formData.tools_software || []}
          onChange={(next) => onChange('tools_software', next)}
          placeholder={t('profile.qualifications.addToolPlaceholder')}
          theme="status-new"
        />
      </Card>

      {/* Core Competencies & Keywords */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.keywordsTitle')}
          </h2>
        </div>

        <TagChipInput
          items={formData.keywords || []}
          onChange={(next) => onChange('keywords', next)}
          placeholder={
            !formData.keywords || formData.keywords.length === 0
              ? t('profile.qualifications.skillPlaceholder')
              : t('profile.qualifications.addKeywordPlaceholder')
          }
          theme="warning"
        />
      </Card>

      {/* Career Objective & Experience Summary */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.summaryTitle')}
          </h2>
        </div>

        <div className="space-y-1.5">
          <Textarea
            density="compact"
            rows={6}
            value={formData.summary || ''}
            onChange={(e) => onChange('summary', e.target.value)}
            placeholder={t('profile.qualifications.summaryPlaceholder')}
          />
        </div>
      </Card>
    </>
  );
};
