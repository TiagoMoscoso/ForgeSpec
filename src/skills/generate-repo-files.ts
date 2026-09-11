import { generateSkillMarkdown, getWorkflowTemplates } from './workflows/templates.js';
import { generateSpecialistMarkdown, SPECIALISTS } from './specialists/index.js';

export interface RepoSkillFile {
  relativePath: string;
  contents: string;
}

/**
 * Canonical set of files that should be checked into the repository's
 * top-level `skills/` directory. `src/skills/**` remains the source of
 * truth; these are a generated, human-browsable view of it.
 */
export function repoSkillFiles(generatedBy: string): RepoSkillFile[] {
  const workflowFiles = getWorkflowTemplates().map((template) => ({
    relativePath: `skills/${template.name}/SKILL.md`,
    contents: generateSkillMarkdown(template, generatedBy),
  }));
  const specialistFiles = SPECIALISTS.map((specialist) => ({
    relativePath: `skills/specialists/${specialist.id}/SKILL.md`,
    contents: generateSpecialistMarkdown(specialist, generatedBy),
  }));
  return [...workflowFiles, ...specialistFiles];
}
