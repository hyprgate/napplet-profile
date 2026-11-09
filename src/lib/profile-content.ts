export const PROFILE_NOTE_PREVIEW_CHARS = 420;

export function previewProfileNoteContent(content: string, maxLen = PROFILE_NOTE_PREVIEW_CHARS): string {
  if (content.length <= maxLen) return content;
  return `${content.slice(0, maxLen).trimEnd()}...`;
}

const STANDALONE_IMAGE_LINE = /^\s*https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:[?#]\S*)?\s*$/i;

/** Images render as blocks, so blank lines around an image URL only add a gap. */
export function tightenImageSpacing(content: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const isBlank = (value: string | undefined) => value !== undefined && value.trim() === '';
  const kept = lines.filter((line, index) => {
    if (line.trim() !== '') return true;
    let before = index - 1;
    while (isBlank(lines[before])) before -= 1;
    let after = index + 1;
    while (isBlank(lines[after])) after += 1;
    return !STANDALONE_IMAGE_LINE.test(lines[before] ?? '') && !STANDALONE_IMAGE_LINE.test(lines[after] ?? '');
  });
  return kept.join('\n').replace(/\s+$/, '');
}
