// Generate both model sets before atomically publishing complete files.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePythonModels } from './normalize-python-models.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function command(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.error?.message ?? result.status}`);
  return result.stdout;
}
mkdirSync(join(root, '.backups'), { recursive: true });
const directory = mkdtempSync(join(root, '.backups', 'typegen-'));
try {
  const typescript = command('supabase', ['gen', 'types', 'typescript', '--local']);
  const python = command('supabase', ['gen', 'types', '--lang=python', '--local']);
  if (!typescript.includes('export type Database') || !python.includes('class PublicJobs(')) {
    throw new Error('Database generation returned incomplete models; existing files remain intact');
  }
  const stagedTs = join(directory, 'database.types.ts');
  const stagedPython = join(directory, 'models.py');
  writeFileSync(stagedTs, typescript);
  writeFileSync(stagedPython, normalizePythonModels(python));
  command('uv', ['run', '--project', 'services/scraper', '--locked', 'ruff', 'format', '--config', 'services/scraper/pyproject.toml', stagedPython]);
  if (!readFileSync(stagedPython, 'utf8').includes('class PublicJobs(')) throw new Error('Formatted models are incomplete');
  renameSync(stagedTs, join(root, 'src/types/database.types.ts'));
  renameSync(stagedPython, join(root, 'services/scraper/src/jobpulse_scraper/database/models.py'));
  console.log('Published complete TypeScript and Python database models.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
