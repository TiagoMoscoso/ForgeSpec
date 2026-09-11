import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { stringify as stringifyYaml } from 'yaml';
import { parseChangeMarkdown } from '../../domain/change/parse.js';
import type { ChangeContract, ChangePhase } from '../../domain/change/types.js';
import { compileTaskGraph, hashPlan } from '../../domain/task-graph/graph.js';
import { parsePlanDocument } from '../../domain/task-graph/parse.js';
import type { Plan, TaskGraph } from '../../domain/task-graph/types.js';
import type { EvidenceRecord, WaiverRecord } from '../../domain/evidence/types.js';
import { type TaskState, isTaskState } from '../../domain/task-state/machine.js';
import type { WorkspaceRecord } from '../../domain/workspace/policy.js';
import {
  appendLineAtomic,
  readJsonFile,
  writeJsonAtomic,
  writeFileAtomic,
} from '../filesystem/atomic.js';
import { changeDir, changesDir } from '../project/layout.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { loadResolvedConfig } from '../config/load.js';
import type { ForgeConfig } from '../config/schema.js';

export interface ChangeRuntime {
  changeId: string;
  phase: ChangePhase;
  sealed: boolean;
  changeHash?: string;
  planHash?: string;
  sealedAt?: string;
  forgedAt?: string;
  specSyncWritten?: boolean;
}

export interface TaskEvent {
  at: string;
  type: string;
  from?: TaskState;
  to?: TaskState;
  command: string;
  reason?: string;
}

export interface TaskLock {
  taskId: string;
  pid: number;
  hostname: string;
  worktree: string;
  acquiredAt: string;
  expiresAt: string;
  filesAtStart: string[];
}

export interface LoadedChange {
  root: string;
  changeId: string;
  dir: string;
  config: ForgeConfig;
  change?: ChangeContract;
  plan?: Plan;
  graph?: TaskGraph;
  runtime: ChangeRuntime;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function runtimeDir(changePath: string): string {
  return path.join(changePath, 'runtime');
}

export function taskRuntimeDir(changePath: string, taskId: string): string {
  return path.join(runtimeDir(changePath), 'tasks', taskId);
}

export function evidenceDir(changePath: string, taskId: string): string {
  return path.join(runtimeDir(changePath), 'evidence', taskId);
}

export async function listChangeIds(root: string): Promise<string[]> {
  try {
    const entries = await readdir(changesDir(root), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function resolveChangeId(root: string, requested?: string): Promise<string> {
  if (requested) {
    return requested;
  }
  const ids = await listChangeIds(root);
  if (ids.length === 0) {
    throw new ForgeError(
      Codes.CHANGE_NOT_FOUND,
      'No active changes found.',
      'Create a change directory under forgespec/changes/.',
    );
  }
  if (ids.length > 1) {
    throw new ForgeError(
      Codes.CHANGE_AMBIGUOUS,
      `Multiple changes found: ${ids.join(', ')}.`,
      'Pass --change <id>.',
      { changes: ids },
    );
  }
  return ids[0]!;
}

export async function readRuntime(changePath: string, changeId: string): Promise<ChangeRuntime> {
  const stored = await readJsonFile<ChangeRuntime>(
    path.join(runtimeDir(changePath), 'change.json'),
  );
  return stored ?? { changeId, phase: 'exploring', sealed: false };
}

export async function writeRuntime(changePath: string, runtime: ChangeRuntime): Promise<void> {
  await writeJsonAtomic(path.join(runtimeDir(changePath), 'change.json'), runtime);
}

export async function loadChange(root: string, changeId: string): Promise<LoadedChange> {
  const dir = changeDir(root, changeId);
  const config = await loadResolvedConfig(root, changeId);
  const runtime = await readRuntime(dir, changeId);
  let change: ChangeContract | undefined;
  try {
    const raw = await readFile(path.join(dir, 'change.md'), 'utf8');
    change = parseChangeMarkdown(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  let plan: Plan | undefined;
  let graph: TaskGraph | undefined;
  try {
    const raw = await readFile(path.join(dir, 'plan.yaml'), 'utf8');
    plan = parsePlanDocument(parseYaml(raw));
    if (change) {
      graph = compileTaskGraph(plan, change.requirements);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return { root, changeId, dir, config, change, plan, graph, runtime };
}

export async function writePlan(changePath: string, plan: Plan): Promise<void> {
  await writeFileAtomic(path.join(changePath, 'plan.yaml'), stringifyYaml(plan));
}

export async function derivedTaskState(changePath: string, taskId: string): Promise<TaskState> {
  const events = await readEvents(changePath, taskId);
  let state: TaskState = 'BLOCKED';
  for (const event of events) {
    if (event.to && isTaskState(event.to)) {
      state = event.to;
    }
  }
  return state;
}

export async function readEvents(changePath: string, taskId: string): Promise<TaskEvent[]> {
  try {
    const raw = await readFile(
      path.join(taskRuntimeDir(changePath, taskId), 'events.jsonl'),
      'utf8',
    );
    return raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as TaskEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function appendEvent(
  changePath: string,
  taskId: string,
  event: Omit<TaskEvent, 'at'>,
): Promise<void> {
  const full: TaskEvent = { at: nowIso(), ...event };
  await appendLineAtomic(
    path.join(taskRuntimeDir(changePath, taskId), 'events.jsonl'),
    JSON.stringify(full),
  );
  await writeJsonAtomic(path.join(taskRuntimeDir(changePath, taskId), 'state.json'), {
    state: full.to ?? 'BLOCKED',
    updatedAt: full.at,
  });
}

export async function allTaskStates(loaded: LoadedChange): Promise<Record<string, TaskState>> {
  const states: Record<string, TaskState> = {};
  if (!loaded.plan) {
    return states;
  }
  for (const task of loaded.plan.tasks) {
    states[task.id] = await derivedTaskState(loaded.dir, task.id);
  }
  return states;
}

export async function readLock(changePath: string, taskId: string): Promise<TaskLock | undefined> {
  return await readJsonFile<TaskLock>(path.join(taskRuntimeDir(changePath, taskId), 'lock.json'));
}

export async function writeLock(changePath: string, lock: TaskLock): Promise<void> {
  await writeJsonAtomic(path.join(taskRuntimeDir(changePath, lock.taskId), 'lock.json'), lock);
}

export async function clearLock(changePath: string, taskId: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  try {
    await unlink(path.join(taskRuntimeDir(changePath, taskId), 'lock.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function lockExpired(lock: TaskLock, now = Date.now()): boolean {
  return Date.parse(lock.expiresAt) <= now;
}

export async function listEvidence(changePath: string, taskId: string): Promise<EvidenceRecord[]> {
  try {
    const dir = evidenceDir(changePath, taskId);
    const entries = await readdir(dir);
    const records: EvidenceRecord[] = [];
    for (const name of entries.filter((entry) => entry.endsWith('.json')).sort()) {
      const record = await readJsonFile<EvidenceRecord>(path.join(dir, name));
      if (record) {
        records.push(record);
      }
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function latestEvidence(
  changePath: string,
  taskId: string,
): Promise<EvidenceRecord | undefined> {
  const records = await listEvidence(changePath, taskId);
  return records[records.length - 1];
}

export async function writeEvidence(changePath: string, record: EvidenceRecord): Promise<string> {
  const file = path.join(evidenceDir(changePath, record.task_id), `${record.attempt_id}.json`);
  try {
    await writeJsonAtomic(file, record);
    return file;
  } catch (error) {
    throw new ForgeError(
      Codes.EVIDENCE_WRITE,
      `Failed to write evidence for ${record.task_id}.`,
      'Fix filesystem permissions and re-run exec finish. State was not advanced.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export async function readWaivers(changePath: string): Promise<WaiverRecord[]> {
  return (
    (await readJsonFile<WaiverRecord[]>(path.join(runtimeDir(changePath), 'waivers.json'))) ?? []
  );
}

export async function addWaiver(changePath: string, waiver: WaiverRecord): Promise<void> {
  if (waiver.reason.trim().length < 8) {
    throw new ForgeError(
      Codes.ARCHIVE_INCOMPLETE,
      'Waiver reason must be at least 8 characters.',
      'Provide an auditable reason. --yes is not a bypass.',
    );
  }
  const current = await readWaivers(changePath);
  current.push(waiver);
  await writeJsonAtomic(path.join(runtimeDir(changePath), 'waivers.json'), current);
}

export async function readWorkspace(changePath: string): Promise<WorkspaceRecord | undefined> {
  return await readJsonFile<WorkspaceRecord>(path.join(runtimeDir(changePath), 'workspace.json'));
}

export async function writeWorkspace(changePath: string, record: WorkspaceRecord): Promise<void> {
  await writeJsonAtomic(path.join(runtimeDir(changePath), 'workspace.json'), record);
}

export async function writeSpecSync(changePath: string, payload: unknown): Promise<void> {
  await writeJsonAtomic(path.join(runtimeDir(changePath), 'spec-sync.json'), payload);
}

export function currentPlanHash(plan: Plan): string {
  return hashPlan(plan);
}

export function runningTasks(states: Record<string, TaskState>): string[] {
  return Object.entries(states)
    .filter(([, state]) => state === 'RUNNING')
    .map(([id]) => id);
}
