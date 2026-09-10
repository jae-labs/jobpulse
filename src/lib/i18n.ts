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

export function formatDate(
  date: string | number | Date,
  lng?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(toDocumentLanguage(lng || i18n.language), options).format(d);
}

export function formatNumber(
  value: number,
  lng?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toDocumentLanguage(lng || i18n.language), options).format(value);
}

export default i18n;
