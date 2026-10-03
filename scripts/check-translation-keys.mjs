import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function hasTranslation(bundle, key) {
  const value = key.split('.').reduce((row, field) => row?.[field], bundle);
  if (typeof value === 'string') return true;
  return ['_one', '_other'].every(suffix => typeof (key + suffix).split('.').reduce((row, field) => row?.[field], bundle) === 'string');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const bundles = ['en', 'pt-BR'].map(language => [language, JSON.parse(readFileSync(`${root}/src/locales/${language}/translation.json`, 'utf8'))]);
  let failures = 0;
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { scan(path); continue; }
      if (!/\.tsx?$/.test(path) || path.includes('.test.')) continue;
      const tree = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node) && /^(t|i18n\.t)$/.test(node.expression.getText(tree)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          for (const [language, bundle] of bundles) if (!hasTranslation(bundle, key)) {
            console.error(`${path}: ${key} must resolve to localized text in ${language}`);
            failures++;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  scan(`${root}/src`);
  if (failures) process.exitCode = 1;
  else console.log('Static translation keys resolve to text in both languages.');
}
