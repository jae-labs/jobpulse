import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@jae-labs/ui';
import type { Profile } from '../../types/job';
import { getMatchingTerms } from '../../lib/profileMatchingTerms';
import { TagChipInput } from './TagChipInput';

interface ProfileMatchingTermsProps {
  profile: Profile;
  onChange: (terms: string[]) => void;
}

export const ProfileMatchingTerms: React.FC<ProfileMatchingTermsProps> = ({ profile, onChange }) => {
  const { t } = useTranslation();
  const title = t('profile.qualifications.matchingTitle');

  return (
    <Card className="space-y-4 p-5 lg:p-6">
      <div className="border-b border-ds-border pb-3">
        <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">{title}</h2>
      </div>
      <TagChipInput
        items={getMatchingTerms(profile)}
        onChange={onChange}
        placeholder={t('profile.qualifications.skillPlaceholder')}
        ariaLabel={title}
      />
    </Card>
  );
};
