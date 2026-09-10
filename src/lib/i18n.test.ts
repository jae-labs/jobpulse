import { describe, it, expect } from 'vitest';
import i18n, { resources, supportedLanguages, formatDate, formatNumber } from './i18n';

function leafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafKeys(child, path) : [path];
  });
}

describe('i18n Internationalization', () => {
  it('registers supported languages with English and Brazilian Portuguese', () => {
    expect(supportedLanguages.map((l) => l.code)).toEqual(['en', 'pt-BR']);
    expect(supportedLanguages.find((l) => l.code === 'pt-BR')?.flag).toBe('🇧🇷');
  });

  it('translates navigation and common keys in English by default', () => {
    void i18n.changeLanguage('en');
    expect(i18n.t('nav.opportunities')).toBe('Opportunities');
    expect(i18n.t('common.apply')).toBe('Apply');
    expect(i18n.t('status.new')).toBe('New');
    expect(i18n.t('sources.portalTitle')).toBe('Data Sources & Career Portals');
    expect(i18n.t('jobs.layoutSplit')).toBe('Split');
    expect(i18n.t('jobs.layoutList')).toBe('List');
    expect(i18n.t('charts.categoryBreakdown.title')).toBe('Job Distribution');
    expect(i18n.t('charts.categoryBreakdown.subtitle', { count: 21 })).toBe('Breakdown across 21 categories');
  });

  it('translates keys correctly when switching to Brazilian Portuguese (pt-BR)', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('nav.opportunities')).toBe('Oportunidades');
    expect(i18n.t('common.apply')).toBe('Candidatar-se');
    expect(i18n.t('status.new')).toBe('Novo');
    expect(i18n.t('status.applied')).toBe('Candidatou-se');
    expect(i18n.t('sources.portalTitle')).toBe('Fontes de Dados & Portais de Carreiras');
    expect(i18n.t('jobs.layoutSplit')).toBe('Dividido');
    expect(i18n.t('jobs.layoutList')).toBe('Lista');
    expect(i18n.t('charts.categoryBreakdown.title')).toBe('Distribuição de Vagas');
    expect(i18n.t('charts.categoryBreakdown.subtitle', { count: 21 })).toBe('Distribuição em 21 categorias');
    // Switch back to English for other tests
    await i18n.changeLanguage('en');
  });

  it('keeps translation bundles structurally aligned and updates the document language', async () => {
    expect(leafKeys(resources.en.translation).sort()).toEqual(leafKeys(resources['pt-BR'].translation).sort());

    await i18n.changeLanguage('pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');

    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('formats dates and numbers according to locale (l10n)', () => {
    const testDate = new Date(2026, 8, 10); // Sept 10, 2026
    const formattedEn = formatDate(testDate, 'en');
    const formattedPtBR = formatDate(testDate, 'pt-BR');
    expect(formattedEn).toBeTruthy();
    expect(formattedPtBR).toBe('10/09/2026');

    const formattedNumPtBR = formatNumber(8478, 'pt-BR');
    // In Brazilian Portuguese, thousands separator is a dot (.)
    expect(formattedNumPtBR).toBe('8.478');
  });
});
