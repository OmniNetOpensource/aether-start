import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useComposerStore } from "@/features/chat/composer/store/useComposerStore";
import { useEditingStore } from "@/features/chat/messages/store/useEditingStore";
import { useMessageTreeStore } from "@/features/chat/messages/store/useMessageTreeStore";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";
import { resetConversationEventCursor } from '@/features/chat/api/client/websocket-client'
import { conversationRepository } from "@/features/conversation/persistence/repository";
import {
  buildCurrentPath,
  createLinearMessages,
} from "@/features/conversation/model/tree/message-tree";
import type {
  Attachment,
  LegacyAttachment,
  Message,
} from "@/features/chat/types/chat";

const restoreDisplayUrls = (
  attachments: Array<Attachment | LegacyAttachment>
): Attachment[] =>
  attachments
    .map((att) => ({
      id: att.id,
      kind: att.kind,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
      displayUrl: "url" in att ? att.url : att.displayUrl,
      storageKey: 'storageKey' in att ? att.storageKey : undefined,
    }))
    .filter((att) => att.mimeType?.startsWith("image/") && !!att.displayUrl);

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
              attachments: restoreDisplayUrls(
                Array.isArray(block.attachments) ? block.attachments : []
              ),
            }
          : { ...block }
      )
    : [];

type RawMessage = Message | { role?: unknown; blocks?: unknown; createdAt?: unknown };

const isStructuredMessage = (msg: RawMessage): msg is Message =>
  typeof (msg as Message).id === "number";

const hydrateMessage = (msg: Message): Message => ({
  id: msg.id,
  role: msg.role,
  blocks: hydrateBlocks(msg.blocks),
  prevSibling: msg.prevSibling ?? null,
  nextSibling: msg.nextSibling ?? null,
  latestChild: msg.latestChild ?? null,
  createdAt: msg.createdAt ?? new Date().toISOString(),
} as Message);

const toLinearInput = (msg: RawMessage) => {
  const role = msg.role;
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const normalizedRole = role as "user" | "assistant";
  const blocks = hydrateBlocks(
    Array.isArray(msg.blocks) ? (msg.blocks as Message["blocks"]) : []
  );
  const createdAt =
    typeof msg.createdAt === "string" ? msg.createdAt : undefined;
  return { role: normalizedRole, blocks, createdAt };
};

type LinearInput = NonNullable<ReturnType<typeof toLinearInput>>;

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
        const conversation = await conversationRepository.get(conversationId);
        if (canceled || signal.aborted) {
          return;
        }

        if (!conversation) {
          navigate({ to: "/404", replace: true });
          return;
        }

        const rawMessages: RawMessage[] = Array.isArray(conversation.messages)
          ? (conversation.messages as RawMessage[])
          : [];
        const rawCurrentPath = (conversation as { currentPath?: unknown })
          .currentPath;
        let currentPath =
          Array.isArray(rawCurrentPath) &&
          rawCurrentPath.every((id) => typeof id === "number")
            ? rawCurrentPath
            : [];
        let mappedMessages: Message[] = [];

        if (rawMessages.length > 0) {
          if (rawMessages.every(isStructuredMessage)) {
            mappedMessages = rawMessages.map((msg) => hydrateMessage(msg));
          } else {
            const linearInputs = rawMessages
              .map(toLinearInput)
              .filter((item): item is LinearInput => !!item);
            const linearState = createLinearMessages(linearInputs);
            mappedMessages = linearState.messages;
            currentPath = linearState.currentPath;
          }
        }

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
