import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from '../../src/application/init.js';
import {
  archiveTask,
  closeChange,
  execFinish,
  execStart,
  forgeChange,
  proposeSeal,
  queryStatus,
} from '../../src/application/commands.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { Codes } from '../../src/domain/validation/codes.js';
import {
  SAMPLE_CHANGE,
  SAMPLE_PLAN,
  TEST_CONFIG,
  tempDir,
  writeChangeFixture,
} from '../helpers/fixture.js';
import { stringify as stringifyYaml } from 'yaml';

describe('init and workflow', () => {
  it('init is idempotent for config.yaml', async () => {
    const root = await tempDir();
    const first = await initProject(root, ['cursor']);
    expect(first.created).toContain('forgespec/config.yaml');
    const second = await initProject(root, ['cursor']);
    expect(second.skipped).toContain('forgespec/config.yaml');
  });

  it('seals, forges, executes, archives, and closes', async () => {
    const root = await tempDir();
    await writeChangeFixture(root);
    await proposeSeal(root, 'add-token-validator');
    const forged = await forgeChange(root, 'add-token-validator');
    expect(forged.waves[0]).toContain('T01');
    const status = await queryStatus(root, 'add-token-validator');
    expect(status.states.T01).toBe('READY');
    await execStart(root, root, 'add-token-validator', 'T01');
    await expect(execStart(root, root, 'add-token-validator', 'T01')).rejects.toBeInstanceOf(
      ForgeError,
    );
    await execFinish(root, root, 'add-token-validator', 'T01');
    await archiveTask(root, root, 'add-token-validator', 'T01');
    await mkdir(path.join(root, 'forgespec', 'specs', 'auth'), { recursive: true });
    await writeFile(
      path.join(root, 'forgespec', 'specs', 'auth', 'spec.md'),
      '# Auth\n\nREQ-AUTH-001 is implemented.\n',
      'utf8',
    );
    const closed = await closeChange(root, 'add-token-validator');
    expect(closed.archivedTo).toContain('add-token-validator');
  });

  it('rejects uncovered plans at forge time', async () => {
    const root = await tempDir();
    await writeChangeFixture(root);
    await proposeSeal(root, 'add-token-validator');
    await writeFile(
      path.join(root, 'forgespec', 'changes', 'add-token-validator', 'plan.yaml'),
      stringifyYaml({
        ...SAMPLE_PLAN,
        tasks: [
          { ...SAMPLE_PLAN.tasks[0], requirements: [], kind: 'docs', title: 'Write docs only' },
        ],
      }),
      'utf8',
    );
    try {
      await forgeChange(root, 'add-token-validator');
      throw new Error('expected uncovered');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.PLAN_UNCOVERED);
    }
  });

  it('fails archive without evidence', async () => {
    const root = await tempDir();
    await writeChangeFixture(root);
    await proposeSeal(root, 'add-token-validator');
    await forgeChange(root, 'add-token-validator');
    try {
      await archiveTask(root, root, 'add-token-validator', 'T01');
      throw new Error('expected archive fail');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.ARCHIVE_INCOMPLETE);
    }
  });

  it('writes skills for selected tools', async () => {
    const root = await tempDir();
    const result = await initProject(root, ['claude']);
    expect(result.created.some((file) => file.includes('.claude/skills/forge-explore'))).toBe(true);
    expect(result.created.some((file) => file.includes('.cursor'))).toBe(false);
  });
});

describe('change.md fixture used by parser', () => {
  it('exists', () => {
    expect(SAMPLE_CHANGE).toContain('REQ-AUTH-001');
    expect(TEST_CONFIG).toContain('isolation: none');
  });
});
