import type { Attachment } from "@/src/features/chat/types/chat";
import {
  MAX_IMAGE_SIZE,
  convertFileToBase64,
} from "@/src/lib/utils/file";
import { toast } from "@/src/hooks/useToast";

export const buildAttachmentsFromFiles = async (
  files: File[],
): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];

  for (const file of files) {
    const mimeType = file.type || "";

    if (!mimeType.startsWith("image/")) {
      toast.warning(`仅支持上传图片，已跳过「${file.name}」。`);
      continue;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      toast.warning(
        `图片「${file.name}」超过限制（最大 ${(
          MAX_IMAGE_SIZE /
          (1024 * 1024)
        ).toFixed(0)}MB），已跳过。`,
      );
      continue;
    }

    try {
      const displayUrl = await convertFileToBase64(file);

      attachments.push({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: "image",
        name: file.name,
        size: file.size,
        mimeType,
        displayUrl,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : String(error || "未知原因");
      console.error(`无法上传图片「${file.name}」`, error);
      toast.error(
        `无法上传图片「${file.name}」：${detail}。建议: 检查图片是否可读或稍后重试。`,
      );
    }
  }

  return attachments;
};
