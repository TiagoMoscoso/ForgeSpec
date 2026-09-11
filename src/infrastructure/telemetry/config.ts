import type { ForgeConfig } from '../config/schema.js';
import { getTelemetry, noopTelemetry, setTelemetry } from './runtime.js';
import type { Telemetry } from '../../domain/telemetry/types.js';

export { getTelemetry, setTelemetry, noopTelemetry, withSpan, MemoryTelemetry } from './runtime.js';

export function telemetryEnabled(config: ForgeConfig): boolean {
  const flag = process.env.FORGESPEC_OTEL_ENABLED;
  if (flag === '1' || flag === 'true') {
    return true;
  }
  if (flag === '0' || flag === 'false') {
    return false;
  }
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    return false;
  }
  return config.observability.enabled;
}

export function otlpEndpoint(config: ForgeConfig): string {
  return (
    config.observability.otlp.endpoint ||
    process.env.FORGESPEC_OTEL_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318'
  );
}

export async function configureTelemetry(config: ForgeConfig): Promise<Telemetry> {
  try {
    if (!telemetryEnabled(config)) {
      setTelemetry(noopTelemetry);
      return getTelemetry();
    }
    const { createOtelTelemetry } = await import('./otel.js');
    const telemetry = await createOtelTelemetry({
      serviceName: process.env.OTEL_SERVICE_NAME || config.observability.service.name,
      endpoint: otlpEndpoint(config),
      metrics: config.observability.metrics.enabled,
      tracing: config.observability.tracing.enabled,
      logs: config.observability.logs.enabled,
      privacy: {
        includeArgs: config.observability.privacy.include_command_args,
        includePaths: config.observability.privacy.include_paths,
      },
    });
    setTelemetry(telemetry);
    return telemetry;
  } catch {
    setTelemetry(noopTelemetry);
    return getTelemetry();
  }
}

export async function safeTelemetry<T>(
  _config: ForgeConfig,
  fn: () => Promise<T> | T,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}
