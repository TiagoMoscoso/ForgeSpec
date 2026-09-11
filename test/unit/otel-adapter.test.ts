import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { createOtelTelemetry } from '../../src/infrastructure/telemetry/otel.js';
import { configureTelemetry } from '../../src/infrastructure/telemetry/config.js';
import { parseConfigDocument } from '../../src/infrastructure/config/schema.js';

describe('otel adapter', () => {
  it('creates spans with an in-memory exporter', async () => {
    const spans = new InMemorySpanExporter();
    const telemetry = await createOtelTelemetry({
      serviceName: 'forgespec-test',
      endpoint: 'http://127.0.0.1:1',
      metrics: false,
      tracing: true,
      logs: false,
      privacy: { includeArgs: false, includePaths: false },
      spanExporter: spans,
    });
    const span = telemetry.startSpan('forgespec.tool.run', {
      tool: 'focused-tests',
      phase: 'exec',
    });
    telemetry.event('tool.execution.completed', {
      tool: 'focused-tests',
      phase: 'exec',
      result: 'passed',
    });
    span.setStatus(true);
    span.end();
    await telemetry.flush();
    expect(spans.getFinishedSpans().some((item) => item.name === 'forgespec.tool.run')).toBe(true);
    const recorded = spans.getFinishedSpans().find((item) => item.name === 'forgespec.tool.run');
    expect(recorded?.attributes.path).toBeUndefined();
  });

  it('does not throw when the OTLP endpoint is unavailable', async () => {
    const config = parseConfigDocument(
      {
        version: 1,
        observability: { enabled: true, otlp: { endpoint: 'http://127.0.0.1:1' } },
      },
      'mem',
    );
    const telemetry = await configureTelemetry(config);
    expect(telemetry.enabled).toBe(true);
    telemetry.counter('forgespec_tool_runs_total', 1, {
      tool: 'x',
      phase: 'exec',
      result: 'passed',
    });
  });
});
