import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, matchesGlob } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

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

function sourceReferenceExists(root, path) {
  if (!/[{*?]/.test(path)) return existsSync(resolve(root, path));
  const prefix = path.slice(0, path.search(/[{*?]/));
  const directory = resolve(root, prefix.slice(0, prefix.lastIndexOf('/')) || '.');
  if (!existsSync(directory)) return false;
  const visit = directory => readdirSync(directory, { withFileTypes: true }).some(entry => {
    if (['node_modules', '.git', '.venv', '__pycache__'].includes(entry.name)) return false;
    const candidate = resolve(directory, entry.name);
    return matchesGlob(relative(root, candidate), path.replace(/\/$/, ''))
      || (entry.isDirectory() && visit(candidate));
  });
  return visit(directory);
}

function workflowJobs(root) {
  const workflow = resolve(root, '.github/workflows/ci.yml');
  if (!existsSync(workflow)) return new Map();
  const document = parse(readFileSync(workflow, 'utf8'));
  return new Map(Object.entries(document.jobs ?? {}).map(([id, job]) => [id, job.name ?? id]));
}

// Reference existence is checkable; architectural truth and runtime readiness need review and tests.
export function docReferenceFailures(root, file, text) {
  const failures = [];
  const scripts = new Map();
  const packageFor = filter => {
    if (!filter) return resolve(root, 'package.json');
    const packages = resolve(root, 'packages');
    if (!existsSync(packages)) return undefined;
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      const path = resolve(packages, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).name === filter) return path;
    }
    return undefined;
  };
  for (const match of text.matchAll(/\b(?:npm|pnpm)\s+(?:--filter\s+(\S+)\s+)?run\s+([\w:.-]+)/g)) {
    const manifest = packageFor(match[1]);
    if (!manifest || !existsSync(manifest)) { failures.push(file + ': missing package for ' + match[0]); continue; }
    if (!scripts.has(manifest)) scripts.set(manifest, JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {});
    if (!Object.hasOwn(scripts.get(manifest), match[2])) failures.push(file + ': missing package script ' + match[0]);
  }
  // Inline paths are repository-relative; Markdown links retain document-relative resolution.
  // Environment files are runtime configuration, not maintained source files.
  const sourcePaths = new Set();
  const snippets = [...text.matchAll(/`([^`\n]+)`/g), ...text.matchAll(/(?:```|~~~)[^\n]*\n([\s\S]*?)(?:```|~~~)/g)];
  for (const code of snippets) {
    if (text.slice(code.index + code[0].length).startsWith('](')) continue;
    for (const path of code[1].matchAll(/(?:^|[\s(])((?:src|scripts|supabase|packages|services|\.github)\/[\w./{},*?-]+)/g)) {
      if (!/(?:^|\/)\.env(?:$|\.(?!example$))/.test(path[1])) sourcePaths.add(path[1]);
    }
  }
  for (const path of sourcePaths) {
    if (!sourceReferenceExists(root, path)) failures.push(file + ': missing source path ' + path);
  }
  // CI declarations use a CI job / Name table, with literal workflow IDs and display names.
  let ciTable = false;
  let hasInventory = false;
  const documentedJobs = new Set();
  const jobs = workflowJobs(root);
  for (const line of prose(text).split('\n')) {
    if (!line.startsWith('|')) { ciTable = false; continue; }
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells[0] === 'CI job' && cells[1] === 'Name') { ciTable = true; hasInventory = true; continue; }
    if (!ciTable || cells.every(cell => /^[-: ]+$/.test(cell))) continue;
    const id = cells[0].replace(/`/g, '');
    if (documentedJobs.has(id)) failures.push(file + ': duplicate CI job ' + id);
    documentedJobs.add(id);
    if (!jobs.has(id)) failures.push(file + ': missing CI job ' + id);
    else if (jobs.get(id) !== cells[1]) failures.push(file + ': CI job name mismatch for ' + id);
  }
  if (hasInventory) for (const id of jobs.keys()) {
    if (!documentedJobs.has(id)) failures.push(file + ': undocumented CI job ' + id);
  }
  return failures;
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
    const text = readFileSync(file, 'utf8');
    failures.push(...docReferenceFailures(root, file, text));
    for (const link of localLinks(file, text)) {
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
  process.stdout.write('Verified links, anchors, scripts, source paths, CI declarations and index coverage in ' + files.length + ' Markdown documents.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDocLinks(fileURLToPath(new URL('../', import.meta.url)));
}
