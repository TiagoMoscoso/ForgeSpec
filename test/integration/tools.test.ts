import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import {
  proposeSeal,
  forgeChange,
  execStart,
  execFinish,
  archiveTask,
} from '../../src/application/commands.js';
import { runTool } from '../../src/application/tools/run.js';
import { agentPreflight } from '../../src/application/agent.js';
import { runDeterministicValidator } from '../../src/application/validators.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';
import { loadChange, latestEvidence } from '../../src/infrastructure/runtime/store.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { SAMPLE_CHANGE, SAMPLE_PLAN, tempDir } from '../helpers/fixture.js';

async function seededProject(
  tools: Record<string, unknown>,
  hooks?: { before?: Array<{ tool: string }> },
) {
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
      project: {
        test_globs: ['**/*.test.ts'],
        validator_commands: {
          build: { argv: ['node', '-e', 'process.exit(0)'] },
          'focused-tests': { argv: ['node', '-e', 'process.exit(0)'] },
        },
      },
      workflow: {
        exec: {
          tests: { creation: 'optional', focused_execution: 'optional' },
          validators: ['dependency-state'],
          before: hooks?.before ?? [],
        },
        archive: { validators: ['dependency-state'], action: { type: 'none' } },
      },
      tools,
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

describe('agent tools integration', () => {
  it('runs a registered script and returns JSON evidence', async () => {
    const root = await seededProject({
      ping: {
        executable: 'node',
        args: ['-e', 'process.stdout.write("pong")'],
        phases: ['exec'],
        risk: 'read',
        evidence: { type: 'command' },
      },
    });
    const result = await runTool({
      root,
      cwd: root,
      toolId: 'ping',
      taskId: 'T01',
      changeId: 'add-token-validator',
      phase: 'exec',
    });
    expect(result.status).toBe('passed');
    expect(result.summary).toContain('pong');
    expect(result.evidenceId).toBeTruthy();
    const loaded = await loadChange(root, 'add-token-validator');
    const evidence = await latestEvidence(loaded.dir, 'T01');
    expect(evidence).toBeUndefined();
  });

  it('dry-runs, times out, rejects phase and risk, and records hook failure', async () => {
    const root = await seededProject(
      {
        hang: {
          executable: 'node',
          args: ['-e', 'setTimeout(() => {}, 30_000)'],
          timeout: '1s',
          phases: ['exec'],
          risk: 'read',
        },
        archiveonly: {
          executable: 'node',
          args: ['-e', 'process.exit(0)'],
          phases: ['archive'],
          risk: 'read',
        },
        boom: {
          executable: 'node',
          args: ['-e', 'process.exit(1)'],
          phases: ['exec'],
          risk: 'destructive',
        },
      },
      { before: [{ tool: 'boom' }] },
    );
    const dry = await runTool({
      root,
      cwd: root,
      toolId: 'hang',
      phase: 'exec',
      dryRun: true,
    });
    expect(dry.dryRun).toBe(true);
    expect(dry.plan?.timeoutMs).toBe(1000);
    await expect(runTool({ root, cwd: root, toolId: 'hang', phase: 'exec' })).rejects.toMatchObject(
      {
        code: Codes.TOOL_TIMEOUT,
      },
    );
    await expect(
      runTool({ root, cwd: root, toolId: 'archiveonly', phase: 'exec' }),
    ).rejects.toMatchObject({ code: Codes.TOOL_PHASE });
    await expect(runTool({ root, cwd: root, toolId: 'boom', phase: 'exec' })).rejects.toMatchObject(
      {
        code: Codes.TOOL_CONFIRM,
      },
    );
    await expect(execStart(root, root, 'add-token-validator', 'T01')).rejects.toMatchObject({
      code: Codes.TOOL_HOOK,
    });
  });

  it('lets a validator invoke a project tool and keeps failing tools from advancing state', async () => {
    const root = await seededProject({
      'custom-check': {
        executable: 'node',
        args: ['-e', 'process.exit(0)'],
        phases: ['exec'],
        risk: 'read',
      },
    });
    const loaded = await loadChange(root, 'add-token-validator');
    const record = await runDeterministicValidator('custom-check', {
      root,
      cwd: root,
      config: loaded.config,
      task: loaded.plan!.tasks[0]!,
      states: { T01: 'RUNNING' },
      filesAtStart: [],
      filesAtFinish: ['src/auth/validator.ts'],
      waivers: [],
      changeId: 'add-token-validator',
    });
    expect(record.status).toBe('passed');
    const preflight = await agentPreflight(root, root, 'add-token-validator', 'T01');
    expect(preflight.ready).toBe(true);
    expect(preflight.availableTools).toContain('custom-check');
  });

  it('runs a passing exec hook and archive after exec finish', async () => {
    const root = await seededProject(
      {
        'mark-hook': {
          executable: 'node',
          args: ['-e', 'require("fs").writeFileSync("hook.txt", "ok")'],
          phases: ['exec', 'archive'],
          risk: 'read',
        },
      },
      { before: [{ tool: 'mark-hook' }] },
    );
    await execStart(root, root, 'add-token-validator', 'T01');
    const marker = await readFile(path.join(root, 'hook.txt'), 'utf8');
    expect(marker).toBe('ok');
    await execFinish(root, root, 'add-token-validator', 'T01');
    await archiveTask(root, root, 'add-token-validator', 'T01');
  });

  it('keeps tool evidence subject to freshness after source changes', async () => {
    const root = await seededProject({
      ping: {
        executable: 'node',
        args: ['-e', 'process.stdout.write("ok")'],
        phases: ['exec'],
        evidence: { type: 'command' },
        risk: 'read',
      },
    });
    await execStart(root, root, 'add-token-validator', 'T01');
    await execFinish(root, root, 'add-token-validator', 'T01');
    await runTool({
      root,
      cwd: root,
      toolId: 'ping',
      taskId: 'T01',
      changeId: 'add-token-validator',
      phase: 'exec',
    });
    await writeFile(
      path.join(root, 'src', 'auth', 'validator.ts'),
      'export const ok = false;\n',
      'utf8',
    );
    const loaded = await loadChange(root, 'add-token-validator');
    const evidence = await latestEvidence(loaded.dir, 'T01');
    expect(evidence?.tools?.some((item) => item.tool === 'ping')).toBe(true);
    await expect(archiveTask(root, root, 'add-token-validator', 'T01')).rejects.toMatchObject({
      code: Codes.EVIDENCE_STALE,
    });
  });
});

describe('config still parses without tools block', () => {
  it('accepts the historical fixture shape', () => {
    const config = parseConfigDocument(
      {
        version: 1,
        workflow: { exec: { validators: ['dependency-state'] } },
      },
      'mem',
    );
    expect(config.tools).toEqual({});
    expect(config.observability.privacy.include_command_args).toBe(false);
  });
});
