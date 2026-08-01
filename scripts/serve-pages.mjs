import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const basePath = '/WriterToolkit/';
const distPath = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);

function sendFile(response, filePath, statusCode = 200) {
  response.writeHead(statusCode, {
    'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);

  if (requestUrl.pathname === '/') {
    response.writeHead(302, { Location: basePath });
    response.end();
    return;
  }

  if (!requestUrl.pathname.startsWith(basePath)) {
    sendFile(response, resolve(distPath, '404.html'), 404);
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(requestUrl.pathname.slice(basePath.length));
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  if (!relativePath) {
    sendFile(response, resolve(distPath, 'index.html'));
    return;
  }

  const requestedFile = resolve(distPath, relativePath);
  const isInsideDist =
    requestedFile === distPath || requestedFile.startsWith(`${distPath}${sep}`);

  if (isInsideDist && (await isFile(requestedFile))) {
    sendFile(response, requestedFile);
    return;
  }

  sendFile(response, resolve(distPath, '404.html'), 404);
});

server.listen(port, host, () => {
  process.stdout.write(`Pages-like server: http://${host}:${port}${basePath}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
