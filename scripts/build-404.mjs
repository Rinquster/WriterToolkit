import { copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const indexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const fallbackPath = fileURLToPath(new URL('../dist/404.html', import.meta.url));
const noJekyllPath = fileURLToPath(new URL('../dist/.nojekyll', import.meta.url));

await Promise.all([copyFile(indexPath, fallbackPath), writeFile(noJekyllPath, '')]);
process.stdout.write('Created dist/404.html SPA fallback and dist/.nojekyll\n');
