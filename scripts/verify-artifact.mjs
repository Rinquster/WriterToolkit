import { access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distPath = fileURLToPath(new URL('../dist/', import.meta.url));
const requiredFiles = ['index.html', '404.html', '.nojekyll', 'fonts/LICENSE.txt'];

await Promise.all(
  requiredFiles.map((fileName) => access(new URL(fileName, `file://${distPath}/`))),
);

const entries = await readdir(distPath, { recursive: true });
const forbiddenFragments = ['old_frozen', 'fixtures/private', 'chapter19', 'schoons'];

for (const entry of entries) {
  if (forbiddenFragments.some((fragment) => entry.includes(fragment))) {
    throw new Error(`Forbidden file found in production artifact: ${entry}`);
  }
}

process.stdout.write(`Verified production artifact (${entries.length} entries)\n`);
