// Regenerates the repository-visible skill files under `skills/` from the
// built canonical templates in `src/skills/**`. Run `pnpm run build` first
// (the `generate:skills` package.json script does this for you).
//
// This keeps `skills/**` as a discoverable, human-browsable copy of the
// canonical TypeScript source. `test/unit/skill-repo-parity.test.ts` fails
// CI if the two ever drift.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSkillFiles } from '../dist/skills/generate-repo-files.js';
import { VERSION } from '../dist/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const files = repoSkillFiles(VERSION);
for (const file of files) {
  const absolute = path.join(root, file.relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, file.contents, 'utf8');
}

console.log(`Wrote ${files.length} skill file(s) under skills/.`);
