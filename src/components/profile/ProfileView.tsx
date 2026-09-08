import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  X,
  RefreshCw,
  Check,
  FileText,
  Download,
  Upload,
  Trash2,
} from 'lucide-react';
import type { Profile, UserCVMetadata } from '../../types/job';
import {
  loadUserCVMetadata,
  downloadUserCV,
  saveUserCV,
  deleteUserCV,
} from '../../lib/userProfile';

const COUNTRY_CODES = [
  { label: 'Ireland (+353)', dial: '+353' },
  { label: 'United Kingdom (+44)', dial: '+44' },
  { label: 'United States (+1)', dial: '+1' },
  { label: 'Brazil (+55)', dial: '+55' },
  { label: 'Portugal (+351)', dial: '+351' },
  { label: 'Spain (+34)', dial: '+34' },
  { label: 'Germany (+49)', dial: '+49' },
  { label: 'France (+33)', dial: '+33' },
  { label: 'Italy (+39)', dial: '+39' },
  { label: 'Netherlands (+31)', dial: '+31' },
  { label: 'Poland (+48)', dial: '+48' },
  { label: 'Canada (+1)', dial: '+1' },
  { label: 'Australia (+61)', dial: '+61' },
  { label: 'India (+91)', dial: '+91' },
  { label: 'Other', dial: '' },
];

function parsePhone(rawPhone?: string): { dial: string; number: string } {
  if (!rawPhone) return { dial: '+353', number: '' };
  const trimmed = rawPhone.trim();
  const sorted = [...COUNTRY_CODES]
    .filter((c) => c.dial)
    .sort((a, b) => b.dial.length - a.dial.length);

  for (const c of sorted) {
    if (trimmed.startsWith(c.dial)) {
      return {
        dial: c.dial,
        number: trimmed.slice(c.dial.length).trim(),
      };
    }
  }
  return { dial: '', number: trimmed };
}

const WORK_MODE_OPTIONS = ['Hybrid', 'Remote', 'On-site'];

interface ProfileViewProps {
  profile: Profile | null;
  userEmail?: string | null;
  onSaveProfile: (profile: Profile) => Promise<{ success: boolean; error?: string }>;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  userEmail,
  onSaveProfile,
}) => {
  const [formData, setFormData] = useState<Profile>(
    profile || {
      name: '',
      first_name: '',
      last_name: '',
      phone: '',
      linkedin_url: '',
      work_authorization: 'EU Citizen',
      gender: '',
      headline: '',
      current_role: '',
      current_company: '',
      years_of_experience: '5-8 years',
      location: '',
      target_roles: [],
      target_locations: [],
      work_mode: 'Hybrid',
      minimum_salary: 50000,
      salary_min: 50000,
      employment: 'Permanent only',
      highest_education: "Master's Degree (QQI Level 9)",
      education: '',
      education_details: '',
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

  // Tag inputs
  const [newKeyword, setNewKeyword] = useState('');
  const [newTargetRole, setNewTargetRole] = useState('');
  const [newTargetLocation, setNewTargetLocation] = useState('');
  const [newLanguage, setNewLanguage] = useState('');
  const [newTool, setNewTool] = useState('');

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // CV state
  const [cvMeta, setCvMeta] = useState<UserCVMetadata | null>(null);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [isDownloadingCv, setIsDownloadingCv] = useState(false);
  const [cvNotice, setCvNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<Profile>(formData);

  // Load CV metadata when userEmail is ready
  useEffect(() => {
    if (userEmail) {
      void loadUserCVMetadata(userEmail).then((meta) => setCvMeta(meta));
    }
  }, [userEmail]);

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
        setErrorMessage(result.error || 'Failed to auto-save to Supabase.');
      }
    },
    [onSaveProfile]
  );

  const scheduleAutoSave = (updatedData: Profile, delay = 800) => {
    latestDataRef.current = updatedData;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSaveStatus('saving');
    debounceTimerRef.current = setTimeout(() => {
      void performSave(latestDataRef.current);
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        void onSaveProfile(latestDataRef.current);
      }
    };
  }, [onSaveProfile]);

  const handleChange = (
    field: keyof Profile,
    value: string | number | string[]
  ) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      scheduleAutoSave(next, 800);
      return next;
    });
  };

  const handlePhoneChange = (newDial: string, newNumber: string) => {
    setPhoneDial(newDial);
    setPhoneNumber(newNumber);
    const trimmed = newNumber.trim();
    const combined = newDial ? (trimmed ? `${newDial} ${trimmed}` : newDial) : trimmed;
    handleChange('phone', combined);
  };

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

  // CV Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userEmail) return;

    if (file.size > 10 * 1024 * 1024) {
      setCvNotice({ type: 'error', text: 'File is too large. Maximum size is 10MB.' });
      return;
    }

    setIsUploadingCv(true);
    setCvNotice(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        const res = await saveUserCV(
          userEmail,
          file.name,
          file.size,
          file.type || 'application/pdf',
          base64String
        );

        if (res.success) {
          setCvMeta({
            user_email: userEmail,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || 'application/pdf',
            uploaded_at: new Date().toISOString(),
          });
          setCvNotice({ type: 'success', text: `${file.name} saved successfully!` });
          setTimeout(() => setCvNotice(null), 4000);
        } else {
          setCvNotice({ type: 'error', text: res.error || 'Failed to upload CV.' });
        }
      } catch (err: any) {
        setCvNotice({ type: 'error', text: err?.message || 'Error processing file.' });
      } finally {
        setIsUploadingCv(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadCv = async () => {
    if (!userEmail) return;
    setIsDownloadingCv(true);
    try {
      const res = await downloadUserCV(userEmail);
      if (res && res.fileData) {
        const link = document.createElement('a');
        link.href = `data:${res.mimeType || 'application/pdf'};base64,${res.fileData}`;
        link.download = res.fileName || 'Resume.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        setCvNotice({ type: 'error', text: 'Could not load CV document.' });
      }
    } catch {
      setCvNotice({ type: 'error', text: 'Failed to download CV.' });
    } finally {
      setIsDownloadingCv(false);
    }
  };

  const handleDeleteCv = async () => {
    if (!userEmail || !confirm('Are you sure you want to remove your stored CV?')) return;
    const ok = await deleteUserCV(userEmail);
    if (ok) {
      setCvMeta(null);
      setCvNotice({ type: 'success', text: 'CV removed.' });
      setTimeout(() => setCvNotice(null), 3000);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-800/80 bg-gradient-to-r from-zinc-900/70 via-zinc-900/50 to-zinc-950/70 p-5 lg:p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-white">Profile</h1>
          <p className="text-xs text-zinc-400">
            Manage your personal details, target roles, and career criteria. Changes save automatically.
          </p>
        </div>

        {/* Live Auto-save status indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
              <RefreshCw className="size-3 animate-spin text-indigo-400" />
              <span>Saving...</span>
            </span>
          )}

          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <Check className="size-3 text-emerald-400" />
              <span>Saved</span>
            </span>
          )}

          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-medium">
              <AlertCircle className="size-3 text-rose-400" />
              <span>Auto-save failed</span>
            </span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {saveStatus === 'error' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-200 flex items-start gap-3">
          <AlertCircle className="size-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-300">Auto-save notice</p>
            <p className="mt-0.5 text-zinc-400">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* CV / RESUME DOCUMENT SECTION                                                  */}
      {/* ============================================================================== */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
        <div className="border-b border-zinc-800/80 pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
            CV & Resume Document
          </h2>
        </div>

        {cvNotice && (
          <div
            className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
              cvNotice.type === 'success'
                ? 'border border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                : 'border border-rose-500/30 bg-rose-950/30 text-rose-300'
            }`}
          >
            {cvNotice.type === 'success' ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              <AlertCircle className="size-3.5 shrink-0" />
            )}
            <span>{cvNotice.text}</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => void handleFileUpload(e)}
          className="hidden"
        />

        {cvMeta ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-10 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-100 truncate" title={cvMeta.file_name}>
                  {cvMeta.file_name}
                </p>
                <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  {formatFileSize(cvMeta.file_size)} · Uploaded {new Date(cvMeta.uploaded_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t border-zinc-800/60 sm:border-t-0">
              <button
                type="button"
                onClick={() => void handleDownloadCv()}
                disabled={isDownloadingCv}
                className="h-9 sm:h-8 flex-1 sm:flex-initial px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm shadow-indigo-600/20 whitespace-nowrap shrink-0"
              >
                {isDownloadingCv ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5 shrink-0" />
                )}
                <span>Download CV</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingCv}
                className="h-9 sm:h-8 px-3 rounded-lg border border-zinc-700/80 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isUploadingCv ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5 shrink-0" />
                )}
                <span>Replace</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteCv()}
                className="size-9 sm:size-8 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors cursor-pointer"
                title="Delete CV"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 hover:border-indigo-500/50 bg-zinc-900/30 hover:bg-zinc-900/50 p-6 text-center cursor-pointer transition-all group"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 transition-colors mb-2">
              <Upload className="size-4" />
            </div>
            <p className="text-xs font-semibold text-zinc-200">
              Click to upload your CV
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              PDF or Word document (up to 10MB)
            </p>
          </div>
        )}
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* ============================================================================== */}
        {/* PERSONAL & CONTACT INFORMATION                                                */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Personal & Contact Information
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                First Name
              </label>
              <input
                type="text"
                value={formData.first_name || ''}
                onChange={(e) => handleChange('first_name', e.target.value)}
                placeholder="e.g. Jane"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Last Name
              </label>
              <input
                type="text"
                value={formData.last_name || ''}
                onChange={(e) => handleChange('last_name', e.target.value)}
                placeholder="e.g. Doe"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Phone Number
              </label>
              <div className="flex gap-2">
                <select
                  value={phoneDial}
                  onChange={(e) => handlePhoneChange(e.target.value, phoneNumber)}
                  className="w-40 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.label} value={c.dial}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => handlePhoneChange(phoneDial, e.target.value)}
                  placeholder="87 123 4567"
                  className="flex-1 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                LinkedIn Profile URL
              </label>
              <input
                type="text"
                value={formData.linkedin_url || ''}
                onChange={(e) => handleChange('linkedin_url', e.target.value)}
                placeholder="e.g. https://linkedin.com/in/username"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Work Authorization / Citizenship
              </label>
              <select
                value={formData.work_authorization || 'EU Citizen'}
                onChange={(e) => handleChange('work_authorization', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="EU Citizen">EU Citizen</option>
                <option value="Stamp 4 / Permanent Residency">Stamp 4 / Permanent Residency</option>
                <option value="Critical Skills Employment Permit">Critical Skills Employment Permit</option>
                <option value="General Employment Permit">General Employment Permit</option>
                <option value="UK Citizen">UK Citizen</option>
                <option value="Visa / Sponsorship Required">Visa / Sponsorship Required</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Gender / Sex <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => handleChange('gender', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">Prefer not to say</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
              </select>
            </div>
          </div>
        </div>

        {/* ============================================================================== */}
        {/* PROFESSIONAL IDENTITY & EXPERIENCE                                            */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Current Role & Experience
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Headline
              </label>
              <input
                type="text"
                value={formData.headline || ''}
                onChange={(e) => handleChange('headline', e.target.value)}
                placeholder="e.g. Operations & Administration Manager | Project Lead"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Current Role
              </label>
              <input
                type="text"
                value={formData.current_role || ''}
                onChange={(e) => handleChange('current_role', e.target.value)}
                placeholder="e.g. Operations Manager"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Current Organization / Company
              </label>
              <input
                type="text"
                value={formData.current_company || ''}
                onChange={(e) => handleChange('current_company', e.target.value)}
                placeholder="e.g. Acme Corporation"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Total Years of Experience
              </label>
              <select
                value={formData.years_of_experience || '10+ years'}
                onChange={(e) => handleChange('years_of_experience', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="1-3 years">1–3 years</option>
                <option value="3-5 years">3–5 years</option>
                <option value="5-8 years">5–8 years</option>
                <option value="8-10 years">8–10 years</option>
                <option value="10+ years">10+ years</option>
                <option value="15+ years">15+ years</option>
              </select>
            </div>
          </div>
        </div>

        {/* ============================================================================== */}
        {/* TARGET ROLES, WORK MODES & LOCATIONS                                          */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Target Roles, Preferences & Compensation
            </h2>
          </div>

          {/* Target Role(s) Tag Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              Target Role Titles
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
              {formData.target_roles?.map((role) => (
                <span
                  key={role}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:border-indigo-500/50 transition-colors select-none"
                >
                  <span>{role}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag('target_roles', role)}
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
                    handleAddTag('target_roles', newTargetRole, setNewTargetRole);
                  }
                }}
                placeholder="+ Add target role (e.g. Operations Manager, Project Lead)..."
                className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Target Locations Tag Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-200">
              Target Commuting Locations & Corridors
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
              {formData.target_locations?.map((loc) => (
                <span
                  key={loc}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:border-sky-500/50 transition-colors select-none"
                >
                  <span>{loc}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag('target_locations', loc)}
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
                    handleAddTag('target_locations', newTargetLocation, setNewTargetLocation);
                  }
                }}
                placeholder="+ Add location (e.g. Dublin, North Kildare, County Laois)..."
                className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* Work Mode Preferences: Multi-select */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Work Mode Preferences (Select multiple)
              </label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {WORK_MODE_OPTIONS.map((mode) => {
                  const active = currentWorkModes.includes(mode);
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleToggleWorkMode(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        active
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200 shadow-sm shadow-indigo-500/10'
                          : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      {active && <Check className="size-3 text-indigo-300" />}
                      <span>{mode}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Employment Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Employment Type
              </label>
              <select
                value={formData.employment || 'Permanent only'}
                onChange={(e) => handleChange('employment', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="Permanent only">Permanent only</option>
                <option value="Permanent & Fixed-term">Permanent & Fixed-term</option>
                <option value="Contract / Specified Purpose">Contract / Specified Purpose</option>
                <option value="Open to all">Open to all</option>
              </select>
            </div>

            {/* Minimum Expected Salary (€ / yr) - No target max */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Minimum Salary (€ / yr)
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
                    handleChange('salary_min', val);
                    handleChange('minimum_salary', val);
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 pl-8 pr-3.5 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================================== */}
        {/* EDUCATION & QUALIFICATIONS                                                    */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Education & Qualifications
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Highest Academic Qualification
              </label>
              <select
                value={formData.highest_education || "Master's Degree (QQI Level 9)"}
                onChange={(e) => handleChange('highest_education', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="PhD / Doctorate (QQI Level 10)">PhD / Doctorate (QQI Level 10)</option>
                <option value="Master's Degree (QQI Level 9)">Master's Degree (QQI Level 9)</option>
                <option value="Postgraduate Diploma (QQI Level 9)">Postgraduate Diploma (QQI Level 9)</option>
                <option value="Honours Bachelor's (QQI Level 8)">Honours Bachelor's (QQI Level 8)</option>
                <option value="Ordinary Bachelor's (QQI Level 7)">Ordinary Bachelor's (QQI Level 7)</option>
                <option value="Associate / Higher Cert (QQI Level 6)">Associate / Higher Cert (QQI Level 6)</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Academic Degrees & Institutions
              </label>
              <input
                type="text"
                value={formData.education_details || ''}
                onChange={(e) => handleChange('education_details', e.target.value)}
                placeholder="e.g. MSc Business Management – Trinity College Dublin (2023)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Languages Tag Box */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-zinc-200">
                Languages
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
                {formData.languages?.map((lang) => (
                  <span
                    key={lang}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-200 hover:border-purple-500/50 transition-colors select-none"
                  >
                    <span>{lang}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag('languages', lang)}
                      className="text-purple-400/80 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag('languages', newLanguage, setNewLanguage);
                    }
                  }}
                  placeholder="+ Add language (e.g. English (Fluent), Spanish (Conversational))..."
                  className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================================== */}
        {/* TOOLS & SOFTWARE                                                              */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Tools, Technologies & Software
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 min-h-[46px] focus-within:border-indigo-500 transition-all">
            {formData.tools_software?.map((tool) => (
              <span
                key={tool}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-200 hover:border-teal-500/50 transition-colors select-none"
              >
                <span>{tool}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag('tools_software', tool)}
                  className="text-teal-400/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddTag('tools_software', newTool, setNewTool);
                }
              }}
              placeholder="+ Add software (e.g. SAP, Microsoft Office, MS Project)..."
              className="min-w-[180px] flex-1 bg-transparent px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ============================================================================== */}
        {/* CORE COMPETENCIES & KEYWORDS                                                  */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Matching Competencies & Keywords
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 min-h-[52px] focus-within:border-indigo-500 transition-all">
            {formData.keywords.map((kw) => (
              <span
                key={kw}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-mono text-amber-200 hover:border-amber-500/50 transition-colors select-none"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag('keywords', kw)}
                  className="text-amber-400/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddTag('keywords', newKeyword, setNewKeyword);
                }
              }}
              placeholder={
                formData.keywords.length === 0
                  ? 'Type a skill and press Enter...'
                  : '+ Add keyword...'
              }
              className="min-w-[140px] flex-1 bg-transparent px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ============================================================================== */}
        {/* CAREER OBJECTIVE & EXPERIENCE SUMMARY                                         */}
        {/* ============================================================================== */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 lg:p-6 space-y-4 shadow-sm hover:border-zinc-700/60 transition-colors">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Career Objective & Summary
            </h2>
          </div>

          <div className="space-y-1.5">
            <textarea
              rows={6}
              value={formData.summary || ''}
              onChange={(e) => handleChange('summary', e.target.value)}
              placeholder="Describe your background, leadership experience, academic administration accomplishments, and core focus areas..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 p-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors leading-relaxed font-sans"
            />
          </div>
        </div>
      </form>
    </div>
  );
};
