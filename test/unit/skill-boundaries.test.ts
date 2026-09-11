import { describe, expect, it } from 'vitest';
import { getWorkflowTemplates } from '../../src/skills/workflows/templates.js';
import { SPECIALISTS } from '../../src/skills/specialists/index.js';

// The real forgespec command surface (src/cli/program.ts). Skill prose must
// never reference a command outside this set.
const ONE_WORD_COMMANDS = new Set([
  'init',
  'update',
  'status',
  'validate',
  'graph',
  'waves',
  'ready',
  'context',
  'evidence',
  'skill',
  'forge',
  'archive',
  'close',
]);
const TWO_WORD_COMMANDS = new Set([
  'propose seal',
  'exec start',
  'exec finish',
  'exec reset',
  'review submit',
  'workspace setup',
  'workspace check',
  'tool list',
  'tool inspect',
  'tool run',
  'agent preflight',
  'agent context',
  'task cancel',
]);

const FORBIDDEN_FILENAMES = [
  'proposal.md',
  'design.md',
  'tasks.md',
  'execution-order.md',
  'progress.md',
];

function allInstructions(): { source: string; text: string }[] {
  return getWorkflowTemplates().map((t) => ({ source: t.name, text: t.instructions }));
}

function extractCommandInvocations(text: string): string[] {
  const matches: string[] = [];
  const backtickSpans = text.match(/`[^`]*`/g) ?? [];
  for (const span of backtickSpans) {
    const inner = span.slice(1, -1).trim();
    const tokens = inner.split(/\s+/);
    if (tokens[0] === 'forgespec') {
      matches.push(inner);
    }
  }
  return matches;
}

describe('skills never reference a nonexistent forgespec command', () => {
  it('every `forgespec ...` invocation resolves to a real CLI command', () => {
    const sources = [
      ...allInstructions(),
      ...SPECIALISTS.map((s) => ({ source: `specialist:${s.id}`, text: s.checklist.join(' ') })),
    ];
    const violations: string[] = [];
    for (const { source, text } of sources) {
      for (const invocation of extractCommandInvocations(text)) {
        const tokens = invocation.split(/\s+/).slice(1); // drop leading "forgespec"
        const twoWord = tokens.slice(0, 2).join(' ');
        const oneWord = tokens[0] ?? '';
        if (!TWO_WORD_COMMANDS.has(twoWord) && !ONE_WORD_COMMANDS.has(oneWord)) {
          violations.push(`${source}: "${invocation}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('skills never instruct creating a forbidden artifact', () => {
  it('proposal.md/design.md/tasks.md/execution-order.md/progress.md only ever appear as a prohibition', () => {
    const text = allInstructions()
      .map((t) => t.text)
      .join('\n');
    const violations: string[] = [];
    for (const line of text.split('\n')) {
      for (const filename of FORBIDDEN_FILENAMES) {
        if (line.toLowerCase().includes(filename)) {
          if (!/\b(not|never)\b/i.test(line)) {
            violations.push(line);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('workflow skill boundaries', () => {
  it('forge-explore refuses to implement', () => {
    const explore = getWorkflowTemplates().find((t) => t.id === 'explore')!;
    expect(explore.instructions).toMatch(/do not implement/i);
    expect(explore.instructions).toMatch(/never create `forgespec\/changes/i);
  });

  it('forge-propose blocks sealing on material ambiguity', () => {
    const propose = getWorkflowTemplates().find((t) => t.id === 'propose')!;
    expect(propose.instructions).toMatch(/material question/i);
    expect(propose.instructions).toMatch(/never invent an assumption/i);
  });

  it('forge-exec executes exactly one task', () => {
    const exec = getWorkflowTemplates().find((t) => t.id === 'exec')!;
    expect(exec.instructions).toMatch(/exactly one task/i);
    expect(exec.instructions).toMatch(/do not start a second task/i);
  });

  it('forge-archive is fail-closed with no blanket bypass', () => {
    const archive = getWorkflowTemplates().find((t) => t.id === 'archive')!;
    expect(archive.instructions).toMatch(/fails? closed/i);
    expect(archive.instructions).toContain('no `--yes`');
  });
});
