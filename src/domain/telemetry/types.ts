export type TelemetryAttributeValue = string | number | boolean;

export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

export interface TelemetrySpan {
  setAttribute(key: string, value: TelemetryAttributeValue): void;
  addEvent(name: string, attributes?: TelemetryAttributes): void;
  recordException(error: unknown): void;
  setStatus(ok: boolean, message?: string): void;
  end(): void;
}

export interface Telemetry {
  enabled: boolean;
  startSpan(name: string, attributes?: TelemetryAttributes): TelemetrySpan;
  counter(name: string, value: number, attributes?: TelemetryAttributes): void;
  histogram(name: string, value: number, attributes?: TelemetryAttributes): void;
  event(name: string, attributes?: TelemetryAttributes): void;
  flush(): Promise<void>;
}

export const ALLOWED_METRIC_KEYS = new Set([
  'tool',
  'phase',
  'result',
  'validator',
  'state',
  'from',
  'to',
  'risk',
  'origin',
]);
