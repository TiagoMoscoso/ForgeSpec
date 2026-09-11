import { describe, expect, it } from 'vitest';
import { applyDerivedStates } from '../../src/application/derived-state.js';
import { SAMPLE_PLAN } from '../helpers/fixture.js';

describe('derived task state', () => {
  it('marks independent tasks READY', () => {
    const states = applyDerivedStates(SAMPLE_PLAN.tasks, { T01: 'BLOCKED' });
    expect(states.T01).toBe('READY');
  });

  it('keeps RUNNING as declared', () => {
    const states = applyDerivedStates(SAMPLE_PLAN.tasks, { T01: 'RUNNING' });
    expect(states.T01).toBe('RUNNING');
  });
});
