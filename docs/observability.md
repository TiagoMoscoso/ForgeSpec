# Optional observability

OpenTelemetry is **not** part of the ForgeSpec kernel. Propose, forge, exec, archive, evidence, and Agent Tools work the same with it off. Default is off.

Turn it on only if you want metrics/traces in CI or a backend:

```yaml
observability:
  enabled: true
  otlp:
    endpoint: http://localhost:4318
```

Or `FORGESPEC_OTEL_ENABLED=1` with `OTEL_EXPORTER_OTLP_ENDPOINT`. Do not put credentials in `config.yaml`.

Telemetry never fails a passing task. Grafana is not a dependency. An optional Collector → Prometheus/Tempo → Grafana stack lives in `examples/observability/`.
