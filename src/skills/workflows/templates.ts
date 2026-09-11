export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export const WORKFLOW_IDS = ['explore', 'propose', 'forge', 'exec', 'archive'] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export function getExploreInstructions(): string {
  return `Optional thinking mode. Inspect the repository, compare approaches, and surface risks.

Rules:
- Never implement production code.
- Never write forgespec runtime files.
- Prefer repository evidence over assumptions.
- If the user is ready to specify work, stop and recommend \`/forge:propose\`.

Load project context only as needed via \`forgespec status --json\` once a change exists.`;
}

export function getProposeInstructions(): string {
  return `Architect-grade convergence before implementation.

Steps:
1. Inspect relevant source, tests, docs, and \`forgespec/specs/\`.
2. Run configured specialist checklists: \`forgespec skill <name> --json\` (architecture, flow, testing, ...). Specialists must not create extra Markdown files; merge findings into change.md.
3. Discuss material decisions with the user. Do not invent assumptions.
4. Write exactly one contract: \`forgespec/changes/<id>/change.md\` with YAML frontmatter (id, title), Intent, Scope, Requirements (### REQ-... with Acceptance and Kind), and Open questions (None when sealed).
5. Do not write proposal.md, design.md, or tasks.md.
6. Seal with \`forgespec propose seal --change <id> --json\`. If it fails, fix the contract. Unresolved material questions block sealing.

Refuse to seal when material questions remain.`;
}

export function getForgeInstructions(): string {
  return `Compile change.md into an executable task graph.

Steps:
1. Read \`forgespec/changes/<id>/change.md\` and the repository.
2. Draft \`plan.yaml\` with stable task ids, requirement coverage, depends_on, acceptance, validators, touches, and locks. One task should be small enough for a single exec.
3. Ground tasks in this repository. Reject placeholder "inspect code" tasks.
4. Run \`forgespec forge --change <id> --json\`. If validation fails, fix the plan (coverage, cycles, acceptance).
5. Do not persist execution-order.md. Use \`forgespec waves --json\` as a derived view.
6. If a sealed plan must change, use \`forgespec forge --replan\` only after no task is RUNNING.`;
}

export function getExecInstructions(): string {
  return `Execute exactly one task.

Steps:
1. \`forgespec ready --json\` and pick one READY task.
2. \`forgespec exec start <task> --json\`. If preflight fails, stop.
3. Load only the returned context (task, linked requirements, decisions, dependency outputs, suggested paths). Do not dump all specs.
4. Implement that task only. Do not start a second task in this invocation.
5. \`forgespec exec finish <task> --json\` so validators and evidence are recorded. Agent assertion is not completion.
6. Stop. Suggest archive only if finish succeeded.

Never edit runtime/*.json by hand. Never tick Markdown checkboxes as task state.`;
}

export function getArchiveInstructions(): string {
  return `Verify delivery before accepting a task.

Steps:
1. \`forgespec evidence <task> --json\` and confirm freshness.
2. If archive validators include spec-compliance or code-review, produce a JSON review and \`forgespec review submit <task> --validator <name> --file <review.json>\`. Critical findings must be 0. Semantic review is not an exit code.
3. \`forgespec archive <task> --json\`. This fails closed. There is no \`--yes\` bypass. Allowed bypass is \`--waiver <validator> --reason <auditable reason>\`.
4. If \`forgespec ready --json\` reports closeReady, merge requirements into \`forgespec/specs/\` using runtime/spec-sync.json after a close attempt, then \`forgespec close --change <id> --json\`.

Do not move files by hand. Archive is a quality gate.`;
}

export function getWorkflowTemplates(): SkillTemplate[] {
  return [
    {
      id: 'explore',
      name: 'forge-explore',
      description:
        'Explore the repository and problem without implementing. Use before propose when the approach is unclear.',
      instructions: getExploreInstructions(),
    },
    {
      id: 'propose',
      name: 'forge-propose',
      description:
        'Write and seal a ForgeSpec change.md contract. Use when the user wants to specify a change.',
      instructions: getProposeInstructions(),
    },
    {
      id: 'forge',
      name: 'forge-forge',
      description:
        'Compile a sealed change.md into plan.yaml via the ForgeSpec CLI. Use after propose seal.',
      instructions: getForgeInstructions(),
    },
    {
      id: 'exec',
      name: 'forge-exec',
      description:
        'Execute exactly one ForgeSpec task with CLI preflight, validators, and evidence.',
      instructions: getExecInstructions(),
    },
    {
      id: 'archive',
      name: 'forge-archive',
      description:
        'Archive a ForgeSpec task through the fail-closed evidence gate, then close the change when ready.',
      instructions: getArchiveInstructions(),
    },
  ];
}

export function generateSkillMarkdown(template: SkillTemplate, generatedBy: string): string {
  return `---
name: ${template.name}
description: ${template.description}
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "${generatedBy}"
---

${template.instructions}
`;
}
