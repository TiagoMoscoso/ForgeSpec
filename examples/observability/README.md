# Optional Grafana reference

This stack is **not** a ForgeSpec dependency. Point any OpenTelemetry-compatible backend at the CLI using:

```bash
export FORGESPEC_OTEL_ENABLED=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Then `docker compose up` in this directory if you want Collector + Prometheus + Tempo + Grafana locally.
