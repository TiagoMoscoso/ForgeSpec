import type { PlanTask } from '../domain/task-graph/types.js';
import { satisfiedForDependency, type TaskState } from '../domain/task-state/machine.js';

export function effectiveTaskState(
  declared: TaskState,
  task: PlanTask,
  states: Record<string, TaskState>,
): TaskState {
  if (
    declared === 'RUNNING' ||
    declared === 'IMPLEMENTED' ||
    declared === 'FAILED' ||
    declared === 'VERIFIED' ||
    declared === 'ARCHIVED' ||
    declared === 'CANCELLED'
  ) {
    return declared;
  }
  const required = task.depends_on_state ?? 'verified';
  const depsOk = task.depends_on.every((dep) =>
    satisfiedForDependency(states[dep] ?? 'BLOCKED', required),
  );
  return depsOk ? 'READY' : 'BLOCKED';
}

export function applyDerivedStates(
  tasks: PlanTask[],
  declared: Record<string, TaskState>,
): Record<string, TaskState> {
  const merged: Record<string, TaskState> = { ...declared };
  for (const task of tasks) {
    merged[task.id] = effectiveTaskState(declared[task.id] ?? 'BLOCKED', task, merged);
  }
  for (const task of tasks) {
    merged[task.id] = effectiveTaskState(merged[task.id] ?? 'BLOCKED', task, merged);
  }
  return merged;
}
