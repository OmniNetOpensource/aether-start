export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = size >= 100 ? Math.round(size).toString() : size.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}

export function convertFileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as base64"));
      }
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read blob as base64"));
    };

    reader.readAsDataURL(blob);
  });
}
