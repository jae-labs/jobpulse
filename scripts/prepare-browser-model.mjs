/** Stage pinned MiniLM and ONNX Runtime assets for same-origin browser inference. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, copyFile, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const model = 'Xenova/all-MiniLM-L6-v2';
const modelFiles = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0', // gitleaks:allow - public file checksum
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', // gitleaks:allow - public file checksum
  'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3', // gitleaks:allow - public file checksum
  'vocab.txt': '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};
const wasmFiles = {
  'ort-wasm-simd-threaded.mjs': 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f',
  'ort-wasm-simd-threaded.wasm': '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3',
};

const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

async function isValid(path, expected) {
  try { return checksum(await readFile(path)) === expected; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function stageModel(name, expected) {
  const target = join(root, 'public', 'models', model, name);
  if (await isValid(target, expected)) return;
  const url = `https://huggingface.co/${model}/resolve/${revision}/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not fetch pinned model asset ${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (checksum(bytes) !== expected) throw new Error(`Model asset checksum mismatch: ${name}`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  try { await writeFile(temporary, bytes); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
}

async function stageWasm(name, expected, packageRoot) {
  const target = join(root, 'public', 'wasm', name);
  if (await isValid(target, expected)) return;
  const source = join(packageRoot, 'dist', name);
  if (!(await isValid(source, expected))) throw new Error(`Installed ONNX Runtime asset mismatch: ${name}`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

const transformerRoot = await realpath(resolve(root, 'node_modules/@huggingface/transformers'));
const transformerRequire = createRequire(join(transformerRoot, 'package.json'));
const packageRoot = resolve(dirname(transformerRequire.resolve('onnxruntime-web')), '..');
const installed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
if (installed.version !== '1.31.0-dev.20260914-8d85527a0') throw new Error('Unexpected ONNX Runtime version');
const transformer = JSON.parse(await readFile(join(transformerRoot, 'package.json'), 'utf8'));
if (transformer.version !== '4.3.0') throw new Error('Unexpected Transformers.js version');
// Remove superseded runtime files so old vulnerable assets are not deployed.
await rm(join(root, 'public/wasm'), { recursive: true, force: true });
await Promise.all([
  ...Object.entries(modelFiles).map(([name, hash]) => stageModel(name, hash)),
  ...Object.entries(wasmFiles).map(([name, hash]) => stageWasm(name, hash, packageRoot)),
]);
console.log('Pinned browser model and WASM assets are ready.');
