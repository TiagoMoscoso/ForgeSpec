import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';

export const TASK_STATES = [
  'BLOCKED',
  'READY',
  'RUNNING',
  'IMPLEMENTED',
  'FAILED',
  'VERIFIED',
  'ARCHIVED',
  'CANCELLED',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  BLOCKED: ['READY', 'CANCELLED'],
  READY: ['RUNNING', 'BLOCKED', 'CANCELLED'],
  RUNNING: ['IMPLEMENTED', 'FAILED', 'CANCELLED'],
  IMPLEMENTED: ['VERIFIED', 'FAILED', 'CANCELLED', 'RUNNING'],
  FAILED: ['RUNNING', 'CANCELLED'],
  VERIFIED: ['ARCHIVED', 'RUNNING'],
  ARCHIVED: ['READY'],
  CANCELLED: [],
};

export function isTaskState(value: string): value is TaskState {
  return (TASK_STATES as readonly string[]).includes(value);
}

export function canTransition(from: TaskState, to: TaskState, reopen = false): boolean {
  if (from === 'ARCHIVED' && to === 'READY') {
    return reopen;
  }
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskState, to: TaskState, reopen = false): void {
  if (!canTransition(from, to, reopen)) {
    throw new ForgeError(
      Codes.TASK_TRANSITION,
      `Illegal task state transition ${from} → ${to}.`,
      'Use the CLI to move task state; IMPLEMENTED, VERIFIED, and ARCHIVED are distinct.',
      { from, to },
    );
  }
}

export function satisfiedForDependency(
  state: TaskState,
  required: 'verified' | 'implemented' = 'verified',
): boolean {
  if (state === 'ARCHIVED' || state === 'VERIFIED') {
    return true;
  }
  if (required === 'implemented') {
    return state === 'IMPLEMENTED';
  }
  return false;
}

export function isTerminal(state: TaskState): boolean {
  return state === 'ARCHIVED' || state === 'CANCELLED';
}
