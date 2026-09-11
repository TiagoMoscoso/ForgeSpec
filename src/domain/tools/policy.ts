import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { ToolDefinition, ToolPhase, ToolRisk } from './types.js';

export function assertPhaseAllowed(tool: ToolDefinition, phase: ToolPhase): void {
  if (!tool.phases.includes(phase)) {
    throw new ForgeError(
      Codes.TOOL_PHASE,
      `Tool '${tool.id}' is not allowed in phase '${phase}'.`,
      `Allowed phases: ${tool.phases.join(', ')}.`,
      { tool: tool.id, phase, phases: tool.phases },
    );
  }
}

export function requiresConfirmation(tool: ToolDefinition): boolean {
  if (typeof tool.confirm === 'boolean') {
    return tool.confirm;
  }
  return tool.risk === 'destructive';
}

export function assertRiskAllowed(tool: ToolDefinition, confirmed: boolean): void {
  if (requiresConfirmation(tool) && !confirmed) {
    throw new ForgeError(
      Codes.TOOL_CONFIRM,
      `Tool '${tool.id}' is ${tool.risk} and requires --confirm.`,
      'Pass --confirm after reviewing the dry-run plan. Destructive tools never run silently.',
      { tool: tool.id, risk: tool.risk },
    );
  }
}

export function assertKnownRisk(risk: ToolRisk): void {
  if (risk !== 'read' && risk !== 'write' && risk !== 'destructive') {
    throw new ForgeError(Codes.TOOL_RISK, `Unknown risk class '${String(risk)}'.`);
  }
}
