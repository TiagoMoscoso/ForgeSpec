import { metrics, trace, diag, DiagLogLevel, SpanStatusCode, type Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import {
  sanitizeEventAttributes,
  sanitizeMetricAttributes,
} from '../../domain/telemetry/sanitize.js';
import type {
  Telemetry,
  TelemetryAttributes,
  TelemetrySpan,
} from '../../domain/telemetry/types.js';

export interface OtelTelemetryOptions {
  serviceName: string;
  endpoint: string;
  metrics: boolean;
  tracing: boolean;
  logs: boolean;
  privacy: { includeArgs: boolean; includePaths: boolean };
  spanExporter?: SpanExporter;
  metricReader?: MetricReader;
}

class OtelSpan implements TelemetrySpan {
  constructor(private readonly span: Span) {}
  setAttribute(key: string, value: string | number | boolean): void {
    const sanitized = sanitizeMetricAttributes({ [key]: value });
    for (const [k, v] of Object.entries(sanitized)) {
      this.span.setAttribute(k, v);
    }
  }
  addEvent(name: string, attributes?: TelemetryAttributes): void {
    this.span.addEvent(name, sanitizeMetricAttributes(attributes));
  }
  recordException(error: unknown): void {
    if (error instanceof Error) {
      this.span.recordException(error);
    } else {
      this.span.recordException(new Error(String(error)));
    }
  }
  setStatus(ok: boolean, message?: string): void {
    this.span.setStatus({
      code: ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      message,
    });
  }
  end(): void {
    this.span.end();
  }
}

function emitLog(enabled: boolean, name: string, attributes: TelemetryAttributes): void {
  if (!enabled) {
    return;
  }
  try {
    process.stderr.write(
      `${JSON.stringify({ event: name, ...attributes, ts: new Date().toISOString() })}\n`,
    );
  } catch {
    // Structured logs must never break the workflow.
  }
}

export async function createOtelTelemetry(options: OtelTelemetryOptions): Promise<Telemetry> {
  diag.setLogger(
    {
      verbose: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    DiagLogLevel.ERROR,
  );

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options.serviceName,
  });

  let tracerProvider: BasicTracerProvider | undefined;
  if (options.tracing) {
    const processor = options.spanExporter
      ? new SimpleSpanProcessor(options.spanExporter)
      : new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: `${options.endpoint.replace(/\/$/, '')}/v1/traces`,
          }),
        );
    tracerProvider = new BasicTracerProvider({
      resource,
      spanProcessors: [processor],
    });
    try {
      trace.setGlobalTracerProvider(tracerProvider);
    } catch {
      // A previous test or process may already have registered a provider.
    }
  }

  let meterProvider: MeterProvider | undefined;
  if (options.metrics) {
    const reader =
      options.metricReader ??
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${options.endpoint.replace(/\/$/, '')}/v1/metrics`,
        }),
        exportIntervalMillis: 15_000,
      });
    meterProvider = new MeterProvider({ resource, readers: [reader] });
    try {
      metrics.setGlobalMeterProvider(meterProvider);
    } catch {
      // A previous meter provider may already be registered.
    }
  }

  const tracer = tracerProvider?.getTracer('forgespec') ?? trace.getTracer('forgespec');
  const meter = meterProvider?.getMeter('forgespec') ?? metrics.getMeter('forgespec');
  const counters = new Map<string, ReturnType<typeof meter.createCounter>>();
  const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();

  const telemetry: Telemetry = {
    enabled: true,
    startSpan(name, attributes): TelemetrySpan {
      const span = tracer.startSpan(name, {
        attributes: sanitizeMetricAttributes(attributes),
      });
      return new OtelSpan(span);
    },
    counter(name, value, attributes): void {
      try {
        let counter = counters.get(name);
        if (!counter) {
          counter = meter.createCounter(name);
          counters.set(name, counter);
        }
        counter.add(value, sanitizeMetricAttributes(attributes));
      } catch {
        // Metric failures degrade.
      }
    },
    histogram(name, value, attributes): void {
      try {
        let histogram = histograms.get(name);
        if (!histogram) {
          histogram = meter.createHistogram(name);
          histograms.set(name, histogram);
        }
        histogram.record(value, sanitizeMetricAttributes(attributes));
      } catch {
        // Metric failures degrade.
      }
    },
    event(name, attributes): void {
      const sanitized = sanitizeEventAttributes(attributes, options.privacy);
      emitLog(options.logs, name, sanitized);
      try {
        const span = trace.getActiveSpan();
        span?.addEvent(name, sanitized);
      } catch {
        // Event failures degrade.
      }
    },
    async flush(): Promise<void> {
      await tracerProvider?.forceFlush().catch(() => undefined);
      await meterProvider?.forceFlush().catch(() => undefined);
    },
  };
  return telemetry;
}
