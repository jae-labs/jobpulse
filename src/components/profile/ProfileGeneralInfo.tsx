import React, { useMemo, useRef } from 'react';
import { Camera, User } from 'lucide-react';
import type { Profile } from '../../types/job';
import { COUNTRY_CODES } from './profileConstants';
import { useTranslation } from 'react-i18next';

interface ProfileGeneralInfoProps {
  formData: Profile;
  phoneDial: string;
  phoneNumber: string;
  onPhoneChange: (newDial: string, newNumber: string) => void;
  onChange: (field: keyof Profile, value: string | number | string[]) => void;
}

export const ProfileGeneralInfo: React.FC<ProfileGeneralInfoProps> = ({
  formData,
  phoneDial,
  phoneNumber,
  onPhoneChange,
  onChange,
}) => {
  const { t, i18n } = useTranslation();
  const countryNames = useMemo(
    () => new Intl.DisplayNames([i18n.language], { type: 'region' }),
    [i18n.language],
  );
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert(t('profile.general.avatarTooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onChange('avatar_url', result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    onChange('avatar_url', '');
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-5 shadow-sm hover:border-white/[0.16] transition-colors">
      <div className="border-b border-white/[0.06] pb-3">
        <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
          {t('profile.general.title')}
        </h2>
      </div>

      {/* Profile Photo */}
      <div className="flex items-center gap-4 pb-4 border-b border-white/[0.06]">
        <div className="relative group shrink-0">
          {formData.avatar_url ? (
            <img
              src={formData.avatar_url}
              alt={t('profile.general.avatarAlt')}
              className="size-16 rounded-full object-cover border-2 border-indigo-500/50 shadow-sm"
            />
          ) : (
            <div className="size-16 rounded-full bg-indigo-950/80 border-2 border-indigo-500/50 text-indigo-200 flex items-center justify-center font-bold text-lg">
              {formData.first_name ? formData.first_name[0]?.toUpperCase() : <User className="size-7" />}
            </div>
          )}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white cursor-pointer"
            title={t('profile.general.uploadPhoto')}
            aria-label={t('profile.general.uploadPhoto')}
          >
            <Camera className="size-5" />
          </button>
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-zinc-100">{t('profile.general.profilePhoto')}</h3>
          <p className="text-[11px] text-zinc-300">
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
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="h-7 px-2.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Camera className="size-3.5" />
              <span>{formData.avatar_url ? t('profile.general.changePhoto') : t('profile.general.uploadPhoto')}</span>
            </button>
            {formData.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="h-7 px-2.5 rounded-lg border border-zinc-700 hover:border-rose-500/40 text-zinc-300 hover:text-rose-400 text-xs font-medium transition-colors cursor-pointer"
              >
                {t('common.remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.firstName')}
          </label>
          <input
            type="text"
            value={formData.first_name || ''}
            onChange={(e) => onChange('first_name', e.target.value)}
            placeholder={t('profile.general.firstNamePlaceholder')}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.lastName')}
          </label>
          <input
            type="text"
            value={formData.last_name || ''}
            onChange={(e) => onChange('last_name', e.target.value)}
            placeholder={t('profile.general.lastNamePlaceholder')}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.phoneNumber')}
          </label>
          <div className="flex gap-2">
            <select
              value={phoneDial}
              onChange={(e) => onPhoneChange(e.target.value, phoneNumber)}
              className="w-40 shrink-0 rounded-lg border border-zinc-700/80 bg-[#111215] px-2.5 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="" className="bg-[#16171b] text-zinc-200">{t('profile.general.selectCountry')}</option>
              {COUNTRY_CODES.filter((c) => c.dial).map((c) => (
                <option key={c.code} value={c.dial} className="bg-[#16171b] text-zinc-200">
                  {c.code ? `${countryNames.of(c.code)} (${c.dial})` : t('profile.general.otherCountry')}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => onPhoneChange(phoneDial, e.target.value)}
            placeholder={t('profile.general.phonePlaceholder')}
              className="flex-1 min-w-0 rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.linkedinUrl')}
          </label>
          <input
            type="text"
            value={formData.linkedin_url || ''}
            onChange={(e) => onChange('linkedin_url', e.target.value)}
            placeholder={t('profile.general.linkedinPlaceholder')}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.workAuthorization')}
          </label>
          <select
            value={formData.work_authorization || 'EU Citizen'}
            onChange={(e) => onChange('work_authorization', e.target.value)}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="EU Citizen" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.euCitizen')}</option>
            <option value="Stamp 4 / Permanent Residency" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.permanentResidence')}</option>
            <option value="Critical Skills Employment Permit" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.criticalSkillsPermit')}</option>
            <option value="General Employment Permit" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.generalPermit')}</option>
            <option value="UK Citizen" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.ukCitizen')}</option>
            <option value="Visa / Sponsorship Required" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.sponsorshipRequired')}</option>
            <option value="Other" className="bg-[#16171b] text-zinc-200">{t('profile.general.authorization.other')}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-200">
            {t('profile.general.gender')} <span className="text-zinc-400 font-normal">({t('common.optional')})</span>
          </label>
          <select
            value={formData.gender || ''}
            onChange={(e) => onChange('gender', e.target.value)}
            className="w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="" className="bg-[#16171b] text-zinc-200">{t('profile.general.genderOptions.preferNotToSay')}</option>
            <option value="Female" className="bg-[#16171b] text-zinc-200">{t('profile.general.genderOptions.female')}</option>
            <option value="Male" className="bg-[#16171b] text-zinc-200">{t('profile.general.genderOptions.male')}</option>
            <option value="Non-binary" className="bg-[#16171b] text-zinc-200">{t('profile.general.genderOptions.nonBinary')}</option>
          </select>
        </div>
      </div>
    </div>
  );
};
