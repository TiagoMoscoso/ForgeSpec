import type { ToolPhase } from '../domain/tools/types.js';
import type { PlanTask } from '../domain/task-graph/types.js';
import type { TaskState } from '../domain/task-state/machine.js';
import { Codes } from '../domain/validation/codes.js';
import { ForgeError } from '../domain/validation/error.js';
import { globMatches } from '../domain/task-graph/globs.js';
import { isEvidenceFresh } from '../domain/evidence/types.js';
import {
  allTaskStates,
  currentPlanHash,
  latestEvidence,
  listEvidence,
  loadChange,
  readLock,
  runningTasks,
  type LoadedChange,
} from '../infrastructure/runtime/store.js';
import { walkRelativeFiles } from '../infrastructure/filesystem/walk.js';
import { applyDerivedStates } from './derived-state.js';
import { toolsForPhase } from './tools/registry.js';
import { fingerprintTask } from './fingerprint.js';
import { workspaceCheck } from './workspace.js';
import { gitIdentity, isGitRepo } from '../infrastructure/git/git.js';
import { expectedBranch, workspaceMatches } from '../domain/workspace/policy.js';
import { readWorkspace } from '../infrastructure/runtime/store.js';

export interface AgentDependency {
  id: string;
  state: TaskState;
}

export interface AgentPreflight {
  task: string;
  state: TaskState;
  ready: boolean;
  blockers: string[];
  dependencies: AgentDependency[];
  requirements: string[];
  context: string[];
  validators: string[];
  availableTools: string[];
  phase: ToolPhase;
}

async function statesFor(loaded: LoadedChange): Promise<Record<string, TaskState>> {
  const declared = await allTaskStates(loaded);
  return applyDerivedStates(loaded.plan?.tasks ?? [], declared);
}

function taskById(loaded: LoadedChange, taskId: string): PlanTask {
  const task = loaded.plan?.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new ForgeError(Codes.TASK_NOT_FOUND, `Task ${taskId} does not exist.`);
  }
  return task;
}

function inferPhase(state: TaskState): ToolPhase {
  if (state === 'IMPLEMENTED' || state === 'VERIFIED') {
    return 'archive';
  }
  return 'exec';
}

export async function agentPreflight(
  root: string,
  cwd: string,
  changeId: string,
  taskId: string,
): Promise<AgentPreflight> {
  const loaded = await loadChange(root, changeId);
  if (!loaded.plan || !loaded.runtime.sealed) {
    throw new ForgeError(
      Codes.CHANGE_UNSEALED,
      `Change ${changeId} is not forged.`,
      'Seal and forge before preflight.',
    );
  }
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  const state = states[taskId] ?? 'BLOCKED';
  const blockers: string[] = [];
  if (state === 'BLOCKED') {
    blockers.push('Task is blocked by unmet dependencies.');
  }
  if (state !== 'READY' && state !== 'FAILED' && state !== 'RUNNING') {
    blockers.push(`Task is ${state} and cannot be executed.`);
  }
  const running = runningTasks(states).filter((id) => id !== taskId);
  if (running.length > 0) {
    blockers.push(`Worktree already has running task ${running.join(', ')}.`);
  }
  const lock = await readLock(loaded.dir, taskId);
  if (state === 'RUNNING' && lock) {
    blockers.push('Task is already RUNNING. Finish, wait for TTL, or exec reset.');
  }
  const isolation = loaded.config.git.isolation;
  if (isolation !== 'none') {
    if (!(await isGitRepo(cwd))) {
      blockers.push('Git isolation is enabled but this is not a git worktree.');
    } else {
      const actual = await gitIdentity(cwd);
      const recorded = await readWorkspace(loaded.dir);
      const expected = recorded ?? {
        isolation,
        branch: expectedBranch(loaded.config.git.branch_pattern, loaded.changeId),
        worktree: actual.worktree,
      };
      const match = workspaceMatches(isolation, expected, actual);
      if (!match.ok) {
        blockers.push(match.reason);
      }
    }
  }
  const phase = inferPhase(state);
  return {
    task: taskId,
    state,
    ready: blockers.length === 0 && (state === 'READY' || state === 'FAILED'),
    blockers,
    dependencies: task.depends_on.map((id) => ({ id, state: states[id] ?? 'BLOCKED' })),
    requirements: task.requirements,
    context: task.touches,
    validators:
      task.validators.length > 0 ? task.validators : loaded.config.workflow.exec.validators,
    availableTools: toolsForPhase(loaded.config, phase).map((tool) => tool.id),
    phase,
  };
}

export async function agentContext(root: string, changeId: string, taskId: string) {
  const loaded = await loadChange(root, changeId);
  if (!loaded.plan || !loaded.runtime.sealed) {
    throw new ForgeError(Codes.CHANGE_UNSEALED, `Change ${changeId} is not forged.`);
  }
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  const state = states[taskId] ?? 'BLOCKED';
  const phase = inferPhase(state);
  const reqs =
    loaded.change?.requirements.filter((requirement) =>
      task.requirements.includes(requirement.id),
    ) ?? [];
  const evidence = await latestEvidence(loaded.dir, taskId);
  let fresh: boolean | undefined;
  if (evidence) {
    const fingerprint = await fingerprintTask(root, task);
    fresh = isEvidenceFresh(evidence, fingerprint, currentPlanHash(loaded.plan));
  }
  return {
    changeId: loaded.changeId,
    task,
    state,
    requirements: reqs,
    decisions: loaded.change?.decisions ?? [],
    dependencyStates: Object.fromEntries(task.depends_on.map((id) => [id, states[id]])),
    suggestedPaths: task.touches,
    validators:
      task.validators.length > 0 ? task.validators : loaded.config.workflow.exec.validators,
    availableTools: toolsForPhase(loaded.config, phase).map((tool) => tool.id),
    guidance: loaded.config.workflow.explore.guidance,
    evidenceFresh: fresh,
  };
}

export async function inspectRepository(
  root: string,
  task?: PlanTask,
): Promise<{ files: string[] }> {
  const all = await walkRelativeFiles(root);
  if (!task || task.touches.length === 0) {
    return { files: all.slice(0, 200) };
  }
  return {
    files: all.filter((file) => task.touches.some((glob) => globMatches(glob, file))),
  };
}

export async function inspectEvidence(loaded: LoadedChange, taskId: string) {
  const records = await listEvidence(loaded.dir, taskId);
  const latest = records[records.length - 1];
  return {
    taskId,
    count: records.length,
    latest: latest
      ? {
          attempt_id: latest.attempt_id,
          git_sha: latest.git_sha,
          fingerprint: latest.fingerprint,
          validators: latest.validators.map((item) => ({
            name: item.name,
            status: item.status,
          })),
          tools: latest.tools ?? [],
        }
      : undefined,
  };
}

export async function inspectDependencies(loaded: LoadedChange, taskId: string) {
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  return {
    task: taskId,
    depends_on: task.depends_on.map((id) => ({ id, state: states[id] ?? 'BLOCKED' })),
    depends_on_state: task.depends_on_state ?? 'verified',
  };
}

export async function validateWorkspaceTool(
  root: string,
  cwd: string,
  changeId: string,
): Promise<unknown> {
  return await workspaceCheck(root, cwd, changeId);
}
