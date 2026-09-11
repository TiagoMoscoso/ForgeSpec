import path from 'node:path';
import type { ForgeConfig } from '../../infrastructure/config/schema.js';
import type { ToolDefinition, ToolPhase, ResolvedToolPlan } from '../../domain/tools/types.js';
import type { PlanTask } from '../../domain/task-graph/types.js';
import type { ToolExecutionRecord } from '../../domain/evidence/types.js';
import { interpolateArgs, parseCliSets, resolveParameters } from '../../domain/tools/params.js';
import { assertPhaseAllowed, assertRiskAllowed } from '../../domain/tools/policy.js';
import { parseDurationMs } from '../../domain/tools/timeout.js';
import { redactArgv } from '../../domain/telemetry/sanitize.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { runArgv } from '../../infrastructure/process/spawn.js';
import { assertRealPathWithin } from '../../infrastructure/filesystem/realpath.js';
import { containsTraversal } from '../../infrastructure/filesystem/paths.js';
import {
  allTaskStates,
  currentPlanHash,
  latestEvidence,
  loadChange,
  resolveChangeId,
  writeEvidence,
  type LoadedChange,
} from '../../infrastructure/runtime/store.js';
import {
  acquireToolResource,
  releaseToolResource,
  writeToolRun,
} from '../../infrastructure/runtime/tool-locks.js';
import { loadResolvedConfig } from '../../infrastructure/config/load.js';
import { applyDerivedStates } from '../derived-state.js';
import { getTool } from './registry.js';
import {
  agentContext,
  agentPreflight,
  inspectDependencies,
  inspectEvidence,
  inspectRepository,
  validateWorkspaceTool,
} from '../agent.js';
import { attemptId, fingerprintTask } from '../fingerprint.js';

export interface ToolRunRequest {
  root: string;
  cwd: string;
  toolId: string;
  changeId?: string;
  taskId?: string;
  phase?: ToolPhase;
  set?: string[];
  dryRun?: boolean;
  confirm?: boolean;
  signal?: AbortSignal;
}

export interface ToolRunResult {
  tool: string;
  task?: string;
  status: 'passed' | 'failed' | 'timeout' | 'cancelled';
  exitCode: number;
  durationMs: number;
  evidenceId?: string;
  summary: string;
  dryRun?: boolean;
  plan?: {
    tool: string;
    executable: string;
    args: string[];
    cwd: string;
    phase: ToolPhase;
    risk: ToolDefinition['risk'];
    timeoutMs: number;
    evidence: 'test' | 'command' | 'none';
  };
}

async function inferPhase(
  loaded: LoadedChange | undefined,
  taskId: string | undefined,
): Promise<ToolPhase> {
  if (!loaded?.plan || !taskId) {
    return 'exec';
  }
  const declared = await allTaskStates(loaded);
  const states = applyDerivedStates(loaded.plan.tasks, declared);
  const state = states[taskId];
  if (state === 'IMPLEMENTED' || state === 'VERIFIED') {
    return 'archive';
  }
  return 'exec';
}

async function resolveExecutable(root: string, executable: string): Promise<string> {
  if (executable === 'forgespec-builtin') {
    return executable;
  }
  if (executable.includes('/') || executable.includes('\\') || executable.startsWith('.')) {
    if (containsTraversal(executable) || path.isAbsolute(executable)) {
      throw new ForgeError(
        Codes.PATH_ESCAPE,
        `Tool executable '${executable}' is not a contained relative path.`,
      );
    }
    const resolved = path.resolve(root, executable);
    return await assertRealPathWithin(root, resolved);
  }
  if (/[;&|`$<>\s]/.test(executable)) {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Refusing executable '${executable}'.`,
      'Use a PATH command name or a relative path inside the project.',
    );
  }
  return executable;
}

async function resolveCwd(root: string, requested: string | undefined): Promise<string> {
  if (!requested) {
    return root;
  }
  if (containsTraversal(requested) || path.isAbsolute(requested)) {
    throw new ForgeError(
      Codes.PATH_ESCAPE,
      `Tool cwd '${requested}' is not a contained relative path.`,
    );
  }
  return await assertRealPathWithin(root, path.resolve(root, requested));
}

function childEnv(tool: ToolDefinition): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of tool.env) {
    if (env[key] === undefined) {
      throw new ForgeError(
        Codes.TOOL_FAILED,
        `Tool '${tool.id}' requires environment variable ${key}.`,
        'Set the variable in the process environment. ForgeSpec does not persist credentials.',
      );
    }
  }
  return env;
}

async function runBuiltin(
  tool: ToolDefinition,
  request: ToolRunRequest,
  loaded: LoadedChange | undefined,
  task: PlanTask | undefined,
): Promise<{ exitCode: number; summary: string }> {
  const changeId = request.changeId ?? loaded?.changeId;
  switch (tool.id) {
    case 'task-preflight': {
      if (!changeId || !request.taskId) {
        throw new ForgeError(Codes.TOOL_PARAMS, 'task-preflight requires --task and a change.');
      }
      const result = await agentPreflight(request.root, request.cwd, changeId, request.taskId);
      return { exitCode: result.ready ? 0 : 1, summary: JSON.stringify(result) };
    }
    case 'task-context': {
      if (!changeId || !request.taskId) {
        throw new ForgeError(Codes.TOOL_PARAMS, 'task-context requires --task and a change.');
      }
      const result = await agentContext(request.root, changeId, request.taskId);
      return { exitCode: 0, summary: JSON.stringify(result) };
    }
    case 'dependency-inspection': {
      if (!loaded || !request.taskId) {
        throw new ForgeError(Codes.TOOL_PARAMS, 'dependency-inspection requires --task.');
      }
      const result = await inspectDependencies(loaded, request.taskId);
      return { exitCode: 0, summary: JSON.stringify(result) };
    }
    case 'repository-inspection': {
      const result = await inspectRepository(request.root, task);
      return { exitCode: 0, summary: JSON.stringify(result) };
    }
    case 'evidence-inspection': {
      if (!loaded || !request.taskId) {
        throw new ForgeError(Codes.TOOL_PARAMS, 'evidence-inspection requires --task.');
      }
      const result = await inspectEvidence(loaded, request.taskId);
      return { exitCode: 0, summary: JSON.stringify(result) };
    }
    case 'workspace-validation': {
      if (!changeId) {
        throw new ForgeError(Codes.TOOL_PARAMS, 'workspace-validation requires a change.');
      }
      const result = await validateWorkspaceTool(request.root, request.cwd, changeId);
      return { exitCode: 0, summary: JSON.stringify(result) };
    }
    default:
      throw new ForgeError(Codes.TOOL_UNKNOWN, `No builtin implementation for ${tool.id}.`);
  }
}

async function persistToolEvidence(
  loaded: LoadedChange | undefined,
  task: PlanTask | undefined,
  request: ToolRunRequest,
  tool: ToolDefinition,
  record: ToolExecutionRecord,
): Promise<string | undefined> {
  if (!loaded || !task || (tool.evidence?.type ?? 'none') === 'none') {
    return undefined;
  }
  const id = attemptId('tool');
  const fingerprint = await fingerprintTask(request.root, task);
  await writeToolRun(loaded.dir, {
    attempt_id: id,
    task_id: task.id,
    change_id: loaded.changeId,
    tool: tool.id,
    fingerprint,
    plan_hash: loaded.plan ? currentPlanHash(loaded.plan) : undefined,
    record,
  });
  const latest = await latestEvidence(loaded.dir, task.id);
  if (latest) {
    const tools = [...(latest.tools ?? []), record];
    await writeEvidence(loaded.dir, { ...latest, tools });
  }
  return id;
}

export function buildResolvedPlan(
  tool: ToolDefinition,
  argv: string[],
  cwd: string,
  phase: ToolPhase,
  timeoutMs: number,
): ResolvedToolPlan {
  return {
    tool: tool.id,
    origin: tool.origin,
    executable: argv[0] ?? tool.executable,
    args: argv.slice(1),
    cwd,
    phase,
    risk: tool.risk,
    timeoutMs,
    resources: tool.resources,
    evidenceType: tool.evidence?.type ?? (tool.origin === 'builtin' ? 'none' : 'command'),
    builtin: tool.origin === 'builtin' && tool.executable === 'forgespec-builtin',
  };
}

export async function runTool(request: ToolRunRequest): Promise<ToolRunResult> {
  const config = await loadResolvedConfig(request.root, request.changeId);
  const tool = getTool(config, request.toolId);
  let loaded: LoadedChange | undefined;
  if (request.changeId || request.taskId) {
    const changeId = request.changeId ?? (await resolveChangeId(request.root, request.changeId));
    loaded = await loadChange(request.root, changeId);
  }
  const task = request.taskId
    ? loaded?.plan?.tasks.find((item) => item.id === request.taskId)
    : undefined;
  if (request.taskId && loaded?.plan && !task) {
    throw new ForgeError(Codes.TASK_NOT_FOUND, `Task ${request.taskId} does not exist.`);
  }
  const phase = request.phase ?? (await inferPhase(loaded, request.taskId));
  assertPhaseAllowed(tool, phase);
  if (!request.dryRun) {
    assertRiskAllowed(tool, Boolean(request.confirm));
  }
  const cli = parseCliSets(request.set ?? []);
  const params = resolveParameters(tool, {
    changeId: loaded?.changeId ?? request.changeId ?? '',
    task,
    cli,
    root: request.root,
  });
  const interpolated = interpolateArgs(
    tool.args,
    params,
    {
      changeId: loaded?.changeId ?? request.changeId ?? '',
      task,
      cli,
      root: request.root,
    },
    `tools.${tool.id}.args`,
  );
  const executable = await resolveExecutable(request.root, tool.executable);
  const cwd = await resolveCwd(request.root, tool.cwd);
  const timeoutMs = parseDurationMs(tool.timeout, tool.timeout_ms);
  const argv = [executable, ...interpolated];
  const plan = buildResolvedPlan(tool, argv, cwd, phase, timeoutMs);
  if (request.dryRun) {
    return {
      tool: tool.id,
      task: request.taskId,
      status: 'passed',
      exitCode: 0,
      durationMs: 0,
      summary: 'dry-run',
      dryRun: true,
      plan: {
        tool: tool.id,
        executable: plan.executable,
        args: redactArgv(plan.args),
        cwd: plan.cwd,
        phase,
        risk: tool.risk,
        timeoutMs,
        evidence: plan.evidenceType,
      },
    };
  }
  const resources =
    tool.risk === 'destructive' ? [...new Set([...tool.resources, 'destructive'])] : tool.resources;
  const acquired: string[] = [];
  const started = Date.now();
  try {
    for (const resource of resources) {
      await acquireToolResource(request.root, resource);
      acquired.push(resource);
    }
    let exitCode = 0;
    let summary = '';
    if (plan.builtin) {
      const result = await runBuiltin(tool, request, loaded, task);
      exitCode = result.exitCode;
      summary = result.summary.slice(0, 4000);
    } else {
      const spawned = await runArgv(argv, {
        cwd,
        timeoutMs,
        env: childEnv(tool),
        signal: request.signal,
        timeoutCode: Codes.TOOL_TIMEOUT,
        overflowCode: Codes.TOOL_OVERFLOW,
        cancelCode: Codes.TOOL_CANCELLED,
      });
      exitCode = spawned.exitCode;
      summary = spawned.summary.slice(0, 1000);
    }
    const durationMs = Date.now() - started;
    const status = exitCode === 0 ? 'passed' : 'failed';
    const record: ToolExecutionRecord = {
      tool: tool.id,
      source: { type: 'tool', id: tool.id },
      execution: { status, exit_code: exitCode, duration_ms: durationMs },
      validation: { type: plan.evidenceType },
      summary,
      at: new Date().toISOString(),
    };
    const evidenceId = await persistToolEvidence(loaded, task, request, tool, record);
    if (exitCode !== 0) {
      throw new ForgeError(
        Codes.TOOL_FAILED,
        `Tool '${tool.id}' exited ${exitCode}.`,
        'Inspect the tool summary. Tool failure does not advance task state.',
        { tool: tool.id, exitCode, summary },
      );
    }
    return {
      tool: tool.id,
      task: request.taskId,
      status,
      exitCode,
      durationMs,
      evidenceId,
      summary,
    };
  } finally {
    for (const resource of acquired.reverse()) {
      await releaseToolResource(request.root, resource);
    }
  }
}

export async function inspectTool(config: ForgeConfig, id: string): Promise<ToolDefinition> {
  return getTool(config, id);
}
