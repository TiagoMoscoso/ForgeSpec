import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = path.join(repo, 'bin', 'forgespec.js');
const dist = path.join(repo, 'dist', 'cli', 'index.js');

describe('cli e2e', () => {
  it('prints help and version', () => {
    if (!existsSync(dist)) {
      execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: repo, stdio: 'pipe' });
    }
    const help = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8', cwd: repo });
    expect(help).toContain('forgespec');
    expect(help).toContain('init');
    const version = execFileSync(process.execPath, [bin, '--version'], {
      encoding: 'utf8',
      cwd: repo,
    });
    expect(version.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns JSON errors for missing projects', () => {
    if (!existsSync(dist)) {
      execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: repo, stdio: 'pipe' });
    }
    try {
      execFileSync(process.execPath, [bin, '--json', 'status'], {
        encoding: 'utf8',
        cwd: path.join(repo, 'test'),
      });
      throw new Error('expected failure');
    } catch (error) {
      const err = error as { stdout: string; status: number };
      expect(err.status).toBe(1);
      const payload = JSON.parse(err.stdout) as { ok: boolean; code: string };
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe('FGE103');
    }
  });
});
