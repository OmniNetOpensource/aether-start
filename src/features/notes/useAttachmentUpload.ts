import { useState } from 'react';
import { buildAttachmentsFromFiles } from '@/shared/attachments';
import type { Attachment } from '@/features/chat/types/message';

export function useAttachmentUpload(initialAttachments: Attachment[] = []) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);

  const addFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      const next = await buildAttachmentsFromFiles(files);
      setAttachments((prev) => [...prev, ...next]);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return {
    attachments,
    setAttachments,
    uploading,
    addFiles,
    removeAttachment,
  };
}
