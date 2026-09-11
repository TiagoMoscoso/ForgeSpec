import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('packaging', () => {
  it('packs dist, bin, license, and readme without tests or secrets', async () => {
    execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: repo, stdio: 'pipe' });
    const dir = await mkdtemp(path.join(os.tmpdir(), 'forgespec-pack-'));
    execFileSync('pnpm', ['pack', '--pack-destination', dir], { cwd: repo, stdio: 'pipe' });
    const files = await readdir(dir);
    const tarball = files.find((file) => file.endsWith('.tgz'));
    expect(tarball).toBeDefined();
    const listing = execFileSync('tar', ['-tzf', path.join(dir, tarball!)], { encoding: 'utf8' });
    expect(listing).toContain('package/bin/forgespec.js');
    expect(listing).toContain('package/dist/cli/index.js');
    expect(listing).toContain('package/LICENSE');
    expect(listing).toContain('package/README.md');
    expect(listing).not.toContain('package/test/');
    expect(listing).not.toContain('.env');
    expect(listing).not.toContain('forgespec_grok_plan_prompt.md');
    await rm(dir, { recursive: true, force: true });
  });
});
