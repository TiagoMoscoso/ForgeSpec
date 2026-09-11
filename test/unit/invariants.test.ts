import { describe, expect, it } from 'vitest';
import { globMatches, globsOverlap } from '../../src/domain/task-graph/globs.js';
import { assertPathWithin, safeJoin } from '../../src/infrastructure/filesystem/paths.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { redactSecrets } from '../../src/domain/evidence/fingerprint.js';
import { fingerprintFiles } from '../../src/domain/evidence/fingerprint.js';
import { isEvidenceFresh } from '../../src/domain/evidence/types.js';
import { assertArgv } from '../../src/infrastructure/process/spawn.js';
import { workspaceMatches } from '../../src/domain/workspace/policy.js';
import { assertTestCreationPolicy } from '../../src/domain/policy/tests.js';
import { SAMPLE_PLAN } from '../helpers/fixture.js';

describe('globs', () => {
  it('matches brace test globs', () => {
    expect(globMatches('**/*.{test,spec}.ts', 'src/foo.test.ts')).toBe(true);
    expect(globMatches('src/auth/**', 'src/auth/token.ts')).toBe(true);
  });

  it('detects overlapping prefixes', () => {
    expect(globsOverlap('src/auth/**', 'src/auth/token.ts')).toBe(true);
  });
});

describe('paths', () => {
  it('rejects traversal', () => {
    expect(() => safeJoin('/proj', '../etc/passwd')).toThrowError(ForgeError);
    try {
      assertPathWithin('/proj', '/etc/passwd');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.PATH_ESCAPE);
    }
  });

  it('allows in-root paths', () => {
    expect(safeJoin('/proj', 'forgespec', 'config.yaml')).toBe('/proj/forgespec/config.yaml');
  });
});

describe('secrets and evidence', () => {
  it('redacts secret-like assignments', () => {
    expect(redactSecrets('TOKEN=abc')).toContain('[redacted]');
  });

  it('treats mismatched fingerprints as stale', () => {
    expect(isEvidenceFresh({ fingerprint: 'a', plan_hash: 'p' }, 'b', 'p')).toBe(false);
    expect(isEvidenceFresh({ fingerprint: 'a', plan_hash: 'p' }, 'a', 'p')).toBe(true);
  });

  it('fingerprints are order-insensitive', () => {
    const a = fingerprintFiles([
      { path: 'b', content: '2' },
      { path: 'a', content: '1' },
    ]);
    const b = fingerprintFiles([
      { path: 'a', content: '1' },
      { path: 'b', content: '2' },
    ]);
    expect(a).toBe(b);
  });
});

describe('spawn argv', () => {
  it('rejects shell strings', () => {
    expect(() => assertArgv('echo $(whoami)', 'config')).toThrowError(ForgeError);
  });

  it('accepts argv arrays', () => {
    expect(assertArgv(['node', '-e', '1'], 'config')).toEqual(['node', '-e', '1']);
  });
});

describe('workspace policy', () => {
  it('skips checks when isolation is none', () => {
    expect(workspaceMatches('none', undefined, { branch: 'main', worktree: '/tmp/a' }).ok).toBe(
      true,
    );
  });

  it('fails when branch mismatches', () => {
    const result = workspaceMatches(
      'branch-per-change',
      { isolation: 'branch-per-change', branch: 'forgespec/x', worktree: '/tmp/a' },
      { branch: 'main', worktree: '/tmp/a' },
    );
    expect(result.ok).toBe(false);
  });
});

describe('test creation policy', () => {
  it('requires new tests when policy is required', () => {
    expect(() =>
      assertTestCreationPolicy({
        creation: 'required',
        focused_execution: 'optional',
        testGlobs: ['**/*.test.ts'],
        filesAtStart: ['src/a.ts'],
        filesAtFinish: ['src/a.ts'],
        task: SAMPLE_PLAN.tasks[0]!,
        mandatoryRequirementCount: 1,
      }),
    ).toThrowError(ForgeError);
  });

  it('forbids new tests when configured', () => {
    expect(() =>
      assertTestCreationPolicy({
        creation: 'forbidden',
        focused_execution: 'optional',
        testGlobs: ['**/*.test.ts'],
        filesAtStart: ['src/a.ts'],
        filesAtFinish: ['src/a.ts', 'src/a.test.ts'],
        task: SAMPLE_PLAN.tasks[0]!,
        mandatoryRequirementCount: 1,
      }),
    ).toThrowError(ForgeError);
  });
});
