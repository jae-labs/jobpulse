import React from 'react';
import type { Profile, ScoringRules, SeniorityTierRule } from '../../types/job';
import { useTranslation } from 'react-i18next';
import { Card, Textarea, TextField } from '@jae-labs/ui';
import { TagChipInput } from './TagChipInput';
import { getRuleTags, updateRuleTags } from '../../lib/scoringRuleTags';

interface ProfileQualificationsProps {
  formData: Profile;
  currentCertifications: string[];
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
  onScoringRulesChange: (rules: ScoringRules) => void;
}

export const ProfileQualifications: React.FC<ProfileQualificationsProps> = ({
  formData,
  currentCertifications,
  onChange,
  onScoringRulesChange,
}) => {
  const { t } = useTranslation();
  const scoringRules = formData.scoring_rules;
  const seniorityRules: SeniorityTierRule[] = Array.isArray(scoringRules?.seniority_tiers)
    ? scoringRules.seniority_tiers
    : [];

  const updateSeniority = (tags: string[]) => {
    onScoringRulesChange({
      positive_domains: scoringRules?.positive_domains ?? [],
      negative_domains: scoringRules?.negative_domains ?? [],
      ...scoringRules,
      seniority_tiers: updateRuleTags(seniorityRules, tags, (tag) => ({
        name: tag,
        keywords: [tag],
        patterns: [tag],
        score_weight: 1.0,
        note: '',
      })),
    });
  };

  return (
    <>
      {/* Career Objective & Experience Summary */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.summaryTitle')}
          </h2>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-summary" className="sr-only">{t('profile.qualifications.summaryTitle')}</label>
          <Textarea
            id="profile-summary"
            density="compact"
            rows={6}
            value={formData.summary || ''}
            onChange={(e) => onChange('summary', e.target.value)}
            placeholder={t('profile.qualifications.summaryPlaceholder')}
          />
        </div>
      </Card>

      {/* Seniority Rules */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.scoring.seniorityRulesTitle')}
          </h2>
        </div>
        <TagChipInput
          items={getRuleTags(seniorityRules)}
          onChange={updateSeniority}
          placeholder={t('profile.scoring.addTitleKeyword')}
          ariaLabel={t('profile.scoring.seniorityRulesTitle')}
        />
      </Card>

      {/* Education & Qualifications */}
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.qualifications.educationTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="profile-education" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.education')}
            </label>
            <TextField
              id="profile-education"
              density="compact"
              type="text"
              value={formData.education || ''}
              onChange={(e) => onChange('education', e.target.value)}
              placeholder={t('profile.qualifications.educationPlaceholder')}
            />
          </div>

          {/* Certifications Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="profile-certifications" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.certifications')}
            </label>
            <TagChipInput
              items={currentCertifications}
              onChange={(next) => onChange('certifications', next.join(', '))}
              placeholder={t('profile.qualifications.addCertificationPlaceholder')}
              inputId="profile-certifications"
            />
          </div>

          {/* Languages Tag Box */}
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="profile-languages" className="text-xs font-medium text-ds-text-secondary">
              {t('profile.qualifications.languages')}
            </label>
            <TagChipInput
              items={formData.languages || []}
              onChange={(next) => onChange('languages', next)}
              placeholder={t('profile.qualifications.addLanguagePlaceholder')}
              inputId="profile-languages"
            />
          </div>
        </div>
      </Card>

    </>
  );
};
