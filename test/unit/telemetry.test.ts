import { describe, expect, it } from 'vitest';
import {
  MemoryTelemetry,
  noopTelemetry,
  setTelemetry,
} from '../../src/infrastructure/telemetry/runtime.js';
import {
  configureTelemetry,
  telemetryEnabled,
  otlpEndpoint,
} from '../../src/infrastructure/telemetry/config.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';
import { sanitizeEventAttributes } from '../../src/domain/telemetry/sanitize.js';

describe('telemetry', () => {
  it('is disabled by default', () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    expect(telemetryEnabled(config)).toBe(false);
    expect(noopTelemetry.enabled).toBe(false);
  });

  it('records sanitized events in memory', async () => {
    const memory = new MemoryTelemetry();
    setTelemetry(memory);
    memory.event('tool.execution.started', {
      tool: 'focused-tests',
      phase: 'exec',
      args: 'node -e TOKEN=abc',
    });
    memory.counter('forgespec_tool_runs_total', 1, {
      tool: 'focused-tests',
      phase: 'exec',
      result: 'passed',
    });
    memory.histogram('forgespec_tool_duration_seconds', 0.4, {
      tool: 'focused-tests',
      phase: 'exec',
    });
    const span = memory.startSpan('forgespec.tool.run', { tool: 'focused-tests' });
    span.setStatus(true);
    span.end();
    expect(memory.events[0]?.name).toBe('tool.execution.started');
    expect(memory.events[0]?.attributes.args).toBeUndefined();
    expect(memory.records.some((item) => item.kind === 'counter')).toBe(true);
    setTelemetry(noopTelemetry);
  });

  it('never includes command args unless privacy allows it', () => {
    const hidden = sanitizeEventAttributes(
      { tool: 'x', args: 'TOKEN=abc' },
      { includeArgs: false, includePaths: false },
    );
    const shown = sanitizeEventAttributes(
      { tool: 'x', args: 'TOKEN=abc' },
      { includeArgs: true, includePaths: false },
    );
    expect(hidden.args).toBeUndefined();
    expect(shown.args).toContain('[redacted]');
  });

  it('configureTelemetry stays no-op when disabled', async () => {
    const config = parseConfigDocument({ version: 1 }, 'memory');
    const telemetry = await configureTelemetry(config);
    expect(telemetry.enabled).toBe(false);
    expect(otlpEndpoint(config)).toContain('http');
  });
});
