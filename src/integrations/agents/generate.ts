import {
  generateSkillMarkdown,
  getWorkflowTemplates,
  type SkillTemplate,
} from '../../skills/workflows/templates.js';
import { VERSION } from '../../version.js';

export type ToolId = 'cursor' | 'claude' | 'codex';

export interface GeneratedFile {
  relativePath: string;
  contents: string;
  workflowId: string;
}

export interface ToolAdapter {
  id: ToolId;
  invocation: (workflowId: string) => string;
  filesFor: (template: SkillTemplate, generatedBy: string) => GeneratedFile[];
}

function commandBody(template: SkillTemplate, invocation: string): string {
  return `---
description: ${template.description}
---

# ${invocation}

${template.instructions}

Always drive state through the \`forgespec\` CLI. Do not treat Markdown checkboxes as task state.
`;
}

export const adapters: ToolAdapter[] = [
  {
    id: 'cursor',
    invocation: (workflowId) => `/forge-${workflowId}`,
    filesFor(template, generatedBy) {
      return [
        {
          workflowId: template.id,
          relativePath: `.cursor/skills/${template.name}/SKILL.md`,
          contents: generateSkillMarkdown(template, generatedBy),
        },
        {
          workflowId: template.id,
          relativePath: `.cursor/commands/forge-${template.id}.md`,
          contents: commandBody(template, `/forge-${template.id}`),
        },
      ];
    },
  },
  {
    id: 'claude',
    invocation: (workflowId) => `/forge:${workflowId}`,
    filesFor(template, generatedBy) {
      return [
        {
          workflowId: template.id,
          relativePath: `.claude/skills/${template.name}/SKILL.md`,
          contents: generateSkillMarkdown(template, generatedBy),
        },
      ];
    },
  },
  {
    id: 'codex',
    invocation: (workflowId) => `$forgespec-${workflowId}`,
    filesFor(template, _generatedBy) {
      return [
        {
          workflowId: template.id,
          relativePath: `.codex/prompts/forgespec-${template.id}.md`,
          contents: commandBody(template, `$forgespec-${template.id}`),
        },
      ];
    },
  },
];

export function generateToolFiles(tools: ToolId[], generatedBy = VERSION): GeneratedFile[] {
  const selected = adapters.filter((adapter) => tools.includes(adapter.id));
  const templates = getWorkflowTemplates();
  return selected.flatMap((adapter) =>
    templates.flatMap((template) => adapter.filesFor(template, generatedBy)),
  );
}

export function canonicalSkillBodies(generatedBy = VERSION): Record<string, string> {
  const out: Record<string, string> = {};
  for (const template of getWorkflowTemplates()) {
    out[template.id] = generateSkillMarkdown(template, generatedBy);
  }
  return out;
}
