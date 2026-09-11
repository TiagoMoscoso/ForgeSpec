import { createHash } from 'node:crypto';
import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { Requirement } from '../change/types.js';
import { globsOverlap } from './globs.js';
import { taskBodyHashPayload } from './parse.js';
import type { Plan, PlanTask, TaskGraph } from './types.js';

const PLACEHOLDER = /\b(todo|tbd|placeholder|inspect code|look at the code|generic task)\b/i;

export function hashPlan(plan: Plan): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({ change_id: plan.change_id, tasks: plan.tasks.map(taskBodyHashPayload) }),
  );
  return hash.digest('hex');
}

export function hashTask(task: PlanTask): string {
  return createHash('sha256')
    .update(JSON.stringify(taskBodyHashPayload(task)))
    .digest('hex');
}

function detectCycle(tasks: PlanTask[]): string | undefined {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(id: string): string | undefined {
    visited.add(id);
    stack.add(id);
    const task = byId.get(id);
    if (!task) {
      return undefined;
    }
    for (const dep of task.depends_on) {
      if (!visited.has(dep)) {
        parent.set(dep, id);
        const cycle = dfs(dep);
        if (cycle) {
          return cycle;
        }
      } else if (stack.has(dep)) {
        const path = [dep];
        let current = id;
        while (current !== dep) {
          path.unshift(current);
          current = parent.get(current) ?? dep;
          if (path[0] === current) {
            break;
          }
        }
        path.unshift(dep);
        return path.join(' → ');
      }
    }
    stack.delete(id);
    return undefined;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      const cycle = dfs(task.id);
      if (cycle) {
        return cycle;
      }
    }
  }
  return undefined;
}

export function computeWaves(tasks: PlanTask[]): string[][] {
  const remaining = new Map(tasks.map((task) => [task.id, new Set(task.depends_on)]));
  const waves: string[][] = [];
  const placed = new Set<string>();

  while (placed.size < tasks.length) {
    const wave = [...remaining.entries()]
      .filter(([id, deps]) => !placed.has(id) && [...deps].every((dep) => placed.has(dep)))
      .map(([id]) => id)
      .sort();
    if (wave.length === 0) {
      break;
    }
    waves.push(wave);
    for (const id of wave) {
      placed.add(id);
      remaining.delete(id);
    }
  }
  return waves;
}

export function declaredConflicts(
  tasks: PlanTask[],
): Array<{ left: string; right: string; reason: string }> {
  const conflicts: Array<{ left: string; right: string; reason: string }> = [];
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const left = tasks[i]!;
      const right = tasks[j]!;
      const lockHit = left.locks.find((lock) => right.locks.includes(lock));
      if (lockHit) {
        conflicts.push({ left: left.id, right: right.id, reason: `shared lock ${lockHit}` });
        continue;
      }
      const overlap = left.touches.find((glob) =>
        right.touches.some((other) => globsOverlap(glob, other)),
      );
      if (overlap) {
        conflicts.push({
          left: left.id,
          right: right.id,
          reason: `overlapping touches (${overlap})`,
        });
      }
    }
  }
  return conflicts;
}

export function compileTaskGraph(plan: Plan, requirements: Requirement[]): TaskGraph {
  const byId = new Map<string, PlanTask>();
  for (const task of plan.tasks) {
    if (byId.has(task.id)) {
      throw new ForgeError(
        Codes.PLAN_DUP_TASK,
        `Duplicate task id ${task.id}.`,
        'Give every task a unique id.',
      );
    }
    byId.set(task.id, task);
  }

  const reqById = new Map(requirements.map((requirement) => [requirement.id, requirement]));

  for (const task of plan.tasks) {
    for (const dep of task.depends_on) {
      if (!byId.has(dep)) {
        throw new ForgeError(
          Codes.PLAN_BAD_DEP,
          `Task ${task.id} depends on unknown task ${dep}.`,
          'depends_on must reference task ids in this plan.',
        );
      }
    }
    for (const reqId of task.requirements) {
      if (!reqById.has(reqId)) {
        throw new ForgeError(
          Codes.PLAN_MISSING_REQ,
          `Task ${task.id} references unknown requirement ${reqId}.`,
          'Requirement ids in plan.yaml must exist in change.md.',
        );
      }
    }
    if (task.kind === 'implement' && task.acceptance.length === 0) {
      throw new ForgeError(
        Codes.PLAN_ACCEPTANCE,
        `Implementation task ${task.id} has no acceptance criteria.`,
        'Add acceptance: entries to the task.',
      );
    }
    if (PLACEHOLDER.test(task.title) || /inspect the repository/i.test(task.title)) {
      throw new ForgeError(
        Codes.PLAN_PLACEHOLDER,
        `Task ${task.id} looks like a placeholder (${task.title}).`,
        'Replace generic inspect-code tasks with grounded, repository-specific work.',
      );
    }
    if (task.kind === 'implement' && task.requirements.length === 0) {
      throw new ForgeError(
        Codes.PLAN_ORPHAN,
        `Implementation task ${task.id} covers no requirements.`,
        'Link the task to at least one requirement or change its kind.',
      );
    }
  }

  const cycle = detectCycle(plan.tasks);
  if (cycle) {
    throw new ForgeError(
      Codes.PLAN_CYCLE,
      `Task dependency cycle detected: ${cycle}.`,
      'Remove the cycle so the graph is a DAG.',
      { cycle },
    );
  }

  const coverage: Record<string, string[]> = {};
  for (const requirement of requirements) {
    coverage[requirement.id] = plan.tasks
      .filter((task) => task.requirements.includes(requirement.id))
      .map((task) => task.id);
  }
  for (const requirement of requirements) {
    if (requirement.kind === 'mandatory' && (coverage[requirement.id] ?? []).length === 0) {
      throw new ForgeError(
        Codes.PLAN_UNCOVERED,
        `Requirement ${requirement.id} has no task coverage.`,
        `Add a task that lists ${requirement.id} under requirements.`,
        { requirement: requirement.id },
      );
    }
  }

  return {
    plan,
    byId,
    waves: computeWaves(plan.tasks),
    coverage,
  };
}

export function tasksConflict(left: PlanTask, right: PlanTask): boolean {
  if (left.id === right.id) {
    return false;
  }
  if (left.locks.some((lock) => right.locks.includes(lock))) {
    return true;
  }
  return left.touches.some((glob) => right.touches.some((other) => globsOverlap(glob, other)));
}
