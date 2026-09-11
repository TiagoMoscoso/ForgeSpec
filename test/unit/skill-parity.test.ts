import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalSkillBodies, generateToolFiles } from '../../src/integrations/agents/generate.js';
import {
  generateSkillMarkdown,
  getWorkflowTemplates,
} from '../../src/skills/workflows/templates.js';
import { VERSION } from '../../src/version.js';

describe('skill generation parity', () => {
  it('keeps adapter skill files aligned with canonical templates', () => {
    const canonical = canonicalSkillBodies(VERSION);
    const files = generateToolFiles(['cursor', 'claude', 'codex'], VERSION);
    for (const template of getWorkflowTemplates()) {
      const expected = generateSkillMarkdown(template, VERSION);
      expect(canonical[template.id]).toBe(expected);
      const cursor = files.find((file) => file.relativePath.endsWith(`${template.name}/SKILL.md`));
      expect(cursor?.contents).toBe(expected);
    }
    expect(files.some((file) => file.relativePath.includes('.codex/prompts/'))).toBe(true);
  });

  it('hashes are stable for a given version', () => {
    const body = canonicalSkillBodies('0.1.0').explore!;
    const hash = createHash('sha256').update(body).digest('hex');
    expect(hash).toHaveLength(64);
  });
});
