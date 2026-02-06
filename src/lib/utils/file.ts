import type { AttachmentKind } from "@/src/features/chat/types/chat";

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

export function detectAttachmentKind(
  mimeType: string | undefined,
): AttachmentKind {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

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

export function base64ToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header?.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
