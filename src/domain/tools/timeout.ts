import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';

export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

export function parseDurationMs(timeout?: string, timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isInteger(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }
  if (!timeout) {
    return DEFAULT_TOOL_TIMEOUT_MS;
  }
  const match = /^(\d+)s$/.exec(timeout.trim());
  if (!match) {
    throw new ForgeError(
      Codes.CONFIG_INVALID,
      `Invalid timeout '${timeout}'.`,
      'Use an integer timeout_ms or a duration like 120s.',
    );
  }
  const seconds = Number(match[1]);
  if (seconds <= 0) {
    throw new ForgeError(Codes.CONFIG_INVALID, `Timeout must be positive: ${timeout}.`);
  }
  return seconds * 1000;
}
