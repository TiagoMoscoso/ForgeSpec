import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChangeMarkdown } from '../../src/domain/change/parse.js';
import { assertSealable } from '../../src/domain/change/seal.js';
import { SAMPLE_CHANGE, SAMPLE_PLAN, tempDir, writeChangeFixture } from '../helpers/fixture.js';
import { printResult } from '../../src/cli/output.js';
import { runCli } from '../../src/cli/program.js';
import { requireProjectFile } from '../../src/infrastructure/filesystem/realpath.js';
import { runArgv, assertArgv } from '../../src/infrastructure/process/spawn.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { workspaceMatches } from '../../src/domain/workspace/policy.js';
import { lockExpired, type TaskLock } from '../../src/infrastructure/runtime/store.js';
import { globsOverlap } from '../../src/domain/task-graph/globs.js';
import { defaultConfigYaml } from '../../src/infrastructure/config/schema.js';
import { tasksConflict } from '../../src/domain/task-graph/graph.js';
import { assertTestCreationPolicy } from '../../src/domain/policy/tests.js';
import { redactEnv } from '../../src/domain/evidence/fingerprint.js';

async function withCwd(dir: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await fn();
  } finally {
    process.chdir(prev);
    process.exitCode = 0;
  }
}

async function capture(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const stdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  const stderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await fn();
    return chunks.join('');
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

describe('branch and leftover paths', () => {
  it('covers remaining parser and seal errors', () => {
    expect(() => parseChangeMarkdown('---\nid: BAD\ntitle: x\n---\n# Intent\n')).toThrowError(
      ForgeError,
    );
    expect(() =>
      parseChangeMarkdown('---\nid: ok-id\ntitle: x\n---\n# Intent\nI\n# Scope\nS\n'),
    ).toThrowError(ForgeError);
    const change = parseChangeMarkdown(SAMPLE_CHANGE);
    const broken = { ...change, intent: '' };
    expect(() => assertSealable(broken)).toThrowError(ForgeError);
    const noscope = { ...change, intent: 'x', scope: '' };
    expect(() => assertSealable(noscope)).toThrowError(ForgeError);
    const noAccept = {
      ...change,
      requirements: [{ ...change.requirements[0]!, acceptance: [] }],
    };
    expect(() => assertSealable(noAccept)).toThrowError(ForgeError);
    const noText = {
      ...change,
      requirements: [{ ...change.requirements[0]!, text: '' }],
    };
    expect(() => assertSealable(noText)).toThrowError(ForgeError);
  });

  it('covers CLI reset, cancel, unknown skill, waiver reason, replan', async () => {
    const changeDir = await writeChangeFixture(await tempDir());
    const root = path.resolve(changeDir, '../../..');
    await withCwd(root, async () => {
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'propose',
          'seal',
          '--change',
          'add-token-validator',
        ]),
      );
      await capture(() =>
        runCli(['node', 'forgespec', '--json', 'forge', '--change', 'add-token-validator']),
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'exec',
          'start',
          'T01',
          '--change',
          'add-token-validator',
        ]),
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'exec',
          'reset',
          'T01',
          '--reason',
          'need to stop',
          '--change',
          'add-token-validator',
        ]),
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'task',
          'cancel',
          'T01',
          '--reason',
          'scope removed',
          '--change',
          'add-token-validator',
        ]),
      );
      const skill = await capture(() => runCli(['node', 'forgespec', '--json', 'skill', 'nope']));
      expect(skill).toContain('FGE101');
      const waiver = await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'archive',
          'T01',
          '--change',
          'add-token-validator',
          '--waiver',
          'build',
        ]),
      );
      expect(waiver).toContain('Waiver requires');
      await writeFile(
        path.join(root, 'forgespec', 'changes', 'add-token-validator', 'plan.yaml'),
        `version: 1
change_id: add-token-validator
tasks:
  - id: T01
    title: Implement token validator
    kind: implement
    requirements: [REQ-AUTH-001]
    depends_on: []
    acceptance: ["rejects expired tokens"]
    validators: [dependency-state]
    touches: ["src/auth/**"]
    locks: []
    prerequisites: []
`,
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'forge',
          '--change',
          'add-token-validator',
          '--replan',
        ]),
      );
    });
  });

  it('covers spawn timeout, realpath helper, workspace worktree mismatch, glob overlap, lock expiry', async () => {
    printResult(true, [1, 2]);
    expect(defaultConfigYaml()).toContain('version: 1');
    expect(globsOverlap('**', 'src/a.ts')).toBe(true);
    expect(
      workspaceMatches(
        'worktree-per-change',
        { isolation: 'worktree-per-change', branch: 'forgespec/x', worktree: '/tmp/a' },
        { branch: 'forgespec/x', worktree: '/tmp/b' },
      ).ok,
    ).toBe(false);
    expect(
      workspaceMatches('branch-per-change', undefined, { branch: 'x', worktree: '/t' }).ok,
    ).toBe(false);
    const lock: TaskLock = {
      taskId: 'T01',
      pid: 1,
      hostname: 'h',
      worktree: '/t',
      acquiredAt: new Date(0).toISOString(),
      expiresAt: new Date(0).toISOString(),
      filesAtStart: [],
    };
    expect(lockExpired(lock, Date.now())).toBe(true);
    const root = await tempDir();
    await writeFile(path.join(root, 'f.txt'), 'x', 'utf8');
    expect(requireProjectFile(root, 'f.txt', 'file')).toContain('f.txt');
    await expect(
      runArgv(['node', '-e', 'while(true){}'], { cwd: root, timeoutMs: 30 }),
    ).rejects.toBeInstanceOf(ForgeError);
  });

  it('covers empty-globs walk and spawn missing executable', async () => {
    const { filesMatching } = await import('../../src/infrastructure/filesystem/walk.js');
    const root = await tempDir();
    const files = await filesMatching(root, []);
    expect(Array.isArray(files)).toBe(true);
    await expect(
      runArgv(['definitely-not-an-executable-xyz'], { cwd: root, timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ForgeError);
  });
});

it('covers remaining branchy helpers', async () => {
  expect(() => assertArgv(['echo ;rm', 'x'], 'hook')).toThrowError(ForgeError);
  expect(
    tasksConflict(
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T01', locks: [], touches: ['src/a/**'] },
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T02', locks: [], touches: ['src/a/b.ts'] },
    ),
  ).toBe(true);
  assertTestCreationPolicy({
    creation: 'when_behavior_changes',
    focused_execution: 'optional',
    testGlobs: ['**/*.test.ts'],
    filesAtStart: ['src/a.ts'],
    filesAtFinish: ['src/a.ts'],
    task: SAMPLE_PLAN.tasks[0]!,
    mandatoryRequirementCount: 0,
  });
  expect(() =>
    assertTestCreationPolicy({
      creation: 'when_missing',
      focused_execution: 'optional',
      testGlobs: ['**/*.test.ts'],
      filesAtStart: ['src/a.ts'],
      filesAtFinish: ['src/a.ts'],
      task: SAMPLE_PLAN.tasks[0]!,
      mandatoryRequirementCount: 0,
    }),
  ).toThrowError(ForgeError);
  const detailed = new ForgeError(Codes.PATH_ESCAPE, 'x', undefined, { path: '..' });
  expect(detailed.toJSON().details).toEqual({ path: '..' });
  expect(redactEnv({ PATH: '/bin', UNSET: undefined }).PATH).toBe('/bin');
});
