import { mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import { runTool } from '../../src/application/tools/run.js';
import { assertArgv, runArgv } from '../../src/infrastructure/process/spawn.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { SAMPLE_CHANGE, SAMPLE_PLAN, tempDir } from '../helpers/fixture.js';

async function writeProject(root: string, tools: Record<string, unknown>): Promise<void> {
  await mkdir(path.join(root, 'forgespec', 'changes', 'add-token-validator'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(
    path.join(root, 'scripts', 'echo.mjs'),
    'process.stdout.write(process.argv[2] ?? "")\n',
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
}

const echoTool = {
  executable: 'node',
  args: ['scripts/echo.mjs', '${payload}'],
  phases: ['exec'],
  risk: 'read',
  parameters: { payload: { type: 'string', required: true } },
};

describe('tool security', () => {
  it('treats shell metacharacters as inert data', async () => {
    const root = await tempDir();
    await writeProject(root, { echo: echoTool });
    const result = await runTool({
      root,
      cwd: root,
      toolId: 'echo',
      set: ['payload=; rm -rf / && $(whoami)'],
      phase: 'exec',
    });
    expect(result.status).toBe('passed');
    expect(result.summary).toContain('; rm -rf /');
    expect(result.summary).toContain('$(whoami)');
  });

  it('rejects argv shell strings, traversal cwd, and escaped executables', async () => {
    expect(() => assertArgv('rm -rf /; echo hi', 'hook')).toThrowError(ForgeError);
    expect(() => assertArgv(['$(whoami)'], 'hook')).toThrowError(ForgeError);
    const root = await tempDir();
    await writeProject(root, {
      leave: {
        executable: 'node',
        args: ['-e', '1'],
        cwd: '../outside',
        phases: ['exec'],
      },
    });
    await expect(
      runTool({ root, cwd: root, toolId: 'leave', phase: 'exec' }),
    ).rejects.toMatchObject({
      code: Codes.PATH_ESCAPE,
    });
  });

  it('rejects symlink executables that escape the project', async () => {
    const root = await tempDir();
    await writeProject(root, {
      escape: {
        executable: 'scripts/escape.sh',
        args: [],
        phases: ['exec'],
        risk: 'read',
      },
    });
    const outside = path.join(os.tmpdir(), `forgespec-out-${process.pid}`);
    await writeFile(outside, '#!/bin/sh\necho pwned\n', 'utf8');
    await symlink(outside, path.join(root, 'scripts', 'escape.sh'));
    await expect(
      runTool({ root, cwd: root, toolId: 'escape', phase: 'exec' }),
    ).rejects.toMatchObject({
      code: Codes.PATH_ESCAPE,
    });
  });

  it('does not let --set inject environment variables', async () => {
    const root = await tempDir();
    await writeProject(root, { echo: echoTool });
    await expect(
      runTool({
        root,
        cwd: root,
        toolId: 'echo',
        set: ['payload=ok', 'NODE_OPTIONS=--require=./evil.js'],
        phase: 'exec',
      }),
    ).rejects.toMatchObject({ code: Codes.TOOL_PARAMS });
  });

  it('kills overflow output without interpreting it as a shell', async () => {
    await expect(
      runArgv(['node', '-e', 'process.stdout.write("x".repeat(200))'], {
        cwd: process.cwd(),
        timeoutMs: 10_000,
        maxOutputBytes: 20,
      }),
    ).rejects.toMatchObject({ code: Codes.TOOL_OVERFLOW });
  });
});
