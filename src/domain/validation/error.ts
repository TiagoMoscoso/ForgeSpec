import type { ErrorCode } from './codes.js';

export class ForgeError extends Error {
  readonly code: ErrorCode;
  readonly fix?: string;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, fix?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ForgeError';
    this.code = code;
    this.fix = fix;
    this.details = details ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.fix ? { fix: this.fix } : {}),
      ...(Object.keys(this.details).length > 0 ? { details: this.details } : {}),
    };
  }
}
