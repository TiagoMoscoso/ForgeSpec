import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('observability example stack', () => {
  it('parses compose and collector YAML', async () => {
    const compose = parseYaml(
      await readFile(path.join(root, 'examples/observability/docker-compose.yml'), 'utf8'),
    ) as { services: Record<string, unknown> };
    expect(compose.services['otel-collector']).toBeTruthy();
    expect(compose.services.prometheus).toBeTruthy();
    expect(compose.services.tempo).toBeTruthy();
    expect(compose.services.grafana).toBeTruthy();
    const collector = parseYaml(
      await readFile(path.join(root, 'examples/observability/otel-collector/config.yaml'), 'utf8'),
    ) as { receivers: Record<string, unknown> };
    expect(collector.receivers.otlp).toBeTruthy();
  });
});
