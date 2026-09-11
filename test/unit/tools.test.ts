import { describe, expect, it } from 'vitest';
import {
  parseConfigDocument,
  assertOverlayAllowlist,
} from '../../src/infrastructure/config/schema.js';
import { parseDurationMs } from '../../src/domain/tools/timeout.js';
import {
  coerceParam,
  interpolateArgs,
  parseCliSets,
  resolveParameters,
} from '../../src/domain/tools/params.js';
import { assertPhaseAllowed, assertRiskAllowed } from '../../src/domain/tools/policy.js';
import { sanitizeMetricAttributes } from '../../src/domain/telemetry/sanitize.js';
import { builtinTools, getTool, listTools } from '../../src/application/tools/registry.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import type { ToolDefinition } from '../../src/domain/tools/types.js';
import { SAMPLE_PLAN } from '../helpers/fixture.js';

function projectTool(
  partial: Partial<ToolDefinition> & Pick<ToolDefinition, 'id'>,
): ToolDefinition {
  return {
    origin: 'project',
    executable: 'node',
    args: [],
    phases: ['exec'],
    risk: 'read',
    resources: [],
    parameters: {},
    env: [],
    ...partial,
  };
}

describe('tool config', () => {
  it('defaults tools and observability for existing repos', () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    expect(config.tools).toEqual({});
    expect(config.observability.enabled).toBe(false);
    expect(config.workflow.exec.before).toEqual([]);
    expect(listTools(config).some((tool) => tool.id === 'task-preflight')).toBe(true);
  });

  it('parses a project tool with timeout duration', () => {
    const config = parseConfigDocument(
      {
        version: 1,
        tools: {
          'focused-tests': {
            executable: 'node',
            args: ['-e', 'process.exit(0)', '${testPattern}'],
            timeout: '120s',
            phases: ['exec', 'archive'],
            risk: 'read',
            parameters: {
              testPattern: { type: 'string', source: 'task.touches' },
            },
            evidence: { type: 'test' },
          },
        },
      },
      'memory',
    );
    expect(
      parseDurationMs(
        config.tools['focused-tests']?.timeout,
        config.tools['focused-tests']?.timeout_ms,
      ),
    ).toBe(120_000);
    expect(getTool(config, 'focused-tests').origin).toBe('project');
  });

  it('rejects shell-string executables and overlay tools', () => {
    expect(() =>
      parseConfigDocument(
        { version: 1, tools: { evil: { executable: 'bash -c rm', args: [] } } },
        'memory',
      ),
    ).toThrowError(ForgeError);
    expect(() =>
      assertOverlayAllowlist({ tools: { extra: { executable: 'node' } } }, 'overlay'),
    ).toThrowError(ForgeError);
  });

  it('rejects enum parameters without values', () => {
    expect(() =>
      parseConfigDocument(
        {
          version: 1,
          tools: { pick: { executable: 'node', parameters: { mode: { type: 'enum' } } } },
        },
        'memory',
      ),
    ).toThrowError(ForgeError);
  });
});

describe('parameters', () => {
  it('parses --set and interpolates only typed placeholders', () => {
    const cli = parseCliSets(['testPattern=src/auth', 'count=2']);
    expect(cli.testPattern).toBe('src/auth');
    const tool = projectTool({
      id: 'echo',
      args: ['${testPattern}', '${task.id}', '${change.id}'],
      parameters: {
        testPattern: { type: 'string', required: true, source: 'cli' },
        count: { type: 'integer', required: false, source: 'cli' },
      },
    });
    const params = resolveParameters(tool, {
      changeId: 'add-token-validator',
      task: SAMPLE_PLAN.tasks[0],
      cli,
      root: '/tmp/proj',
    });
    expect(params.count).toBe('2');
    expect(
      interpolateArgs(
        tool.args,
        params,
        {
          changeId: 'add-token-validator',
          task: SAMPLE_PLAN.tasks[0],
          cli,
          root: '/tmp/proj',
        },
        'tools.echo.args',
      ),
    ).toEqual(['src/auth', 'T01', 'add-token-validator']);
  });

  it('rejects unknown placeholders, unknown --set, and invalid types', () => {
    const tool = projectTool({
      id: 'echo',
      args: ['${missing}'],
      parameters: { n: { type: 'integer', required: false, source: 'cli' } },
    });
    expect(() => parseCliSets(['=nope'])).toThrowError(ForgeError);
    expect(() =>
      resolveParameters(tool, { changeId: 'c', cli: { nope: '1' }, root: '/tmp' }),
    ).toThrowError(ForgeError);
    expect(() =>
      coerceParam({ type: 'integer', required: true, source: 'cli' }, 'n', '1.5'),
    ).toThrowError(ForgeError);
    expect(() =>
      coerceParam({ type: 'boolean', required: true, source: 'cli' }, 'b', 'yes'),
    ).toThrowError(ForgeError);
    expect(() =>
      coerceParam({ type: 'path', required: true, source: 'cli' }, 'file', '../secret'),
    ).toThrowError(ForgeError);
    expect(() =>
      interpolateArgs(['${missing}'], {}, { changeId: 'c', cli: {}, root: '/tmp' }, 'args'),
    ).toThrowError(ForgeError);
  });
});

describe('phase and risk', () => {
  it('enforces phase and destructive confirmation', () => {
    const tool = projectTool({
      id: 'wipe',
      phases: ['archive'],
      risk: 'destructive',
    });
    try {
      assertPhaseAllowed(tool, 'exec');
      throw new Error('expected phase');
    } catch (error) {
      expect((error as ForgeError).code).toBe(Codes.TOOL_PHASE);
    }
    expect(() => assertRiskAllowed(tool, false)).toThrowError(ForgeError);
    expect(() => assertRiskAllowed(tool, true)).not.toThrow();
  });
});

describe('builtins and sanitization', () => {
  it('does not auto-register repository scripts', () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    expect(listTools(config).every((tool) => tool.origin === 'builtin')).toBe(true);
    expect(builtinTools().map((tool) => tool.id)).toContain('repository-inspection');
  });

  it('drops high-cardinality metric attributes', () => {
    const sanitized = sanitizeMetricAttributes({
      tool: 'focused-tests',
      phase: 'exec',
      result: 'passed',
      task: 'AUTH-004',
      path: 'src/auth/token.ts',
      sha: '91c7ab4deadbeef',
      argv: 'node -e SECRET=hunter2',
    });
    expect(sanitized).toEqual({ tool: 'focused-tests', phase: 'exec', result: 'passed' });
  });
});
