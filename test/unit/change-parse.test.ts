import { describe, expect, it } from 'vitest';
import { parseChangeMarkdown } from '../../src/domain/change/parse.js';
import { assertSealable } from '../../src/domain/change/seal.js';
import { Codes } from '../../src/domain/validation/codes.js';
import { ForgeError } from '../../src/domain/validation/error.js';
import { SAMPLE_CHANGE } from '../helpers/fixture.js';

describe('change parser', () => {
  it('parses a sealed-ready contract', () => {
    const change = parseChangeMarkdown(SAMPLE_CHANGE);
    expect(change.id).toBe('add-token-validator');
    expect(change.requirements).toHaveLength(1);
    expect(change.requirements[0]?.id).toBe('REQ-AUTH-001');
    expect(change.requirements[0]?.acceptance).toContain(
      'Expired signature-valid tokens return 401',
    );
    expect(change.openQuestions).toEqual([]);
    assertSealable(change);
  });

  it('rejects open questions', () => {
    const raw = SAMPLE_CHANGE.replace('None.', '- Should we support refresh tokens?');
    const change = parseChangeMarkdown(raw);
    expect(() => assertSealable(change)).toThrowError(ForgeError);
    try {
      assertSealable(change);
    } catch (error) {
      expect(error).toBeInstanceOf(ForgeError);
      expect((error as ForgeError).code).toBe(Codes.CHANGE_OPEN_QUESTIONS);
    }
  });

  it('rejects missing frontmatter', () => {
    expect(() => parseChangeMarkdown('# Intent\nHi')).toThrowError(ForgeError);
  });

  it('rejects duplicate requirement ids', () => {
    const dup = SAMPLE_CHANGE.replace(
      '# Architecture',
      `### REQ-AUTH-001: Duplicate
text
Acceptance:
- x
Kind: mandatory

# Architecture`,
    );
    expect(() => parseChangeMarkdown(dup)).toThrowError(ForgeError);
  });
});
