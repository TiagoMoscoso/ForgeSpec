import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repoSkillFiles } from '../../src/skills/generate-repo-files.js';
import { VERSION } from '../../src/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

describe('repository-visible skill files stay in sync with canonical templates', () => {
  it('matches every checked-in skills/**/SKILL.md byte for byte', async () => {
    const files = repoSkillFiles(VERSION);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const absolute = path.join(repoRoot, file.relativePath);
      const onDisk = await readFile(absolute, 'utf8').catch(() => {
        throw new Error(
          `Missing checked-in file ${file.relativePath}. Run \`pnpm run generate:skills\`.`,
        );
      });
      expect(onDisk, `${file.relativePath} is out of date. Run \`pnpm run generate:skills\`.`).toBe(
        file.contents,
      );
    }
  });
});
