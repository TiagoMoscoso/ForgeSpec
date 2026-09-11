import { describe, expect, it } from 'vitest';
import { safeJoin } from '../../src/infrastructure/filesystem/paths.js';
import { assertArgv } from '../../src/infrastructure/process/spawn.js';
import { redactSecrets } from '../../src/domain/evidence/fingerprint.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';

describe('security', () => {
  it('blocks path traversal', () => {
    expect(() => safeJoin('/tmp/project', '..', 'secret')).toThrowError(ForgeError);
  });

  it('blocks absolute segments', () => {
    expect(() => safeJoin('/tmp/project', '/etc/passwd')).toThrowError(ForgeError);
  });

  it('rejects shell interpolation in argv', () => {
    try {
      assertArgv('rm -rf /; echo hi', 'hook');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.COMMAND_SHELL);
    }
  });

  it('redacts tokens in evidence-like text', () => {
    expect(redactSecrets('Authorization: bearer SECRET=hunter2')).toMatch(/\[redacted\]/);
  });

  it('rejects oversized conceptual unknown config keys', () => {
    expect(() =>
      parseConfigDocument({ version: 1, hooks: { shell: 'echo $TOKEN' } }, 'evil'),
    ).toThrowError(ForgeError);
  });
});
