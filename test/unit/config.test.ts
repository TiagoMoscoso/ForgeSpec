import { describe, expect, it } from 'vitest';
import {
  parseConfigDocument,
  deepMerge,
  assertOverlayAllowlist,
} from '../../src/infrastructure/config/schema.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';

describe('config', () => {
  it('parses version 1 defaults', () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    expect(config.workflow.exec.one_task_per_run).toBe(true);
    expect(config.git.isolation).toBe('none');
  });

  it('rejects turning off one_task_per_run', () => {
    expect(() =>
      parseConfigDocument(
        { version: 1, workflow: { exec: { one_task_per_run: false } } },
        'memory',
      ),
    ).toThrowError(ForgeError);
    try {
      parseConfigDocument(
        { version: 1, workflow: { exec: { one_task_per_run: false } } },
        'memory',
      );
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.CONFIG_INVARIANT);
    }
  });

  it('rejects unknown keys', () => {
    expect(() => parseConfigDocument({ version: 1, extra: true }, 'memory')).toThrowError(
      ForgeError,
    );
  });

  it('rejects disallowed overlay keys', () => {
    expect(() =>
      assertOverlayAllowlist({ git: { isolation: 'worktree-per-change' } }, 'overlay'),
    ).toThrowError(ForgeError);
  });

  it('merges overlay tests policy', () => {
    const base = parseConfigDocument({ version: 1 }, 'base');
    const merged = parseConfigDocument(
      deepMerge(base, { workflow: { exec: { tests: { creation: 'optional' } } } }),
      'overlay',
    );
    expect(merged.workflow.exec.tests.creation).toBe('optional');
    expect(merged.workflow.exec.one_task_per_run).toBe(true);
  });
});
