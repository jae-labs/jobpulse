import { readFileSync, readdirSync } from 'node:fs';

const chartDir = new URL('../src/components/charts/', import.meta.url);
const hintPattern = /\b(?:click|tap)\s+to\s+view\b|\bclick\s+any\b[^\n]*\bto\s+filter\b|\bclique\s+para\s+ver\b|\bclique\b[^\n]*\bpara\s+filtrar\b/i;

for (const filename of readdirSync(chartDir).filter((name) => name.endsWith('.tsx'))) {
  const source = readFileSync(new URL(filename, chartDir), 'utf8');
  if (/clickToView/.test(source) || hintPattern.test(source)) {
    throw new Error(`${filename}: chart tooltips should show data without click instructions.`);
  }
}

function checkChartStrings(value, path) {
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.${key}`;
    if (key === 'clickToView' || (typeof entry === 'string' && hintPattern.test(entry))) {
      throw new Error(`${entryPath}: chart copy should not repeat click instructions.`);
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      checkChartStrings(entry, entryPath);
    }
  }
}

for (const locale of ['en', 'pt-BR']) {
  const url = new URL(`../src/locales/${locale}/translation.json`, import.meta.url);
  const translations = JSON.parse(readFileSync(url, 'utf8'));
  checkChartStrings(translations.charts, `${locale}.charts`);
}
