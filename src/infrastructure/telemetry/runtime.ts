import type {
  Telemetry,
  TelemetryAttributes,
  TelemetrySpan,
} from '../../domain/telemetry/types.js';
import {
  sanitizeEventAttributes,
  sanitizeMetricAttributes,
} from '../../domain/telemetry/sanitize.js';

class NoopSpan implements TelemetrySpan {
  setAttribute(): void {}
  addEvent(): void {}
  recordException(): void {}
  setStatus(): void {}
  end(): void {}
}

export const noopTelemetry: Telemetry = {
  enabled: false,
  startSpan(): TelemetrySpan {
    return new NoopSpan();
  },
  counter(): void {},
  histogram(): void {},
  event(): void {},
  async flush(): Promise<void> {},
};

export interface MemoryRecord {
  kind: 'counter' | 'histogram' | 'event' | 'span';
  name: string;
  value?: number;
  attributes: TelemetryAttributes;
  ok?: boolean;
}

export class MemoryTelemetry implements Telemetry {
  enabled = true;
  readonly records: MemoryRecord[] = [];
  readonly events: Array<{ name: string; attributes: TelemetryAttributes }> = [];
  readonly spans: Array<{ name: string; attributes: TelemetryAttributes; status?: boolean }> = [];

  constructor(private readonly privacy = { includeArgs: false, includePaths: false }) {}

  startSpan(name: string, attributes?: TelemetryAttributes): TelemetrySpan {
    const attrs = { ...sanitizeMetricAttributes(attributes) };
    const rec: MemoryRecord = { kind: 'span', name, attributes: attrs };
    this.records.push(rec);
    this.spans.push({ name, attributes: attrs });
    return {
      setAttribute: (key, value) => {
        const extra = sanitizeMetricAttributes({ [key]: value });
        Object.assign(attrs, extra);
      },
      addEvent: (eventName, eventAttrs) => {
        this.event(eventName, eventAttrs);
      },
      recordException: () => {
        rec.ok = false;
      },
      setStatus: (ok) => {
        rec.ok = ok;
        const span = this.spans.find((item) => item.name === name && item.attributes === attrs);
        if (span) {
          span.status = ok;
        }
      },
      end: () => {},
    };
  }

  counter(name: string, value: number, attributes?: TelemetryAttributes): void {
    this.records.push({
      kind: 'counter',
      name,
      value,
      attributes: sanitizeMetricAttributes(attributes),
    });
  }

  histogram(name: string, value: number, attributes?: TelemetryAttributes): void {
    this.records.push({
      kind: 'histogram',
      name,
      value,
      attributes: sanitizeMetricAttributes(attributes),
    });
  }

  event(name: string, attributes?: TelemetryAttributes): void {
    const sanitized = sanitizeEventAttributes(attributes, this.privacy);
    this.records.push({ kind: 'event', name, attributes: sanitized });
    this.events.push({ name, attributes: sanitized });
  }

  async flush(): Promise<void> {}
}

let current: Telemetry = noopTelemetry;

export function getTelemetry(): Telemetry {
  return current;
}

export function setTelemetry(telemetry: Telemetry): void {
  current = telemetry;
}

export function resetTelemetry(): void {
  current = noopTelemetry;
}

export async function withSpan<T>(
  name: string,
  attributes: TelemetryAttributes | undefined,
  fn: (span: TelemetrySpan) => Promise<T>,
): Promise<T> {
  const span = getTelemetry().startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.setStatus(true);
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus(false, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    span.end();
  }
}
