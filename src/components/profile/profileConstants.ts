export const COUNTRY_CODES = [
  { code: 'IE', dial: '+353' },
  { code: 'GB', dial: '+44' },
  { code: 'US', dial: '+1' },
  { code: 'BR', dial: '+55' },
  { code: 'PT', dial: '+351' },
  { code: 'ES', dial: '+34' },
  { code: 'DE', dial: '+49' },
  { code: 'FR', dial: '+33' },
  { code: 'IT', dial: '+39' },
  { code: 'NL', dial: '+31' },
  { code: 'PL', dial: '+48' },
  { code: 'CA', dial: '+1' },
  { code: 'AU', dial: '+61' },
  { code: 'IN', dial: '+91' },
  { code: null, dial: '' },
];

export function parsePhone(rawPhone?: string): { dial: string; number: string } {
  if (!rawPhone) return { dial: '', number: '' };
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

export const WORK_MODE_OPTIONS = ['Hybrid', 'Remote', 'On-site'] as const;
