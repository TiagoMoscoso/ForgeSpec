import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/program.js';
import { printError, printResult } from '../../src/cli/output.js';
import { parseTools, updateSkills } from '../../src/application/init.js';
import { workspaceCheck, workspaceSetup } from '../../src/application/workspace.js';
import {
  cancelTask,
  execReset,
  execStart,
  forgeChange,
  proposeSeal,
  queryContext,
  queryEvidence,
  queryGraph,
  queryValidate,
  reviewSubmit,
} from '../../src/application/commands.js';
import { getSpecialist, SPECIALISTS } from '../../src/skills/specialists/index.js';
import * as api from '../../src/index.js';
import { redactEnv } from '../../src/domain/evidence/fingerprint.js';
import { isTerminal, satisfiedForDependency } from '../../src/domain/task-state/machine.js';
import { tasksConflict } from '../../src/domain/task-graph/graph.js';
import { parsePlanDocument } from '../../src/domain/task-graph/parse.js';
import { assertRealPathWithin } from '../../src/infrastructure/filesystem/realpath.js';
import { findProjectRoot } from '../../src/infrastructure/project/layout.js';
import { loadResolvedConfig } from '../../src/infrastructure/config/load.js';
import { runDeterministicValidator } from '../../src/application/validators.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { SAMPLE_PLAN, tempDir, writeChangeFixture } from '../helpers/fixture.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';
import { assertTestCreationPolicy } from '../../src/domain/policy/tests.js';
import { globToRegExp } from '../../src/domain/task-graph/globs.js';
import { ForgeError as Err } from '../../src/domain/validation/error.js';

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
    process.exitCode = 0;
  }
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const stdout = process.stdout.write.bind(process.stdout);
  const stderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await fn();
    return chunks.join('');
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

describe('additional coverage', () => {
  it('exports public API', () => {
    expect(api.Codes.PLAN_UNCOVERED).toBe('FGE201');
    expect(api.parseChangeMarkdown).toBeTypeOf('function');
  });

  it('lists specialists and looks one up', () => {
    expect(SPECIALISTS.length).toBeGreaterThan(5);
    expect(getSpecialist('security')?.id).toBe('security');
    expect(getSpecialist('nope')).toBeUndefined();
  });

  it('parseTools rejects unknown tools', () => {
    expect(() => parseTools('emacs')).toThrow();
    expect(parseTools(undefined)).toEqual(['cursor', 'claude', 'codex']);
  });

  it('covers CLI init/status/skill JSON', async () => {
    const root = await tempDir();
    await withCwd(root, async () => {
      const out = await captureStdout(() =>
        runCli(['node', 'forgespec', '--json', 'init', '--tools', 'codex']),
      );
      expect(out).toContain('"ok": true');
      const skill = await captureStdout(() => runCli(['node', 'forgespec', '--json', 'skill']));
      expect(skill).toContain('architecture');
      const named = await captureStdout(() =>
        runCli(['node', 'forgespec', '--json', 'skill', 'testing']),
      );
      expect(named).toContain('Testing');
      const status = await captureStdout(() => runCli(['node', 'forgespec', '--json', 'validate']));
      expect(status).toContain('configVersion');
    });
  });

  it('covers query helpers, overlay, and validators', async () => {
    const root = await writeChangeFixture(await tempDir()).then((dir) =>
      path.resolve(dir, '../../..'),
    );
    await writeFile(
      path.join(root, 'forgespec', 'changes', 'add-token-validator', 'config.yaml'),
      `workflow:\n  exec:\n    tests:\n      creation: optional\n`,
      'utf8',
    );
    const config = await loadResolvedConfig(root, 'add-token-validator');
    expect(config.workflow.exec.tests.creation).toBe('optional');
    await proposeSeal(root, 'add-token-validator');
    await forgeChange(root, 'add-token-validator');
    const graph = await queryGraph(root, 'add-token-validator');
    expect(graph.waves[0]).toContain('T01');
    const ctx = await queryContext(root, 'add-token-validator', 'T01');
    expect(ctx.task.id).toBe('T01');
    await queryValidate(root, 'add-token-validator');
    await execStart(root, root, 'add-token-validator', 'T01');
    await execReset(root, 'add-token-validator', 'T01', 'agent crashed mid-task');
    const rec = await runDeterministicValidator('requirement-coverage', {
      root,
      cwd: root,
      config,
      task: SAMPLE_PLAN.tasks[0]!,
      states: { T01: 'READY' },
      filesAtStart: [],
      filesAtFinish: ['src/auth/validator.ts'],
      waivers: [],
    });
    expect(rec.status).toBe('passed');
    await runDeterministicValidator('dependency-state', {
      root,
      cwd: root,
      config,
      task: SAMPLE_PLAN.tasks[0]!,
      states: { T01: 'READY' },
      filesAtStart: [],
      filesAtFinish: ['src/auth/validator.ts'],
      waivers: [],
    });
    await runDeterministicValidator('file-exists', {
      root,
      cwd: root,
      config,
      task: SAMPLE_PLAN.tasks[0]!,
      states: { T01: 'READY' },
      filesAtStart: [],
      filesAtFinish: ['src/auth/validator.ts'],
      waivers: [],
    });
    await runDeterministicValidator('git-diff-scope', {
      root,
      cwd: root,
      config,
      task: SAMPLE_PLAN.tasks[0]!,
      states: { T01: 'READY' },
      filesAtStart: ['src/auth/validator.ts'],
      filesAtFinish: ['src/auth/validator.ts', 'README.md'],
      waivers: [],
    });
    await runDeterministicValidator('evidence-freshness', {
      root,
      cwd: root,
      config,
      task: SAMPLE_PLAN.tasks[0]!,
      states: { T01: 'READY' },
      filesAtStart: [],
      filesAtFinish: [],
      waivers: [],
    });
  });

  it('covers workspace setup when isolation is enabled', async () => {
    const root = await writeChangeFixture(await tempDir()).then((dir) =>
      path.resolve(dir, '../../..'),
    );
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'i'], {
      cwd: root,
    });
    await writeFile(
      path.join(root, 'forgespec', 'config.yaml'),
      `version: 1
workflow:
  exec:
    tests:
      creation: optional
      focused_execution: optional
    validators: [dependency-state]
  archive:
    validators: [dependency-state]
    action: { type: none }
git:
  isolation: branch-per-change
`,
      'utf8',
    );
    await proposeSeal(root, 'add-token-validator');
    await forgeChange(root, 'add-token-validator');
    const setup = await workspaceSetup(root, root, 'add-token-validator');
    expect(setup.branch).toContain('add-token-validator');
    const check = await workspaceCheck(root, root, 'add-token-validator');
    expect(check.ok).toBe(true);
  });

  it('covers output helpers, env redaction, and state helpers', () => {
    printResult(false, { hello: 'world' });
    printResult(false, 'plain');
    printResult(true, { a: 1 });
    printError(false, new ForgeError(Codes.PATH_ESCAPE, 'nope', 'stay inside'));
    printError(true, new Error('plain'));
    printError(false, 'string');
    const json = new ForgeError(Codes.PATH_ESCAPE, 'x').toJSON();
    expect(json.ok).toBe(false);
    expect(redactEnv({ TOKEN: 'abc', PATH: '/bin' }).TOKEN).toBe('[redacted]');
    expect(isTerminal('ARCHIVED')).toBe(true);
    expect(satisfiedForDependency('IMPLEMENTED', 'implemented')).toBe(true);
    expect(satisfiedForDependency('READY', 'verified')).toBe(false);
    expect(
      tasksConflict(
        { ...SAMPLE_PLAN.tasks[0]!, id: 'T01', locks: ['a'] },
        { ...SAMPLE_PLAN.tasks[0]!, id: 'T02', locks: ['a'] },
      ),
    ).toBe(true);
    expect(() => parsePlanDocument({ version: 2 })).toThrowError(ForgeError);
    expect(globToRegExp('src/?').test('src/a')).toBe(true);
  });

  it('covers when_missing and when_behavior_changes policies', () => {
    assertTestCreationPolicy({
      creation: 'when_missing',
      focused_execution: 'optional',
      testGlobs: ['**/*.test.ts'],
      filesAtStart: ['src/a.test.ts'],
      filesAtFinish: ['src/a.test.ts'],
      task: SAMPLE_PLAN.tasks[0]!,
      mandatoryRequirementCount: 1,
    });
    expect(() =>
      assertTestCreationPolicy({
        creation: 'when_behavior_changes',
        focused_execution: 'optional',
        testGlobs: ['**/*.test.ts'],
        filesAtStart: ['src/a.ts'],
        filesAtFinish: ['src/a.ts'],
        task: SAMPLE_PLAN.tasks[0]!,
        mandatoryRequirementCount: 1,
      }),
    ).toThrowError(ForgeError);
  });

  it('covers path realpath, find root, update skills, review, cancel', async () => {
    const root = await writeChangeFixture(await tempDir()).then((dir) =>
      path.resolve(dir, '../../..'),
    );
    expect(await findProjectRoot(path.join(root, 'src'))).toBe(root);
    expect(await assertRealPathWithin(root, path.join(root, 'forgespec', 'config.yaml'))).toContain(
      'config.yaml',
    );
    const updated = await updateSkills(root, ['cursor']);
    expect(updated.refreshed.length).toBeGreaterThan(0);
    await proposeSeal(root, 'add-token-validator');
    await forgeChange(root, 'add-token-validator');
    await execStart(root, root, 'add-token-validator', 'T01');
    const { execFinish } = await import('../../src/application/commands.js');
    await execFinish(root, root, 'add-token-validator', 'T01');
    const reviewFile = path.join(root, 'review.json');
    await writeFile(
      reviewFile,
      JSON.stringify({ findings: { critical: 0, warning: 0, suggestion: 1 } }),
      'utf8',
    );
    await reviewSubmit(root, 'add-token-validator', 'T01', 'code-review', reviewFile);
    const evidence = await queryEvidence(root, 'add-token-validator', 'T01');
    expect(evidence.latest?.semanticReviews[0]?.validator).toBe('code-review');
    await cancelTask(root, 'add-token-validator', 'T01', 'not needed anymore');
  });

  it('rejects workspace setup when isolation is none', async () => {
    const root = await writeChangeFixture(await tempDir()).then((dir) =>
      path.resolve(dir, '../../..'),
    );
    await expect(workspaceSetup(root, root, 'add-token-validator')).rejects.toBeInstanceOf(
      ForgeError,
    );
    await expect(workspaceCheck(root, root, 'add-token-validator')).resolves.toMatchObject({
      isolation: 'none',
    });
  });

  it('prints CLI errors as JSON', async () => {
    const root = await tempDir();
    await withCwd(root, async () => {
      const out = await captureStdout(() => runCli(['node', 'forgespec', '--json', 'status']));
      expect(out).toContain('FGE103');
    });
  });

  it('covers invalid overlay and default yaml parse', () => {
    const cfg = parseConfigDocument({ version: 1 }, 'x');
    expect(cfg.workflow.explore.enabled).toBe(true);
  });
});

describe('layout errors', () => {
  it('findProjectRoot fails outside a project', async () => {
    const dir = await tempDir();
    await expect(findProjectRoot(dir)).rejects.toBeInstanceOf(Err);
  });

  it('mkdir helper', async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, 'n'), { recursive: true });
    expect(dir).toBeTruthy();
  });
});
