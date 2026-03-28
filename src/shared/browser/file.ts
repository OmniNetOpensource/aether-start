export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

export function collectClipboardFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  if (clipboardData.files?.length) {
    return Array.from(clipboardData.files);
  }
  const files: File[] = [];
  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = size >= 100 ? Math.round(size).toString() : size.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}
