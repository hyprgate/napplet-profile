import { describe, expect, it } from 'vitest';
import { previewProfileNoteContent } from './profile-content';

describe('profile content presentation', () => {
  it('preserves the existing profile note preview cutoff', () => {
    const content = `${'a'.repeat(421)}\nnext`;

    expect(previewProfileNoteContent(content)).toBe(`${'a'.repeat(420)}...`);
  });
});
