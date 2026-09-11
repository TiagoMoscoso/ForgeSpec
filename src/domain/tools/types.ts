export const TOOL_PHASES = ['explore', 'propose', 'forge', 'exec', 'archive'] as const;
export type ToolPhase = (typeof TOOL_PHASES)[number];

export const TOOL_RISKS = ['read', 'write', 'destructive'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export const TOOL_PARAM_TYPES = [
  'string',
  'integer',
  'boolean',
  'enum',
  'path',
  'task-id',
] as const;
export type ToolParamType = (typeof TOOL_PARAM_TYPES)[number];

export const TOOL_PARAM_SOURCES = [
  'cli',
  'task.id',
  'task.title',
  'task.kind',
  'task.touches',
  'change.id',
] as const;
export type ToolParamSource = (typeof TOOL_PARAM_SOURCES)[number];

export interface ToolParameterSpec {
  type: ToolParamType;
  required: boolean;
  default?: string | number | boolean;
  enum?: string[];
  source: ToolParamSource;
}

export interface ToolEvidenceSpec {
  type: 'test' | 'command' | 'none';
}

export interface ToolDefinition {
  id: string;
  origin: 'builtin' | 'project';
  executable: string;
  args: string[];
  cwd?: string;
  phases: ToolPhase[];
  timeout?: string;
  timeout_ms?: number;
  risk: ToolRisk;
  confirm?: boolean;
  resources: string[];
  parameters: Record<string, ToolParameterSpec>;
  env: string[];
  evidence?: ToolEvidenceSpec;
  description?: string;
}

export interface ResolvedToolPlan {
  tool: string;
  origin: 'builtin' | 'project';
  executable: string;
  args: string[];
  cwd: string;
  phase: ToolPhase;
  risk: ToolRisk;
  timeoutMs: number;
  resources: string[];
  evidenceType: 'test' | 'command' | 'none';
  builtin: boolean;
}

export const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const TOOL_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
