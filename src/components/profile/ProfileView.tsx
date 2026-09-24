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
import { Card, PageHeader } from '../../design-system';

interface ProfileViewProps {
  profile: Profile | null;
  isLoading?: boolean;
  loadError?: string | null;
  userEmail?: string | null;
  onSaveProfile: (profile: Profile) => Promise<{ success: boolean; error?: string }>;
  jobs?: Job[];
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  isLoading = false,
  loadError = null,
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
  const saveSequenceRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const queueSaveRef = useRef<(snapshot: Profile) => Promise<void>>(async () => undefined);

  // Synchronize incoming profile changes from other devices or backend
  useEffect(() => {
    if (!profile) return;

    // If this screen is actively typing/scheduling a debounced save, don't overwrite user input
    if (debounceTimerRef.current || pendingSaveCountRef.current > 0) return;

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

  // Persist full-profile snapshots in order. This prevents an older request
  // from completing after a newer edit and replacing the newer server state.
  const queueSave = useCallback((snapshot: Profile) => {
    pendingSaveCountRef.current += 1;
    const save = saveSequenceRef.current.then(() => performSave(snapshot));
    saveSequenceRef.current = save.catch(() => undefined).then(() => undefined);
    void save.finally(() => {
      pendingSaveCountRef.current -= 1;
    });
    return save;
  }, [performSave]);

  useEffect(() => {
    queueSaveRef.current = queueSave;
  }, [queueSave]);

  const scheduleAutoSave = useCallback(
    (updatedData: Profile, delay = 800) => {
      latestDataRef.current = updatedData;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSaveStatus('saving');
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void queueSave(latestDataRef.current);
      }, delay);
    },
    [queueSave]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        void queueSaveRef.current(latestDataRef.current);
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

  const currentCertifications = formData.certifications
    ? formData.certifications.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const handleScoringRulesChange = (rules: ScoringRules) => {
    setFormData((prev) => {
      const next = { ...prev, scoring_rules: rules };
      scheduleAutoSave(next, 500);
      return next;
    });
  };

  if (isLoading || loadError || !profile) {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        {isLoading ? (
          <RefreshCw className="mx-auto size-5 animate-spin text-ds-text-muted" aria-label={t('common.loading')} />
        ) : (
          <>
            <AlertCircle className="mx-auto size-5 text-ds-negative" />
            <p role="alert" className="mt-3 text-sm text-ds-negative">{loadError || t('profile.loadError')}</p>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <Card className="p-5 shadow-sm lg:p-6">
        <PageHeader
          title={t('profile.title')}
          description={t('profile.subtitle')}
          actions={(
            <>
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ds-text-secondary">
              <RefreshCw className="size-3 animate-spin text-ds-accent" />
              <span>{t('common.saving')}</span>
            </span>
          )}

          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ds-positive font-medium">
              <Check className="size-3 text-ds-positive" />
              <span>{t('common.saved')}</span>
            </span>
          )}

          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ds-negative font-medium">
              <AlertCircle className="size-3 text-ds-negative" />
              <span>{t('profile.autoSaveFailed')}</span>
            </span>
          )}
            </>
          )}
        />
      </Card>

      {/* Error Banner */}
      {saveStatus === 'error' && (
        <div className="rounded-xl border border-ds-negative/30 bg-ds-negative/10 p-4 text-xs text-ds-negative flex items-start gap-3">
          <AlertCircle className="size-4 text-ds-negative shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-ds-negative">{t('profile.autoSaveNotice')}</p>
            <p className="mt-0.5 text-ds-text-muted">{errorMessage}</p>
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
          userEmail={userEmail}
        />

        {/* Target Roles, Preferences & Compensation */}
        <ProfileTargetPreferences
          formData={formData}
          currentWorkModes={currentWorkModes}
          onChange={handleChange}
          onToggleWorkMode={handleToggleWorkMode}
        />

        {/* Qualifications, Skills & Summary */}
        <ProfileQualifications
          formData={formData}
          currentCertifications={currentCertifications}
          onChange={handleChange}
        />

        {/* AI Scoring Rules (Advanced) */}
        <Card className="space-y-4 p-5 shadow-sm transition-colors hover:border-ds-border-strong lg:p-6">
          <div className="border-b border-ds-border pb-3">
            <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
              {t('profile.scoring.title')}
            </h2>
            <p className="mt-1 text-[11px] text-ds-text-secondary">
              {t('profile.scoring.subtitle')}
            </p>
          </div>

          <ScoringRulesEditor
            value={formData.scoring_rules}
            onChange={handleScoringRulesChange}
            jobs={jobs}
            userEmail={userEmail}
          />
        </Card>
      </form>
    </div>
  );
};
