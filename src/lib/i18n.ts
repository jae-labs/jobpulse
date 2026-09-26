import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '../locales/en/translation.json';
import ptBR from '../locales/pt-BR/translation.json';

export const defaultNS = 'translation' as const;

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
] as const;

export type SupportedLanguageCode = typeof supportedLanguages[number]['code'];

export function toDocumentLanguage(language: string | undefined): SupportedLanguageCode {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export const resources = {
  en: {
    translation: en,
  },
  'pt-BR': {
    translation: ptBR,
  },
  pt: {
    translation: ptBR,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'pt-BR', 'pt'],
    nonExplicitSupportedLngs: true,
    defaultNS,
    resources,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'jobpulse_lng',
    },
  });

i18n.on('languageChanged', (language) => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = toDocumentLanguage(language);
  document.documentElement.dir = 'ltr';
});

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const nfCache = new Map<string, Intl.NumberFormat>();

function getCachedDateTimeFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${options ? JSON.stringify(options) : ''}`;
  let formatter = dtfCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dtfCache.set(key, formatter);
  }
  return formatter;
}

function getCachedNumberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${options ? JSON.stringify(options) : ''}`;
  let formatter = nfCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    nfCache.set(key, formatter);
  }
  return formatter;
}

export function formatDate(
  date: string | number | Date,
  lng?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return getCachedDateTimeFormat(toDocumentLanguage(lng || i18n.language), options).format(d);
}

export function formatNumber(
  value: number,
  lng?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return getCachedNumberFormat(toDocumentLanguage(lng || i18n.language), options).format(value);
}

export default i18n;
