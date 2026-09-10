import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, RefreshCw, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Profile, ScoringRules, Job } from '../../types/job';
import { ScoringRulesEditor } from './ScoringRulesEditor';
import { ProfileDocuments } from './ProfileDocuments';
import { ProfileGeneralInfo } from './ProfileGeneralInfo';
import { ProfileTargetPreferences } from './ProfileTargetPreferences';
import { ProfileQualifications } from './ProfileQualifications';
import { parsePhone } from './profileConstants';

interface ProfileViewProps {
  profile: Profile | null;
  userEmail?: string | null;
  onSaveProfile: (profile: Profile) => Promise<{ success: boolean; error?: string }>;
  jobs?: Job[];
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  userEmail,
  onSaveProfile,
  jobs,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Profile>(
    profile || {
      name: '',
      first_name: '',
      last_name: '',
      phone: '',
      linkedin_url: '',
      work_authorization: 'EU Citizen',
      gender: '',
      current_role: '',
      location: '',
      target_roles: [],
      target_locations: [],
      work_mode: 'Hybrid',
      minimum_salary: 50000,
      salary_min: 50000,
      employment: 'Permanent only',
      education: '',
      certifications: '',
      languages: [],
      tools_software: [],
      summary: '',
      keywords: [],
    }
  );

  // Phone separate state
  const initialPhone = parsePhone(formData.phone);
  const [phoneDial, setPhoneDial] = useState<string>(initialPhone.dial || '+353');
  const [phoneNumber, setPhoneNumber] = useState<string>(initialPhone.number);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<Profile>(formData);

  // Synchronize incoming profile changes from other devices or backend
  useEffect(() => {
    if (!profile) return;

    // If this screen is actively typing/scheduling a debounced save, don't overwrite user input
    if (debounceTimerRef.current) return;

    // Only update if incoming data is actually different from current local data
    const incomingStr = JSON.stringify(profile);
    const currentStr = JSON.stringify(latestDataRef.current);

    if (incomingStr !== currentStr) {
      setFormData(profile);
      latestDataRef.current = profile;
      const parsed = parsePhone(profile.phone);
      setPhoneDial(parsed.dial || '+353');
      setPhoneNumber(parsed.number);
    }
  }, [profile]);

  const performSave = useCallback(
    async (dataToSave: Profile) => {
      setSaveStatus('saving');
      setErrorMessage(null);

      const result = await onSaveProfile(dataToSave);

      if (result.success) {
        setSaveStatus('saved');
        setTimeout(() => {
          setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
        }, 3000);
      } else {
        setSaveStatus('error');
        setErrorMessage(result.error || t('profile.autoSaveError'));
      }
    },
    [onSaveProfile, t]
  );

  const scheduleAutoSave = useCallback(
    (updatedData: Profile, delay = 800) => {
      latestDataRef.current = updatedData;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSaveStatus('saving');
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void performSave(latestDataRef.current);
      }, delay);
    },
    [performSave]
  );

  // Kept in sync so the unmount-flush effect below can always call the latest save function
  const latestOnSaveProfileRef = useRef(onSaveProfile);
  useEffect(() => {
    latestOnSaveProfileRef.current = onSaveProfile;
  }, [onSaveProfile]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        void latestOnSaveProfileRef.current(latestDataRef.current);
      }
    };
  }, []);

  const handleChange = useCallback(
    (field: keyof Profile, value: string | number | string[]) => {
      setFormData((prev) => {
        const next = { ...prev, [field]: value };
        scheduleAutoSave(next, 800);
        return next;
      });
    },
    [scheduleAutoSave]
  );

  const handlePhoneChange = useCallback(
    (newDial: string, newNumber: string) => {
      setPhoneDial(newDial);
      setPhoneNumber(newNumber);
      const trimmed = newNumber.trim();
      const combined = newDial ? (trimmed ? `${newDial} ${trimmed}` : newDial) : trimmed;
      handleChange('phone', combined);
    },
    [handleChange]
  );

  // Multiple work modes handler
  const currentWorkModes = formData.work_mode
    ? formData.work_mode.split(',').map((s) => s.trim()).filter(Boolean)
    : ['Hybrid'];

  const handleToggleWorkMode = (mode: string) => {
    let nextModes: string[];
    if (currentWorkModes.includes(mode)) {
      nextModes = currentWorkModes.filter((m) => m !== mode);
      if (nextModes.length === 0) nextModes = [mode];
    } else {
      nextModes = [...currentWorkModes, mode];
    }
    handleChange('work_mode', nextModes.join(', '));
  };

  // Tag helpers
  const handleAddTag = (
    field: 'keywords' | 'target_roles' | 'target_locations' | 'languages' | 'tools_software',
    val: string,
    setVal: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const currentList = (formData[field] as string[]) || [];
    if (!currentList.includes(trimmed)) {
      const nextList = [...currentList, trimmed];
      setFormData((prev) => {
        const next = { ...prev, [field]: nextList };
        scheduleAutoSave(next, 200);
        return next;
      });
    }
    setVal('');
  };

  const handleRemoveTag = (
    field: 'keywords' | 'target_roles' | 'target_locations' | 'languages' | 'tools_software',
    valToRemove: string
  ) => {
    const currentList = (formData[field] as string[]) || [];
    const nextList = currentList.filter((item) => item !== valToRemove);
    setFormData((prev) => {
      const next = { ...prev, [field]: nextList };
      scheduleAutoSave(next, 200);
      return next;
    });
  };

  const currentCertifications = formData.certifications
    ? formData.certifications.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const handleAddCertification = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!currentCertifications.includes(trimmed)) {
      const next = [...currentCertifications, trimmed];
      handleChange('certifications', next.join(', '));
    }
  };

  const handleRemoveCertification = (valToRemove: string) => {
    const next = currentCertifications.filter((item) => item !== valToRemove);
    handleChange('certifications', next.join(', '));
  };

  const handleScoringRulesChange = (rules: ScoringRules) => {
    setFormData((prev) => {
      const next = { ...prev, scoring_rules: rules };
      scheduleAutoSave(next, 500);
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-white">{t('profile.title')}</h1>
          <p className="text-xs text-zinc-400">
            {t('profile.subtitle')}
          </p>
        </div>

        {/* Live Auto-save status indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
              <RefreshCw className="size-3 animate-spin text-indigo-400" />
              <span>{t('common.saving')}</span>
            </span>
          )}

          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <Check className="size-3 text-emerald-400" />
              <span>{t('common.saved')}</span>
            </span>
          )}

          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-medium">
              <AlertCircle className="size-3 text-rose-400" />
              <span>{t('profile.autoSaveFailed')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {saveStatus === 'error' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-200 flex items-start gap-3">
          <AlertCircle className="size-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-300">{t('profile.autoSaveNotice')}</p>
            <p className="mt-0.5 text-zinc-400">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Application Documents (CVs & Cover Letters) */}
      <ProfileDocuments userEmail={userEmail} />

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* Personal & Contact Information */}
        <ProfileGeneralInfo
          formData={formData}
          phoneDial={phoneDial}
          phoneNumber={phoneNumber}
          onPhoneChange={handlePhoneChange}
          onChange={handleChange}
        />

        {/* Target Roles, Preferences & Compensation */}
        <ProfileTargetPreferences
          formData={formData}
          currentWorkModes={currentWorkModes}
          onChange={handleChange}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onToggleWorkMode={handleToggleWorkMode}
        />

        {/* Qualifications, Skills & Summary */}
        <ProfileQualifications
          formData={formData}
          currentCertifications={currentCertifications}
          onChange={handleChange}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onAddCertification={handleAddCertification}
          onRemoveCertification={handleRemoveCertification}
        />

        {/* AI Scoring Rules (Advanced) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 lg:p-6 space-y-4 shadow-sm hover:border-white/[0.16] transition-colors">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              {t('profile.scoring.title')}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-300">
              {t('profile.scoring.subtitle')}
            </p>
          </div>

          <ScoringRulesEditor
            value={formData.scoring_rules}
            onChange={handleScoringRulesChange}
            jobs={jobs}
          />
        </div>
      </form>
    </div>
  );
};
