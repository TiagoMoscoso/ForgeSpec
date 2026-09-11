import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/program.js';
import { SAMPLE_CHANGE, SAMPLE_PLAN, TEST_CONFIG, tempDir } from '../helpers/fixture.js';
import { stringify as stringifyYaml } from 'yaml';
import { runValidatorList } from '../../src/application/validators.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';
import { SAMPLE_PLAN as PLAN } from '../helpers/fixture.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { runArgv } from '../../src/infrastructure/process/spawn.js';
import { gitTopLevel } from '../../src/infrastructure/git/git.js';

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

describe('cli workflow coverage', () => {
  it('drives seal/forge/exec/archive/close through the CLI', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'forgespec', 'changes', 'add-token-validator'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'forgespec', 'specs', 'auth'), { recursive: true });
    await mkdir(path.join(root, 'src', 'auth'), { recursive: true });
    await writeFile(path.join(root, 'forgespec', 'config.yaml'), TEST_CONFIG, 'utf8');
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
    await writeFile(
      path.join(root, 'src', 'auth', 'validator.ts'),
      'export const ok = true;\n',
      'utf8',
    );
    await writeFile(
      path.join(root, 'forgespec', 'specs', 'auth', 'spec.md'),
      'REQ-AUTH-001\n',
      'utf8',
    );

    await withCwd(root, async () => {
      expect(
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
        ),
      ).toContain('add-token-validator');
      expect(
        await capture(() =>
          runCli(['node', 'forgespec', '--json', 'forge', '--change', 'add-token-validator']),
        ),
      ).toContain('planHash');
      await capture(() =>
        runCli(['node', 'forgespec', '--json', 'status', '--change', 'add-token-validator']),
      );
      await capture(() =>
        runCli(['node', 'forgespec', '--json', 'graph', '--change', 'add-token-validator']),
      );
      await capture(() =>
        runCli(['node', 'forgespec', '--json', 'waves', '--change', 'add-token-validator']),
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'ready',
          '--change',
          'add-token-validator',
          '--close',
        ]),
      );
      await capture(() =>
        runCli([
          'node',
          'forgespec',
          '--json',
          'context',
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
          'finish',
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
          'evidence',
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
          'archive',
          'T01',
          '--change',
          'add-token-validator',
        ]),
      );
      expect(
        await capture(() =>
          runCli(['node', 'forgespec', '--json', 'close', '--change', 'add-token-validator']),
        ),
      ).toContain('archivedTo');
      await capture(() => runCli(['node', 'forgespec', '--json', 'update', '--tools', 'claude']));
    });
  });

  it('covers failing validators, argv spawn, and git helpers', async () => {
    const config = parseConfigDocument(
      {
        version: 1,
        project: {
          validator_commands: {
            build: { argv: ['node', '-e', 'process.exit(1)'] },
            pass: { argv: ['node', '-e', 'process.exit(0)'] },
          },
        },
      },
      'mem',
    );
    await expect(
      runValidatorList(['build'], {
        root: process.cwd(),
        cwd: process.cwd(),
        config,
        task: PLAN.tasks[0]!,
        states: {},
        filesAtStart: [],
        filesAtFinish: [],
        waivers: [],
      }),
    ).rejects.toBeInstanceOf(ForgeError);

    const waived = await runValidatorList(['build'], {
      root: process.cwd(),
      cwd: process.cwd(),
      config,
      task: PLAN.tasks[0]!,
      states: {},
      filesAtStart: [],
      filesAtFinish: [],
      waivers: [
        {
          validator: 'build',
          reason: 'temporarily skipped in unit test',
          by: 'test',
          at: new Date().toISOString(),
          task_id: 'T01',
        },
      ],
    });
    expect(waived[0]?.status).toBe('waived');

    const ok = await runArgv(['node', '-e', 'process.stdout.write("hi")'], {
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
    expect(ok.exitCode).toBe(0);
    await expect(gitTopLevel(process.cwd())).resolves.toBeTruthy();
  });
});
