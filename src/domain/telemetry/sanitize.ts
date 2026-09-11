import { redactSecrets } from '../evidence/fingerprint.js';
import { ALLOWED_METRIC_KEYS, type TelemetryAttributes } from './types.js';

const LOOKS_LIKE_PATH = /[\\/]|^\.{1,2}$/;
const LOOKS_LIKE_SHA = /^[a-f0-9]{7,40}$/i;
const SAFE_NAME = /^[A-Za-z0-9._-]{1,64}$/;

export function sanitizeMetricAttributes(
  attributes: TelemetryAttributes | undefined,
): TelemetryAttributes {
  if (!attributes) {
    return {};
  }
  const out: TelemetryAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!ALLOWED_METRIC_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    const text = String(value);
    if (LOOKS_LIKE_PATH.test(text) || LOOKS_LIKE_SHA.test(text) || !SAFE_NAME.test(text)) {
      continue;
    }
    out[key] = text;
  }
  return out;
}

export function sanitizeEventAttributes(
  attributes: TelemetryAttributes | undefined,
  options: { includeArgs?: boolean; includePaths?: boolean },
): TelemetryAttributes {
  const base = sanitizeMetricAttributes(attributes);
  if (!attributes) {
    return base;
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'args' || key === 'argv') {
      if (options.includeArgs && typeof value === 'string') {
        base[key] = redactSecrets(value);
      }
      continue;
    }
    if (key === 'cwd' || key === 'path' || key === 'file') {
      if (options.includePaths && typeof value === 'string') {
        base[key] = redactSecrets(value);
      }
    }
  }
  return base;
}

export function redactArgv(args: string[]): string[] {
  return args.map((arg) => redactSecrets(arg));
}
