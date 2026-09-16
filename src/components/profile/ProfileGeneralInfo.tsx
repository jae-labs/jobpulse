import React, { useMemo, useRef } from 'react';
import { Camera, User } from 'lucide-react';
import { Button, Card, Select, TextField } from '../../design-system';
import type { Profile } from '../../types/job';
import { COUNTRY_CODES } from './profileConstants';
import { useTranslation } from 'react-i18next';
import { useSaveAvatarMutation } from '../../hooks/useQueries';

interface ProfileGeneralInfoProps {
  formData: Profile;
  phoneDial: string;
  phoneNumber: string;
  onPhoneChange: (newDial: string, newNumber: string) => void;
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
  userEmail?: string | null;
}

export const ProfileGeneralInfo: React.FC<ProfileGeneralInfoProps> = ({
  formData,
  phoneDial,
  phoneNumber,
  onPhoneChange,
  onChange,
  userEmail,
}) => {
  const { t, i18n } = useTranslation();
  const saveAvatarMutation = useSaveAvatarMutation(userEmail);
  const countryNames = useMemo(
    () => new Intl.DisplayNames([i18n.language], { type: 'region' }),
    [i18n.language],
  );
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert(t('profile.general.avatarTooLarge'));
      return;
    }

    if (!userEmail) {
      // Fallback: store as base64 if no auth context (shouldn't happen in prod)
      const reader = new FileReader();
      reader.onload = () => onChange('avatar_url', reader.result as string);
      reader.readAsDataURL(file);
      return;
    }

    try {
      const url = await saveAvatarMutation.mutateAsync(file);
      onChange('avatar_url', url);
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : undefined) || t('profile.general.avatarUploadError'));
    }
  };

  const handleRemoveAvatar = () => {
    onChange('avatar_url', '');
  };

  return (
    <Card className="space-y-5 p-5 lg:p-6">
      <div className="border-b border-ds-border pb-3">
        <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
          {t('profile.general.title')}
        </h2>
      </div>

      {/* Profile Photo */}
      <div className="flex items-center gap-4 pb-4 border-b border-ds-border">
        <div className="relative group shrink-0">
          {formData.avatar_url ? (
            <img
              src={formData.avatar_url}
              alt={t('profile.general.avatarAlt')}
              className="size-16 rounded-full border-2 border-ds-accent object-cover shadow-sm"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full border-2 border-ds-accent bg-ds-accent-subtle text-lg font-bold text-ds-text-primary">
              {formData.first_name ? formData.first_name[0]?.toUpperCase() : <User className="size-7" />}
            </div>
          )}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={saveAvatarMutation.isPending}
            className="absolute inset-0 rounded-full bg-ds-canvas/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-ds-text-primary cursor-pointer disabled:cursor-wait"
            title={t('profile.general.uploadPhoto')}
            aria-label={t('profile.general.uploadPhoto')}
          >
            <Camera className="size-5" />
          </button>
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-ds-text-primary">{t('profile.general.profilePhoto')}</h3>
          <p className="text-[11px] text-ds-text-secondary">
            {t('profile.general.photoHelp')}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
              disabled={saveAvatarMutation.isPending}
              className="h-7"
            >
              <Camera className="size-3.5" />
              <span>{formData.avatar_url ? t('profile.general.changePhoto') : t('profile.general.uploadPhoto')}</span>
            </Button>
            {formData.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="h-7 cursor-pointer rounded-lg border border-ds-border-strong px-2.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-negative hover:text-ds-negative"
              >
                {t('common.remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="profile-first-name" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.firstName')}
          </label>
          <TextField
            id="profile-first-name"
            density="compact"
            type="text"
            value={formData.first_name || ''}
            onChange={(e) => onChange('first_name', e.target.value)}
            placeholder={t('profile.general.firstNamePlaceholder')}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-last-name" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.lastName')}
          </label>
          <TextField
            id="profile-last-name"
            density="compact"
            type="text"
            value={formData.last_name || ''}
            onChange={(e) => onChange('last_name', e.target.value)}
            placeholder={t('profile.general.lastNamePlaceholder')}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-phone-number" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.phoneNumber')}
          </label>
          <div className="flex gap-2">
            <Select
              aria-label={t('profile.general.selectCountry')}
              density="compact"
              value={phoneDial}
              onChange={(e) => onPhoneChange(e.target.value, phoneNumber)}
              containerClassName="w-40 shrink-0"
            >
              <option value="" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.selectCountry')}</option>
              {COUNTRY_CODES.filter((c) => c.dial).map((c) => (
                <option key={c.code} value={c.dial} className="bg-ds-panel text-ds-text-secondary">
                  {c.code ? `${countryNames.of(c.code)} (${c.dial})` : t('profile.general.otherCountry')}
                </option>
              ))}
            </Select>
            <TextField
              id="profile-phone-number"
              density="compact"
              type="tel"
              value={phoneNumber}
              onChange={(e) => onPhoneChange(phoneDial, e.target.value)}
              placeholder={t('profile.general.phonePlaceholder')}
              className="h-9 min-w-0 flex-1"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-linkedin-url" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.linkedinUrl')}
          </label>
          <TextField
            id="profile-linkedin-url"
            density="compact"
            type="text"
            value={formData.linkedin_url || ''}
            onChange={(e) => onChange('linkedin_url', e.target.value)}
            placeholder={t('profile.general.linkedinPlaceholder')}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-work-authorization" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.workAuthorization')}
          </label>
          <Select
            id="profile-work-authorization"
            density="compact"
            value={formData.work_authorization || 'EU Citizen'}
            onChange={(e) => onChange('work_authorization', e.target.value)}
          >
            <option value="EU Citizen" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.euCitizen')}</option>
            <option value="Stamp 4 / Permanent Residency" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.permanentResidence')}</option>
            <option value="Critical Skills Employment Permit" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.criticalSkillsPermit')}</option>
            <option value="General Employment Permit" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.generalPermit')}</option>
            <option value="UK Citizen" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.ukCitizen')}</option>
            <option value="Visa / Sponsorship Required" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.sponsorshipRequired')}</option>
            <option value="Other" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.authorization.other')}</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-gender" className="text-xs font-medium text-ds-text-secondary">
            {t('profile.general.gender')} <span className="text-ds-text-muted font-normal">({t('common.optional')})</span>
          </label>
          <Select
            id="profile-gender"
            density="compact"
            value={formData.gender || ''}
            onChange={(e) => onChange('gender', e.target.value)}
          >
            <option value="" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.genderOptions.preferNotToSay')}</option>
            <option value="Female" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.genderOptions.female')}</option>
            <option value="Male" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.genderOptions.male')}</option>
            <option value="Non-binary" className="bg-ds-panel text-ds-text-secondary">{t('profile.general.genderOptions.nonBinary')}</option>
          </Select>
        </div>
      </div>
    </Card>
  );
};
