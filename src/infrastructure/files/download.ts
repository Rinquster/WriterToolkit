export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeFilename(value: string, fallback: string): string {
  const withoutControlCharacters = [...value]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
    .join('');
  const normalized = withoutControlCharacters
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
  return normalized || fallback;
}
