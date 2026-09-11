import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { PlanTask } from '../task-graph/types.js';
import {
  TASK_ID_PATTERN,
  type ToolDefinition,
  type ToolParameterSpec,
  type ToolParamSource,
} from './types.js';

const PLACEHOLDER = /\$\{([A-Za-z][A-Za-z0-9_.]*)\}/g;
const DISALLOWED_IN_DATA = /[\0\r\n]/;
const BUILTIN_KEYS = new Set([
  'task.id',
  'task.title',
  'task.kind',
  'task.testPattern',
  'change.id',
]);

export interface ParamContext {
  changeId: string;
  task?: PlanTask;
  cli: Record<string, string>;
  root: string;
}

export function parseCliSets(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of values) {
    const eq = item.indexOf('=');
    if (eq <= 0) {
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Invalid --set '${item}'.`,
        'Use --set name=value. Values are data, never shell syntax.',
      );
    }
    const key = item.slice(0, eq);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
      throw new ForgeError(Codes.TOOL_PARAMS, `Invalid parameter name '${key}'.`);
    }
    out[key] = item.slice(eq + 1);
  }
  return out;
}

function sourceValue(spec: ToolParameterSpec, name: string, ctx: ParamContext): string | undefined {
  const source: ToolParamSource = spec.source;
  switch (source) {
    case 'cli':
      return undefined;
    case 'task.id':
      return ctx.task?.id;
    case 'task.title':
      return ctx.task?.title;
    case 'task.kind':
      return ctx.task?.kind;
    case 'task.touches':
      return ctx.task?.touches[0];
    case 'change.id':
      return ctx.changeId;
    default:
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Unsupported parameter source '${source}' for ${name}.`,
        'Use cli, task.id, task.title, task.kind, task.touches, or change.id.',
      );
  }
}

export function coerceParam(spec: ToolParameterSpec, name: string, raw: string): string {
  if (DISALLOWED_IN_DATA.test(raw)) {
    throw new ForgeError(
      Codes.TOOL_PARAMS,
      `Parameter '${name}' contains disallowed control characters.`,
    );
  }
  switch (spec.type) {
    case 'string':
      return raw;
    case 'integer': {
      if (!/^-?\d+$/.test(raw)) {
        throw new ForgeError(Codes.TOOL_PARAMS, `Parameter '${name}' must be an integer.`);
      }
      return raw;
    }
    case 'boolean': {
      if (raw === 'true' || raw === '1') {
        return 'true';
      }
      if (raw === 'false' || raw === '0') {
        return 'false';
      }
      throw new ForgeError(Codes.TOOL_PARAMS, `Parameter '${name}' must be a boolean.`);
    }
    case 'enum': {
      const allowed = spec.enum ?? [];
      if (!allowed.includes(raw)) {
        throw new ForgeError(
          Codes.TOOL_PARAMS,
          `Parameter '${name}' must be one of: ${allowed.join(', ')}.`,
        );
      }
      return raw;
    }
    case 'path': {
      if (
        raw.includes('\0') ||
        raw.includes('..') ||
        raw.startsWith('/') ||
        /^[A-Za-z]:/.test(raw)
      ) {
        throw new ForgeError(
          Codes.PATH_ESCAPE,
          `Path parameter '${name}' is not a contained relative path.`,
          'Path parameters must stay inside the project root.',
        );
      }
      return raw.replace(/\\/g, '/');
    }
    case 'task-id': {
      if (!TASK_ID_PATTERN.test(raw)) {
        throw new ForgeError(Codes.TOOL_PARAMS, `Parameter '${name}' is not a valid task id.`);
      }
      return raw;
    }
    default:
      throw new ForgeError(Codes.TOOL_PARAMS, `Unknown parameter type for '${name}'.`);
  }
}

export function resolveParameters(tool: ToolDefinition, ctx: ParamContext): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [name, spec] of Object.entries(tool.parameters)) {
    const fromCli = ctx.cli[name];
    const fromSource = sourceValue(spec, name, ctx);
    const fallback = spec.default === undefined ? undefined : String(spec.default);
    const raw = fromCli ?? fromSource ?? fallback;
    if (raw === undefined || raw === '') {
      if (spec.required) {
        throw new ForgeError(
          Codes.TOOL_PARAMS,
          `Missing required parameter '${name}' for tool '${tool.id}'.`,
          'Pass --set name=value or bind the parameter to task/change context.',
        );
      }
      continue;
    }
    resolved[name] = coerceParam(spec, name, raw);
  }
  for (const key of Object.keys(ctx.cli)) {
    if (!tool.parameters[key] && !BUILTIN_KEYS.has(key)) {
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Unknown parameter '${key}' for tool '${tool.id}'.`,
        'Only declared tool parameters may be set.',
      );
    }
  }
  return resolved;
}

function builtinValue(key: string, ctx: ParamContext): string | undefined {
  switch (key) {
    case 'task.id':
      return ctx.task?.id;
    case 'task.title':
      return ctx.task?.title;
    case 'task.kind':
      return ctx.task?.kind;
    case 'task.testPattern':
      return ctx.task?.touches[0];
    case 'change.id':
      return ctx.changeId;
    default:
      return undefined;
  }
}

export function interpolateArgs(
  args: string[],
  params: Record<string, string>,
  ctx: ParamContext,
  where: string,
): string[] {
  return args.map((arg) => {
    const replaced = arg.replace(PLACEHOLDER, (_match, name: string) => {
      if (params[name] !== undefined) {
        return params[name]!;
      }
      const builtin = builtinValue(name, ctx);
      if (builtin !== undefined) {
        return builtin;
      }
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Unresolved placeholder \${${name}} in ${where}.`,
        'Declare a typed parameter or use task.id, task.title, task.kind, task.testPattern, or change.id.',
      );
    });
    if (replaced.includes('${')) {
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Unresolved interpolation remaining in ${where}.`,
        'ForgeSpec does not evaluate expressions. Use typed placeholders only.',
      );
    }
    if (DISALLOWED_IN_DATA.test(replaced)) {
      throw new ForgeError(
        Codes.TOOL_PARAMS,
        `Resolved argument in ${where} contains control characters.`,
      );
    }
    return replaced;
  });
}
