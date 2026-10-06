import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../packages/ui/src/tokens.css', import.meta.url), 'utf8');
const root = source.match(/:root\s*\{([^}]*)\}/s)?.[1];
const theme = source.match(/@theme\s+inline\s*\{([^}]*)\}/s)?.[1];

if (!root || !theme) {
  throw new Error('UI tokens require :root values and an @theme inline mapping.');
}

function declarations(block) {
  const result = new Map();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (result.has(name)) throw new Error(`Duplicate UI token: ${name}`);
    result.set(name, value.trim());
  }
  return result;
}

const values = declarations(root);
const utilities = declarations(theme);

for (const [name, value] of [...values, ...utilities]) {
  for (const reference of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    if (name === reference[1]) throw new Error(`Self-referencing UI token: ${name}`);
    if (!values.has(reference[1])) throw new Error(`Undefined UI token ${reference[1]} referenced by ${name}`);
  }
}

for (const [name, value] of utilities) {
  if (!value.startsWith('var(--ds-')) throw new Error(`UI utility ${name} must map to a semantic token.`);
}
