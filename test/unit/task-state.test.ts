import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../../src/domain/task-state/machine.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';

describe('task state machine', () => {
  it('allows READY → RUNNING → IMPLEMENTED → VERIFIED → ARCHIVED', () => {
    assertTransition('READY', 'RUNNING');
    assertTransition('RUNNING', 'IMPLEMENTED');
    assertTransition('IMPLEMENTED', 'VERIFIED');
    assertTransition('VERIFIED', 'ARCHIVED');
  });

  it('rejects skipping verification', () => {
    expect(() => assertTransition('IMPLEMENTED', 'ARCHIVED')).toThrowError(ForgeError);
    try {
      assertTransition('IMPLEMENTED', 'ARCHIVED');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.TASK_TRANSITION);
    }
  });

  it('requires reopen to leave ARCHIVED', () => {
    expect(canTransition('ARCHIVED', 'READY')).toBe(false);
    expect(canTransition('ARCHIVED', 'READY', true)).toBe(true);
  });

  it('allows FAILED retry', () => {
    assertTransition('FAILED', 'RUNNING');
  });
});
