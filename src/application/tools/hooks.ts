import type { ForgeConfig } from '../../infrastructure/config/schema.js';
import type { ToolPhase } from '../../domain/tools/types.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { runTool } from './run.js';

export async function runWorkflowHooks(
  _config: ForgeConfig,
  hooks: Array<{ tool: string }>,
  options: {
    root: string;
    cwd: string;
    changeId: string;
    taskId: string;
    phase: ToolPhase;
  },
): Promise<void> {
  for (const hook of hooks) {
    try {
      await runTool({
        root: options.root,
        cwd: options.cwd,
        toolId: hook.tool,
        changeId: options.changeId,
        taskId: options.taskId,
        phase: options.phase,
        confirm: true,
      });
    } catch (error) {
      throw new ForgeError(
        Codes.TOOL_HOOK,
        `Workflow hook '${hook.tool}' failed in ${options.phase}.`,
        'Fix the hook tool. Hooks cannot bypass the state machine or validators.',
        {
          tool: hook.tool,
          phase: options.phase,
          cause: error instanceof ForgeError ? error.message : String(error),
        },
      );
    }
  }
}
