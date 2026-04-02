import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  createAttachmentId,
  getAttachmentValidationMessage,
  uploadBlobToStorage,
} from '@/features/attachments/attachment-upload';
import type { Attachment } from '@/features/chat/message-thread';
import { getZustandDevtoolsOptions } from '@/shared/browser/zustand-devtools';
import { toast } from '@/shared/app-shell/useToast';

const UPLOAD_CONCURRENCY = 4;
const STORE_FILE_NAME = 'useComposerStore.ts';

type PendingQuote = { id: string; text: string };

export type PendingAttachment = Attachment & { localUrl?: string };

type ComposerState = {
  input: string;
  pendingAttachments: PendingAttachment[];
  pendingQuotes: PendingQuote[];
};

type ComposerActions = {
  setInput: (value: string) => void;
  setPendingAttachments: (attachments: PendingAttachment[]) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  addQuote: (text: string) => void;
  removeQuote: (id: string) => void;
  clear: () => void;
};

const getActionName = (actionName: string) => {
  if (!import.meta.env.DEV) {
    return actionName;
  }

  const stack = new Error().stack?.split('\n') ?? [];
  const line = stack.find((item) => item.includes('src/') && !item.includes(STORE_FILE_NAME));
  const callsite = line
    ?.match(/(?:\/|\\)(src[/\\][^)\s]+?(?:\?[^:\s)]+)?:\d+:\d+)/)?.[1]
    ?.replace(/\\/g, '/')
    ?.replace(/\?[^:\s)]+/, '');

  return callsite ? `${actionName} @ ${callsite}` : actionName;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  devtools(
    (set) => ({
      input: '',
      pendingAttachments: [],
      pendingQuotes: [],
      setInput: (value) => set({ input: value }, false, getActionName('composer/setInput')),
      setPendingAttachments: (attachments) =>
        set(
          { pendingAttachments: attachments },
          false,
          getActionName('composer/setPendingAttachments'),
        ),
      addAttachments: async (files) => {
        if (files.length === 0) {
          return;
        }

        const queued: { file: File; id: string; localUrl: string }[] = [];
        for (const file of files) {
          const validationMessage = getAttachmentValidationMessage(file);
          if (validationMessage) {
            toast.warning(validationMessage);
            continue;
          }

          const id = createAttachmentId();
          const localUrl = URL.createObjectURL(file);
          queued.push({ file, id, localUrl });
        }

        if (queued.length === 0) {
          return;
        }

        set(
          (state) => ({
            pendingAttachments: [
              ...state.pendingAttachments,
              ...queued.map(
                ({ file, id, localUrl }): PendingAttachment => ({
                  id,
                  kind: 'image',
                  name: file.name,
                  size: file.size,
                  mimeType: file.type || '',
                  url: '',
                  localUrl,
                }),
              ),
            ],
          }),
          false,
          getActionName('composer/addAttachments/placeholders'),
        );

        let running = 0;
        const waitQueue: Array<() => void> = [];
        const acquire = () =>
          new Promise<void>((resolve) => {
            if (running < UPLOAD_CONCURRENCY) {
              running += 1;
              resolve();
            } else {
              waitQueue.push(resolve);
            }
          });
        const release = () => {
          running -= 1;
          const next = waitQueue.shift();
          if (next) {
            running += 1;
            next();
          }
        };

        await Promise.allSettled(
          queued.map(async ({ file, id, localUrl }) => {
            await acquire();
            try {
              const uploaded = await uploadBlobToStorage(file, file.name);
              set(
                (state) => ({
                  pendingAttachments: state.pendingAttachments.map((item) =>
                    item.id === id
                      ? {
                          id: item.id,
                          kind: item.kind,
                          name: item.name,
                          size: item.size,
                          mimeType: item.mimeType,
                          url: uploaded.url,
                          storageKey: uploaded.storageKey,
                        }
                      : item,
                  ),
                }),
                false,
                getActionName('composer/addAttachments/complete'),
              );
              URL.revokeObjectURL(localUrl);
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error || 'Unknown error');
              console.error(`Failed to upload image "${file.name}"`, error);
              toast.error(`上传图片「${file.name}」失败：${detail}`);
              set(
                (state) => ({
                  pendingAttachments: state.pendingAttachments.filter((item) => item.id !== id),
                }),
                false,
                getActionName('composer/addAttachments/fail'),
              );
              URL.revokeObjectURL(localUrl);
            } finally {
              release();
            }
          }),
        );
      },
      removeAttachment: (id) =>
        set(
          (state) => {
            const removed = state.pendingAttachments.find((item) => item.id === id);
            if (removed?.localUrl) {
              URL.revokeObjectURL(removed.localUrl);
            }

            return {
              pendingAttachments: state.pendingAttachments.filter((item) => item.id !== id),
            };
          },
          false,
          getActionName('composer/removeAttachment'),
        ),
      addQuote: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `quote_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        set(
          (state) => ({
            pendingQuotes: [...state.pendingQuotes, { id, text: trimmed }],
          }),
          false,
          getActionName('composer/addQuote'),
        );
      },
      removeQuote: (id) =>
        set(
          (state) => ({
            pendingQuotes: state.pendingQuotes.filter((q) => q.id !== id),
          }),
          false,
          getActionName('composer/removeQuote'),
        ),
      clear: () =>
        set(
          (state) => {
            for (const item of state.pendingAttachments) {
              if (item.localUrl) {
                URL.revokeObjectURL(item.localUrl);
              }
            }

            return { input: '', pendingAttachments: [], pendingQuotes: [] };
          },
          false,
          getActionName('composer/clear'),
        ),
    }),
    getZustandDevtoolsOptions('ComposerStore'),
  ),
);
