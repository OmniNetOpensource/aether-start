import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useComposerStore } from "@/stores/useComposerStore";
import { useEditingStore } from "@/stores/useEditingStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { resetConversationEventCursor } from '@/lib/chat/api/websocket-client'
import { getConversationFn } from "@/server/functions/conversations";
import { getDefaultRoleIdFn } from "@/server/functions/chat/roles";
import { buildCurrentPath } from "@/lib/conversation/tree/message-tree";
import type {
  Attachment,
  Message,
} from "@/types/message";

const restoreAttachments = (
  attachments: Array<Attachment & { displayUrl?: string }>
): Attachment[] =>
  attachments
    .map((att) => ({
      id: att.id,
      kind: att.kind,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
      url: att.url ?? att.displayUrl ?? '',
      storageKey: att.storageKey,
    }))
    .filter((att) => att.mimeType?.startsWith("image/") && !!att.url);

const hydrateBlocks = (blocks: Message["blocks"]) =>
  Array.isArray(blocks)
    ? blocks.map((block) =>
        block.type === "research"
          ? {
              ...block,
              items: block.items.map((item) => ({ ...item })),
            }
          : block.type === "attachments"
          ? {
              ...block,
              attachments: restoreAttachments(
                Array.isArray(block.attachments) ? block.attachments : []
              ),
            }
          : { ...block }
      )
    : [];

const hydrateMessage = (msg: Message): Message => ({
  id: msg.id,
  role: msg.role,
  blocks: hydrateBlocks(msg.blocks),
  prevSibling: msg.prevSibling ?? null,
  nextSibling: msg.nextSibling ?? null,
  latestChild: msg.latestChild ?? null,
  createdAt: msg.createdAt ?? new Date().toISOString(),
} as Message);

export function useConversationLoader(conversationId: string | undefined) {
  const navigate = useNavigate();
  const currentConversationId = useMessageTreeStore(
    (state) => state.conversationId
  );
  const initializeTree = useMessageTreeStore((state) => state.initializeTree);
  const setConversationId = useMessageTreeStore((state) => state.setConversationId);
  const resumeIfRunning = useChatRequestStore((state) => state.resumeIfRunning)

  useEffect(() => {
    if (!conversationId || currentConversationId === conversationId) {
      return;
    }

    useComposerStore.getState().clear();

    const abortController = new AbortController();
    const { signal } = abortController;
    let canceled = false;

    const load = async () => {
      try {
        const conversation = await getConversationFn({ data: { id: conversationId } });
        if (canceled || signal.aborted) {
          return;
        }

        if (!conversation) {
          navigate({ to: "/404", replace: true });
          return;
        }

        const rawMessages: Message[] = Array.isArray(conversation.messages)
          ? (conversation.messages as Message[])
          : [];
        const rawCurrentPath = (conversation as { currentPath?: unknown })
          .currentPath;
        let currentPath =
          Array.isArray(rawCurrentPath) &&
          rawCurrentPath.every((id) => typeof id === "number")
            ? rawCurrentPath
            : [];
        const mappedMessages = rawMessages.map((msg) => hydrateMessage(msg));

        if (currentPath.length === 0 && mappedMessages.length > 0) {
          const rawLatestRootId = (conversation as { latestRootId?: unknown })
            .latestRootId;
          const latestRootId =
            typeof rawLatestRootId === "number"
              ? rawLatestRootId
              : mappedMessages[0].id;
          currentPath = buildCurrentPath(mappedMessages, latestRootId);
        }

        if (canceled || signal.aborted) {
          return;
        }

        useEditingStore.getState().clear();
        setConversationId(conversationId);
        initializeTree(mappedMessages, currentPath);
        const roleId =
          conversation.role ?? (await getDefaultRoleIdFn()) ?? "";
        useChatRequestStore.getState().setCurrentRole(roleId);
        resetConversationEventCursor(conversationId)
        await resumeIfRunning(conversationId)
      } catch (error) {
        if (canceled || signal.aborted) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load conversation:", error);
        navigate({ to: "/404", replace: true });
      }
    };

    void load();

    return () => {
      canceled = true;
      abortController.abort();
    };
  }, [
    conversationId,
    currentConversationId,
    navigate,
    setConversationId,
    initializeTree,
    resumeIfRunning,
  ]);

  return { isLoading: conversationId !== currentConversationId };
}
