import type { ForgeConfig } from '../../infrastructure/config/schema.js';
import type { ToolDefinition, ToolPhase } from '../../domain/tools/types.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';

const ALL_PHASES: ToolPhase[] = ['explore', 'propose', 'forge', 'exec', 'archive'];

function builtin(
  id: string,
  description: string,
  extra: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    executable: 'forgespec-builtin',
    args: [],
    phases: extra.phases ?? ALL_PHASES,
    risk: extra.risk ?? 'read',
    resources: extra.resources ?? [],
    parameters: extra.parameters ?? {},
    env: [],
    evidence: extra.evidence ?? { type: 'none' },
    ...extra,
    id,
    origin: 'builtin',
    description: extra.description ?? description,
  };
}

export function builtinTools(): ToolDefinition[] {
  return [
    builtin('task-preflight', 'Check whether a task can start without taking the lock.'),
    builtin('task-context', 'Return minimum sufficient context for one task.'),
    builtin('dependency-inspection', 'Show dependency ids and states for a task.'),
    builtin('repository-inspection', 'List repository files matching the task touches globs.'),
    builtin('git-diff', 'Show git diff --stat via argv (no shell).', {
      executable: 'git',
      args: ['diff', '--stat'],
      evidence: { type: 'command' },
    }),
    builtin('evidence-inspection', 'Summarize the latest evidence record for a task.'),
    builtin('workspace-validation', 'Verify git isolation for the current worktree.', {
      phases: ['exec', 'archive'],
    }),
  ];
}

export function projectTools(config: ForgeConfig): ToolDefinition[] {
  return Object.entries(config.tools).map(([id, spec]) => ({
    id,
    origin: 'project' as const,
    executable: spec.executable,
    args: spec.args,
    cwd: spec.cwd,
    phases: spec.phases,
    timeout: spec.timeout,
    timeout_ms: spec.timeout_ms,
    risk: spec.risk,
    confirm: spec.confirm,
    resources: spec.resources,
    parameters: spec.parameters,
    env: spec.env,
    evidence: spec.evidence,
    description: spec.description,
  }));
}

export function listTools(config: ForgeConfig): ToolDefinition[] {
  const builtins = builtinTools();
  const builtinIds = new Set(builtins.map((tool) => tool.id));
  const project = projectTools(config).filter((tool) => {
    if (builtinIds.has(tool.id)) {
      throw new ForgeError(
        Codes.CONFIG_INVALID,
        `Project tool '${tool.id}' collides with a built-in tool name.`,
        'Rename the project tool. Built-in tools cannot be overridden.',
      );
    }
    return true;
  });
  return [...builtins, ...project];
}

export function getTool(config: ForgeConfig, id: string): ToolDefinition {
  const tool = listTools(config).find((item) => item.id === id);
  if (!tool) {
    throw new ForgeError(
      Codes.TOOL_UNKNOWN,
      `Unknown tool '${id}'.`,
      'Run `forgespec tool list` and register the tool in config.yaml tools:. Scripts are never auto-exposed.',
    );
  }
  return tool;
}

export function toolsForPhase(config: ForgeConfig, phase: ToolPhase): ToolDefinition[] {
  return listTools(config).filter((tool) => tool.phases.includes(phase));
}
