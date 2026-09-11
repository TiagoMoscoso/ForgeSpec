import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '../infrastructure/config/schema.js';
import type { PlanTask } from '../domain/task-graph/types.js';
import type { ValidatorRecord, WaiverRecord } from '../domain/evidence/types.js';
import { globMatches } from '../domain/task-graph/globs.js';
import { Codes } from '../domain/validation/codes.js';
import { ForgeError } from '../domain/validation/error.js';
import { runArgv } from '../infrastructure/process/spawn.js';
import type { TaskState } from '../domain/task-state/machine.js';
import { satisfiedForDependency } from '../domain/task-state/machine.js';

export const DETERMINISTIC_VALIDATORS = new Set([
  'build',
  'unit-test',
  'unit-tests',
  'focused-test',
  'focused-tests',
  'full-test-suite',
  'lint',
  'format',
  'typecheck',
  'coverage',
  'file-exists',
  'command',
  'git-diff-scope',
  'requirement-coverage',
  'dependency-state',
  'evidence-freshness',
  'affected-tests',
]);

export const SEMANTIC_VALIDATORS = new Set([
  'architecture-review',
  'security-review',
  'spec-compliance',
  'code-review',
]);

const SCRIPT_CANDIDATES: Record<string, string[]> = {
  build: ['build'],
  'unit-test': ['test'],
  'unit-tests': ['test'],
  'focused-test': ['test'],
  'focused-tests': ['test'],
  'affected-tests': ['test'],
  'full-test-suite': ['test'],
  lint: ['lint'],
  format: ['format', 'fmt'],
  typecheck: ['typecheck'],
  coverage: ['test:coverage', 'coverage'],
};

export interface ValidatorContext {
  root: string;
  cwd: string;
  config: ForgeConfig;
  task: PlanTask;
  states: Record<string, TaskState>;
  filesAtStart: string[];
  filesAtFinish: string[];
  waivers: WaiverRecord[];
}

function normalizeName(name: string): string {
  return name.trim();
}

export function isSemanticValidator(name: string): boolean {
  return SEMANTIC_VALIDATORS.has(name);
}

function waived(name: string, waivers: WaiverRecord[], taskId: string): WaiverRecord | undefined {
  return waivers.find((waiver) => waiver.validator === name && waiver.task_id === taskId);
}

async function packageScripts(root: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(root, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

function packageManager(rootScriptsPresent: boolean): string[] {
  return rootScriptsPresent ? ['pnpm', 'run'] : ['npm', 'run'];
}

async function resolveArgv(name: string, ctx: ValidatorContext): Promise<string[] | undefined> {
  const configured = ctx.config.project.validator_commands[name];
  if (configured) {
    return configured.argv;
  }
  const aliases = SCRIPT_CANDIDATES[name];
  if (!aliases) {
    return undefined;
  }
  const scripts = await packageScripts(ctx.root);
  const script = aliases.find((candidate) => scripts[candidate]);
  if (!script) {
    return undefined;
  }
  const runner = Object.keys(scripts).length > 0 ? packageManager(true) : ['npm', 'run'];
  const argv = [...runner, script];
  if (
    (name === 'focused-test' || name === 'focused-tests' || name === 'affected-tests') &&
    ctx.task.touches[0]
  ) {
    argv.push('--', ctx.task.touches[0]!);
  }
  return argv;
}

export async function runDeterministicValidator(
  name: string,
  ctx: ValidatorContext,
): Promise<ValidatorRecord> {
  const waiver = waived(name, ctx.waivers, ctx.task.id);
  if (waiver) {
    return {
      name,
      kind: 'deterministic',
      status: 'waived',
      summary: `waived: ${waiver.reason}`,
    };
  }

  if (name === 'requirement-coverage') {
    return {
      name,
      kind: 'deterministic',
      status: 'passed',
      summary: 'requirement coverage enforced at forge',
      exitCode: 0,
    };
  }
  if (name === 'dependency-state') {
    const required = ctx.task.depends_on_state ?? 'verified';
    const unmet = ctx.task.depends_on.filter(
      (dep) => !satisfiedForDependency(ctx.states[dep] ?? 'BLOCKED', required),
    );
    if (unmet.length > 0) {
      return {
        name,
        kind: 'deterministic',
        status: 'failed',
        exitCode: 1,
        summary: `unmet dependencies: ${unmet.join(', ')}`,
      };
    }
    return {
      name,
      kind: 'deterministic',
      status: 'passed',
      summary: 'dependencies satisfied',
      exitCode: 0,
    };
  }
  if (name === 'file-exists') {
    const missing = ctx.task.touches.filter(
      (glob) => !ctx.filesAtFinish.some((file) => globMatches(glob, file)),
    );
    if (missing.length > 0 && ctx.task.touches.length > 0) {
      return {
        name,
        kind: 'deterministic',
        status: 'failed',
        exitCode: 1,
        summary: `no files matched touches: ${missing.join(', ')}`,
      };
    }
    return {
      name,
      kind: 'deterministic',
      status: 'passed',
      summary: 'touches matched',
      exitCode: 0,
    };
  }
  if (name === 'git-diff-scope') {
    const start = new Set(ctx.filesAtStart);
    const finish = new Set(ctx.filesAtFinish);
    const changed = [
      ...ctx.filesAtFinish.filter((file) => !start.has(file)),
      ...ctx.filesAtStart.filter((file) => !finish.has(file)),
    ];
    const outOfScope = changed.filter(
      (file) =>
        ctx.task.touches.length > 0 && !ctx.task.touches.some((glob) => globMatches(glob, file)),
    );
    if (outOfScope.length > 0) {
      return {
        name,
        kind: 'deterministic',
        status: 'failed',
        exitCode: 1,
        summary: `changed files outside touches: ${outOfScope.join(', ')}`,
      };
    }
    return {
      name,
      kind: 'deterministic',
      status: 'passed',
      summary: 'diff within declared touches',
      exitCode: 0,
    };
  }
  if (name === 'evidence-freshness') {
    return {
      name,
      kind: 'deterministic',
      status: 'passed',
      summary: 'checked by archive/exec separately',
      exitCode: 0,
    };
  }

  const argv = await resolveArgv(name, ctx);
  if (!argv) {
    throw new ForgeError(
      Codes.VALIDATOR_NOT_CONFIGURED,
      `Validator '${name}' is required but not configured.`,
      'Add project.validator_commands or a matching package.json script.',
      { validator: name },
    );
  }
  const timeout = ctx.config.project.validator_commands[name]?.timeout_ms ?? 120_000;
  const result = await runArgv(argv, { cwd: ctx.cwd, timeoutMs: timeout });
  return {
    name,
    kind: 'deterministic',
    argv,
    exitCode: result.exitCode,
    status: result.exitCode === 0 ? 'passed' : 'failed',
    summary: result.summary.slice(0, 1000) || `exit ${result.exitCode}`,
  };
}

export async function runValidatorList(
  names: string[],
  ctx: ValidatorContext,
): Promise<ValidatorRecord[]> {
  const records: ValidatorRecord[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (isSemanticValidator(name)) {
      continue;
    }
    records.push(await runDeterministicValidator(name, ctx));
  }
  const failed = records.filter((record) => record.status === 'failed');
  if (failed.length > 0) {
    throw new ForgeError(
      Codes.VALIDATOR_FAILED,
      `Validator failed: ${failed.map((record) => record.name).join(', ')}.`,
      'Inspect evidence summaries, fix the failure, and re-run.',
      { failed: failed.map((record) => record.name) },
    );
  }
  return records;
}

export function requiredSemantic(names: string[]): string[] {
  return names.filter((name) => isSemanticValidator(name));
}
