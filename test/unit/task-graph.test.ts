import { describe, expect, it } from 'vitest';
import {
  compileTaskGraph,
  computeWaves,
  declaredConflicts,
} from '../../src/domain/task-graph/graph.js';
import { parsePlanDocument } from '../../src/domain/task-graph/parse.js';
import type { Requirement } from '../../src/domain/change/types.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { SAMPLE_PLAN } from '../helpers/fixture.js';

const req = (id: string, kind: 'mandatory' | 'optional' = 'mandatory'): Requirement => ({
  id,
  title: id,
  text: 'must',
  acceptance: ['x'],
  kind,
});

describe('task graph', () => {
  it('compiles a valid plan and computes a single wave', () => {
    const plan = parsePlanDocument(SAMPLE_PLAN);
    const graph = compileTaskGraph(plan, [req('REQ-AUTH-001')]);
    expect(graph.waves).toEqual([['T01']]);
    expect(graph.coverage['REQ-AUTH-001']).toEqual(['T01']);
  });

  it('rejects uncovered mandatory requirements', () => {
    const plan = parsePlanDocument(SAMPLE_PLAN);
    expect(() => compileTaskGraph(plan, [req('REQ-AUTH-001'), req('REQ-AUTH-002')])).toThrowError(
      ForgeError,
    );
    try {
      compileTaskGraph(plan, [req('REQ-AUTH-001'), req('REQ-AUTH-002')]);
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.PLAN_UNCOVERED);
    }
  });

  it('detects cycles', () => {
    const plan = parsePlanDocument({
      version: 1,
      change_id: 'add-token-validator',
      tasks: [
        { ...SAMPLE_PLAN.tasks[0], id: 'T01', depends_on: ['T02'] },
        { ...SAMPLE_PLAN.tasks[0], id: 'T02', depends_on: ['T01'] },
      ],
    });
    expect(() => compileTaskGraph(plan, [req('REQ-AUTH-001')])).toThrowError(ForgeError);
    try {
      compileTaskGraph(plan, [req('REQ-AUTH-001')]);
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.PLAN_CYCLE);
    }
  });

  it('computes waves in dependency order', () => {
    const waves = computeWaves([
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T01', depends_on: [] },
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T02', depends_on: ['T01'] },
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T03', depends_on: ['T01'] },
    ]);
    expect(waves[0]).toEqual(['T01']);
    expect(waves[1]).toEqual(['T02', 'T03']);
  });

  it('flags declared write conflicts', () => {
    const conflicts = declaredConflicts([
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T01', touches: ['src/auth/**'], locks: [] },
      { ...SAMPLE_PLAN.tasks[0]!, id: 'T02', touches: ['src/auth/token.ts'], locks: [] },
    ]);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('rejects placeholder inspect-code tasks', () => {
    const plan = parsePlanDocument({
      ...SAMPLE_PLAN,
      tasks: [{ ...SAMPLE_PLAN.tasks[0], title: 'Inspect code in src' }],
    });
    expect(() => compileTaskGraph(plan, [req('REQ-AUTH-001')])).toThrowError(ForgeError);
  });

  it('rejects unknown dependency references', () => {
    const plan = parsePlanDocument({
      ...SAMPLE_PLAN,
      tasks: [{ ...SAMPLE_PLAN.tasks[0], depends_on: ['T99'] }],
    });
    try {
      compileTaskGraph(plan, [req('REQ-AUTH-001')]);
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.PLAN_BAD_DEP);
    }
  });
});
