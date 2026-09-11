import { describe, expect, it } from 'vitest';
import { getWorkflowTemplates, WORKFLOW_IDS } from '../../src/skills/workflows/templates.js';
import { SPECIALISTS } from '../../src/skills/specialists/index.js';

const REQUIRED_SPECIALISTS = [
  'architecture',
  'flow',
  'testing',
  'security',
  'data',
  'migration',
  'observability',
  'concurrency',
  'performance',
  'frontend',
];

describe('canonical workflow skill inventory', () => {
  it('exposes exactly the five canonical workflow skills, in order', () => {
    expect(WORKFLOW_IDS).toEqual(['explore', 'propose', 'forge', 'exec', 'archive']);
    expect(getWorkflowTemplates().map((t) => t.id)).toEqual([
      'explore',
      'propose',
      'forge',
      'exec',
      'archive',
    ]);
  });

  it('gives every workflow skill a distinct, non-empty name and description', () => {
    const templates = getWorkflowTemplates();
    const names = new Set(templates.map((t) => t.name));
    expect(names.size).toBe(templates.length);
    for (const template of templates) {
      expect(template.description.length).toBeGreaterThan(20);
      expect(template.instructions.length).toBeGreaterThan(200);
    }
  });
});

describe('specialist skill inventory', () => {
  it('includes at least the required specialist set', () => {
    const ids = SPECIALISTS.map((s) => s.id);
    for (const required of REQUIRED_SPECIALISTS) {
      expect(ids).toContain(required);
    }
  });

  it('gives every specialist a real description and a substantive checklist', () => {
    for (const specialist of SPECIALISTS) {
      expect(specialist.description.length).toBeGreaterThan(20);
      expect(specialist.checklist.length).toBeGreaterThanOrEqual(4);
      for (const item of specialist.checklist) {
        expect(item.length).toBeGreaterThan(10);
      }
    }
  });

  it('has no duplicate specialist ids', () => {
    const ids = SPECIALISTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
