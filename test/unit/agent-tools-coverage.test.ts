import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import { parseDurationMs } from '../../src/domain/tools/timeout.js';
import {
  coerceParam,
  interpolateArgs,
  parseCliSets,
  resolveParameters,
} from '../../src/domain/tools/params.js';
import {
  assertKnownRisk,
  assertRiskAllowed,
  requiresConfirmation,
} from '../../src/domain/tools/policy.js';
import { sanitizeEventAttributes } from '../../src/domain/telemetry/sanitize.js';
import { getTool, listTools } from '../../src/application/tools/registry.js';
import { runTool } from '../../src/application/tools/run.js';
import { agentContext, agentPreflight, inspectRepository } from '../../src/application/agent.js';
import { forgeChange, proposeSeal } from '../../src/application/commands.js';
import {
  acquireToolResource,
  releaseToolResource,
} from '../../src/infrastructure/runtime/tool-locks.js';
import { runArgv } from '../../src/infrastructure/process/spawn.js';
import {
  configureTelemetry,
  safeTelemetry,
  telemetryEnabled,
} from '../../src/infrastructure/telemetry/config.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { SAMPLE_CHANGE, SAMPLE_PLAN, tempDir } from '../helpers/fixture.js';

async function forgedRoot(): Promise<string> {
  const root = await tempDir();
  await mkdir(path.join(root, 'forgespec', 'changes', 'add-token-validator'), { recursive: true });
  await mkdir(path.join(root, 'src', 'auth'), { recursive: true });
  await writeFile(
    path.join(root, 'src', 'auth', 'validator.ts'),
    'export const ok = true;\n',
    'utf8',
  );
  await writeFile(
    path.join(root, 'forgespec', 'config.yaml'),
    stringifyYaml({
      version: 1,
      workflow: {
        exec: {
          tests: { creation: 'optional', focused_execution: 'optional' },
          validators: ['dependency-state'],
        },
        archive: { validators: ['dependency-state'], action: { type: 'none' } },
      },
      tools: {
        needenv: {
          executable: 'node',
          args: ['-e', 'process.exit(0)'],
          phases: ['exec'],
          env: ['FORGESPEC_MISSING_ENV_XYZ'],
        },
        lab: {
          executable: 'node',
          args: ['-e', 'process.exit(0)'],
          phases: ['exec'],
          resources: ['docker-lab'],
        },
      },
      git: { isolation: 'branch-per-change', branch_pattern: 'forgespec/<change-id>' },
    }),
    'utf8',
  );
  await writeFile(
    path.join(root, 'forgespec', 'changes', 'add-token-validator', 'change.md'),
    SAMPLE_CHANGE,
    'utf8',
  );
  await writeFile(
    path.join(root, 'forgespec', 'changes', 'add-token-validator', 'plan.yaml'),
    stringifyYaml(SAMPLE_PLAN),
    'utf8',
  );
  await proposeSeal(root, 'add-token-validator');
  await forgeChange(root, 'add-token-validator');
  return root;
}

describe('tool coverage extras', () => {
  it('covers timeout parsing and typed params', () => {
    expect(parseDurationMs(undefined, 5_000)).toBe(5000);
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(() => parseDurationMs('nope')).toThrowError(ForgeError);
    expect(() => parseDurationMs('0s')).toThrowError(ForgeError);
    expect(coerceParam({ type: 'boolean', required: true, source: 'cli' }, 'b', 'true')).toBe(
      'true',
    );
    expect(coerceParam({ type: 'boolean', required: true, source: 'cli' }, 'b', '0')).toBe('false');
    expect(
      coerceParam({ type: 'enum', required: true, source: 'cli', enum: ['a', 'b'] }, 'm', 'a'),
    ).toBe('a');
    expect(coerceParam({ type: 'task-id', required: true, source: 'cli' }, 'id', 'T01')).toBe(
      'T01',
    );
    expect(coerceParam({ type: 'path', required: true, source: 'cli' }, 'p', 'src/a.ts')).toBe(
      'src/a.ts',
    );
    expect(() =>
      coerceParam({ type: 'enum', required: true, source: 'cli', enum: ['a'] }, 'm', 'z'),
    ).toThrowError(ForgeError);
    expect(() =>
      coerceParam({ type: 'task-id', required: true, source: 'cli' }, 'id', 'bad id'),
    ).toThrowError(ForgeError);
    expect(() => parseCliSets(['1bad=x'])).toThrowError(ForgeError);
    const tool = getTool(parseConfigDocument({ version: 1 }, 'm'), 'task-preflight');
    expect(requiresConfirmation({ ...tool, confirm: false, risk: 'destructive' })).toBe(false);
    assertRiskAllowed({ ...tool, confirm: false, risk: 'destructive' }, false);
    expect(() => assertKnownRisk('explode' as 'read')).toThrowError(ForgeError);
  });

  it('covers builtin helpers, preflight blockers, and missing env', async () => {
    const root = await forgedRoot();
    const pre = await agentPreflight(root, root, 'add-token-validator', 'T01');
    expect(pre.blockers.some((item) => item.includes('git worktree'))).toBe(true);
    const ctx = await agentContext(root, 'add-token-validator', 'T01');
    expect(ctx.availableTools).toContain('task-preflight');
    const files = await inspectRepository(root, SAMPLE_PLAN.tasks[0]);
    expect(files.files.some((file) => file.includes('validator.ts'))).toBe(true);
    await runTool({
      root,
      cwd: root,
      toolId: 'repository-inspection',
      phase: 'explore',
    });
    await runTool({
      root,
      cwd: root,
      toolId: 'dependency-inspection',
      taskId: 'T01',
      changeId: 'add-token-validator',
    });
    await runTool({
      root,
      cwd: root,
      toolId: 'evidence-inspection',
      taskId: 'T01',
      changeId: 'add-token-validator',
    });
    await runTool({
      root,
      cwd: root,
      toolId: 'task-context',
      taskId: 'T01',
      changeId: 'add-token-validator',
    });
    await expect(
      runTool({
        root,
        cwd: root,
        toolId: 'task-preflight',
        taskId: 'T01',
        changeId: 'add-token-validator',
      }),
    ).rejects.toMatchObject({ code: Codes.TOOL_FAILED });
    await expect(
      runTool({
        root,
        cwd: root,
        toolId: 'workspace-validation',
        changeId: 'add-token-validator',
        phase: 'exec',
      }),
    ).rejects.toBeInstanceOf(ForgeError);
    await expect(
      runTool({ root, cwd: root, toolId: 'needenv', phase: 'exec' }),
    ).rejects.toMatchObject({ code: Codes.TOOL_FAILED });
    await acquireToolResource(root, 'docker-lab');
    await expect(runTool({ root, cwd: root, toolId: 'lab', phase: 'exec' })).rejects.toMatchObject({
      code: Codes.TOOL_RESOURCE,
    });
    await releaseToolResource(root, 'docker-lab');
    await expect(acquireToolResource(root, 'bad/name')).rejects.toMatchObject({
      code: Codes.TOOL_RESOURCE,
    });
  });

  it('covers telemetry flags, abort, sanitization, and unknown tools', async () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    const prev = process.env.FORGESPEC_OTEL_ENABLED;
    process.env.FORGESPEC_OTEL_ENABLED = '1';
    expect(telemetryEnabled(config)).toBe(true);
    process.env.FORGESPEC_OTEL_ENABLED = '0';
    expect(telemetryEnabled(config)).toBe(false);
    if (prev === undefined) {
      delete process.env.FORGESPEC_OTEL_ENABLED;
    } else {
      process.env.FORGESPEC_OTEL_ENABLED = prev;
    }
    process.env.OTEL_SDK_DISABLED = 'true';
    expect(telemetryEnabled(config)).toBe(false);
    delete process.env.OTEL_SDK_DISABLED;
    await configureTelemetry(config);
    const degraded = await safeTelemetry(config, () => {
      throw new Error('exporter down');
    });
    expect(degraded).toBeUndefined();
    const shown = sanitizeEventAttributes(
      { tool: 'x', path: 'src/a.ts', cwd: 'src' },
      { includeArgs: false, includePaths: true },
    );
    expect(shown.path).toBe('src/a.ts');
    const ac = new AbortController();
    ac.abort();
    await expect(
      runArgv(['node', '-e', 'process.exit(0)'], { cwd: process.cwd(), signal: ac.signal }),
    ).rejects.toMatchObject({ code: Codes.TOOL_CANCELLED });
    expect(() => getTool(config, 'nope')).toThrowError(ForgeError);
    expect(() =>
      listTools(
        parseConfigDocument(
          { version: 1, tools: { 'task-preflight': { executable: 'node', args: ['-e', '1'] } } },
          'c',
        ),
      ),
    ).toThrowError(ForgeError);
    const params = resolveParameters(
      {
        ...getTool(config, 'git-diff'),
        id: 'echo',
        origin: 'project',
        parameters: {
          title: { type: 'string', required: false, source: 'task.title' },
          kind: { type: 'string', required: false, source: 'task.kind' },
        },
      },
      { changeId: 'c', task: SAMPLE_PLAN.tasks[0], cli: {}, root: '/tmp' },
    );
    expect(params.title).toBe(SAMPLE_PLAN.tasks[0]!.title);
    expect(
      interpolateArgs(
        ['${task.kind}'],
        {},
        { changeId: 'c', task: SAMPLE_PLAN.tasks[0], cli: {}, root: '/tmp' },
        'args',
      ),
    ).toEqual(['implement']);
  });
});
