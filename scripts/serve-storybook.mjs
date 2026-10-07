import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../storybook-static/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)}`);
    if (path !== resolve(root) && !path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    const file = path === resolve(root) ? resolve(root, 'index.html') : path;
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
server.listen(6007, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
