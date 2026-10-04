import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function localLinkTargets(file, text) {
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  return [...withoutCode.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map(match => match[1].replace(/^<|>$/g, '').split('#')[0])
    .filter(target => target && !/^[a-z][a-z\d+.-]*:/i.test(target))
    .map(target => resolve(dirname(file), decodeURIComponent(target)));
}

export function checkDocLinks(root) {
  const files = ['README.md', 'AGENTS.md'].map(file => resolve(root, file));
  const collectMarkdown = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) collectMarkdown(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    }
  };
  for (const directory of ['docs', 'packages/ui', 'services/scraper']) collectMarkdown(resolve(root, directory));
  const failures = files.flatMap(file => localLinkTargets(file, readFileSync(file, 'utf8'))
    .filter(target => !existsSync(target)).map(target => `${file}: missing ${target}`));
  if (failures.length) throw new Error(failures.join('\n'));
  process.stdout.write(`Verified local links in ${files.length} Markdown documents.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDocLinks(fileURLToPath(new URL('../', import.meta.url)));
}
