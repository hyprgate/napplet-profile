export const PROFILE_NOTE_PREVIEW_CHARS = 420;

export function previewProfileNoteContent(content: string, maxLen = PROFILE_NOTE_PREVIEW_CHARS): string {
  if (content.length <= maxLen) return content;
  return `${content.slice(0, maxLen).trimEnd()}...`;
}
