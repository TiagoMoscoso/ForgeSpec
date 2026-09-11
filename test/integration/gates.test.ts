import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  archiveTask,
  closeChange,
  execFinish,
  execStart,
  forgeChange,
  proposeSeal,
} from '../../src/application/commands.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { tempDir, writeChangeFixture } from '../helpers/fixture.js';

async function forgedFixture() {
  const root = await tempDir();
  await writeChangeFixture(root);
  await proposeSeal(root, 'add-token-validator');
  await forgeChange(root, 'add-token-validator');
  return root;
}

describe('gates and recovery', () => {
  it('detects stale evidence after code changes', async () => {
    const root = await forgedFixture();
    await execStart(root, root, 'add-token-validator', 'T01');
    await execFinish(root, root, 'add-token-validator', 'T01');
    await writeFile(
      path.join(root, 'src', 'auth', 'validator.ts'),
      'export const ok = false;\n',
      'utf8',
    );
    try {
      await archiveTask(root, root, 'add-token-validator', 'T01');
      throw new Error('expected stale');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.EVIDENCE_STALE);
    }
  });

  it('rejects close when requirement ids are missing from specs', async () => {
    const root = await forgedFixture();
    await execStart(root, root, 'add-token-validator', 'T01');
    await execFinish(root, root, 'add-token-validator', 'T01');
    await archiveTask(root, root, 'add-token-validator', 'T01');
    try {
      await closeChange(root, 'add-token-validator');
      throw new Error('expected req loss');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.CLOSE_REQ_LOSS);
    }
  });

  it('accepts an auditable waiver for a semantic validator', async () => {
    const root = await tempDir();
    await writeChangeFixture(root);
    await writeFile(
      path.join(root, 'forgespec', 'config.yaml'),
      `version: 1
project:
  validator_commands:
    build:
      argv: ["node", "-e", "process.exit(0)"]
workflow:
  exec:
    tests:
      creation: optional
      focused_execution: optional
    validators:
      - dependency-state
  archive:
    validators:
      - code-review
    action:
      type: none
git:
  isolation: none
`,
      'utf8',
    );
    await proposeSeal(root, 'add-token-validator');
    await forgeChange(root, 'add-token-validator');
    await execStart(root, root, 'add-token-validator', 'T01');
    await execFinish(root, root, 'add-token-validator', 'T01');
    await archiveTask(root, root, 'add-token-validator', 'T01', {
      validator: 'code-review',
      reason: 'lab environment unavailable',
    });
  });

  it('blocks exec in the wrong branch when isolation is enabled', async () => {
    const root = await forgedFixture();
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'],
      {
        cwd: root,
      },
    );
    await writeFile(
      path.join(root, 'forgespec', 'config.yaml'),
      `version: 1
workflow:
  exec:
    tests:
      creation: optional
      focused_execution: optional
    validators:
      - dependency-state
  archive:
    validators:
      - dependency-state
    action:
      type: none
git:
  isolation: branch-per-change
  branch_pattern: forgespec/<change-id>
`,
      'utf8',
    );
    try {
      await execStart(root, root, 'add-token-validator', 'T01');
      throw new Error('expected workspace mismatch');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.WORKSPACE_MISMATCH);
    }
  });
});
