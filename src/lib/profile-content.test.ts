import { describe, expect, it } from 'vitest';
import { previewProfileNoteContent, tightenImageSpacing } from './profile-content';

describe('profile content presentation', () => {
  it('preserves the existing profile note preview cutoff', () => {
    const content = `${'a'.repeat(421)}\nnext`;

    expect(previewProfileNoteContent(content)).toBe(`${'a'.repeat(420)}...`);
  });

  it('drops only the blank lines around a standalone image URL', () => {
    expect(tightenImageSpacing('Look.\n\nhttps://a.example/x.png')).toBe('Look.\nhttps://a.example/x.png');
    expect(tightenImageSpacing('One.\n\nTwo.')).toBe('One.\n\nTwo.');
  });
});
