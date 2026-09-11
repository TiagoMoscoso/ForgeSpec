import { ForgeError } from '../domain/validation/error.js';

export function printResult(json: boolean, payload: unknown): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...asObject(payload) }, null, 2)}\n`);
    return;
  }
  process.stderr.write(`${humanize(payload)}\n`);
}

function asObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { data: payload };
}

function humanize(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  return JSON.stringify(payload, null, 2);
}

export function printError(json: boolean, error: unknown): void {
  if (error instanceof ForgeError) {
    if (json) {
      process.stdout.write(`${JSON.stringify(error.toJSON(), null, 2)}\n`);
    } else {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      if (error.fix) {
        process.stderr.write(`Fix: ${error.fix}\n`);
      }
    }
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: 'FGE000', message }, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
}
