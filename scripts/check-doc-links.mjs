import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const prose = text => text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');

function localLinks(file, text) {
  return [...prose(text).matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map(match => match[1].replace(/^<|>$/g, ''))
    .filter(target => !/^[a-z][a-z\d+.-]*:/i.test(target))
    .map(target => {
      const [path, anchor] = target.split('#');
      return { path: path ? resolve(dirname(file), decodeURIComponent(path)) : file,
        anchor: anchor ? decodeURIComponent(anchor) : undefined, sameFile: !path };
    });
}

export function localLinkTargets(file, text) {
  return localLinks(file, text).filter(link => !link.sameFile).map(link => link.path);
}

export function markdownAnchors(text) {
  const anchors = new Set();
  const counts = new Map();
  for (const match of prose(text).matchAll(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/gm)) {
    const slug = match[1].toLowerCase().replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    anchors.add(count ? slug + '-' + count : slug);
    counts.set(slug, count + 1);
  }
  for (const match of prose(text).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1]);
  return anchors;
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
  const failures = [];
  for (const file of files) {
    for (const link of localLinks(file, readFileSync(file, 'utf8'))) {
      if (!existsSync(link.path)) failures.push(file + ': missing ' + link.path);
      else if (link.anchor && link.path.endsWith('.md')
        && !markdownAnchors(readFileSync(link.path, 'utf8')).has(link.anchor)) {
        failures.push(file + ': missing anchor ' + link.path + '#' + link.anchor);
      }
    }
  }
  const index = resolve(root, 'docs/README.md');
  const indexText = readFileSync(index, 'utf8');
  // Only complete metadata rows count as an indexed maintained guide.
  const indexed = new Set(indexText.split('\n').filter(line => {
    const cells = line.split('|').slice(1, -1);
    return cells.length === 4 && cells.every(cell => cell.trim());
  }).flatMap(line => localLinkTargets(index, line)));
  for (const file of files.slice(2)) {
    if (file !== index && !indexed.has(file)) failures.push(file + ': missing documentation index metadata');
  }
  if (failures.length) throw new Error(failures.join('\n'));
  process.stdout.write('Verified links, anchors and index coverage in ' + files.length + ' Markdown documents.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDocLinks(fileURLToPath(new URL('../', import.meta.url)));
}
