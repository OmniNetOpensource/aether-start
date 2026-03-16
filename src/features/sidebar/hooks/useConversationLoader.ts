import { useEffect } from "react";
import {
  resetLastEventId,
  resumeRunningConversation,
} from "@/lib/chat/api/chat-orchestrator";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import { useEditingStore } from "@/stores/zustand/useEditingStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import { getConversationFn } from "@/server/functions/conversations";
import { buildCurrentPath } from "@/lib/conversation/tree/message-tree";
import type { Attachment, Message } from "@/types/message";

const restoreAttachments = (
  attachments: Array<
    Attachment & {
      displayUrl?: string;
      thumbnailUrl?: string;
      thumbnailStorageKey?: string;
    }
  >,
): Attachment[] =>
  attachments
    .map((att) => ({
      id: att.id,
      kind: att.kind,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
      url: att.url ?? att.displayUrl ?? "",
      storageKey: att.storageKey,
      thumbnailUrl: att.thumbnailUrl,
      thumbnailStorageKey: att.thumbnailStorageKey,
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
                  Array.isArray(block.attachments) ? block.attachments : [],
                ),
              }
            : { ...block },
      )
    : [];

const hydrateMessage = (msg: Message): Message =>
  ({
    id: msg.id,
    parentId: msg.parentId ?? null,
    role: msg.role,
    blocks: hydrateBlocks(msg.blocks),
    prevSibling: msg.prevSibling ?? null,
    nextSibling: msg.nextSibling ?? null,
    latestChild: msg.latestChild ?? null,
    createdAt: msg.createdAt ?? new Date().toISOString(),
  }) as Message;

export type ConversationLoaderPayload = NonNullable<
  Awaited<ReturnType<typeof getConversationFn>>
>;

export type LoaderData =
  | { newChat: boolean }
  | { conversation: ConversationLoaderPayload };

export function useConversationLoader(
  loadingConversationId: string | undefined,
  loaderData: LoaderData | undefined,
) {
  const currentConversationId = useChatSessionStore(
    (state) => state.conversationId,
  );
  const initializeTree = useChatSessionStore((state) => state.initializeTree);
  const setConversationId = useChatSessionStore(
    (state) => state.setConversationId,
  );
  const setArtifacts = useChatSessionStore((state) => state.setArtifacts);

  useEffect(() => {
    if (!loadingConversationId) return;
    if (loaderData && "newChat" in loaderData && loaderData.newChat) return;
    if (currentConversationId === loadingConversationId) return;

    const conversation =
      loaderData && "conversation" in loaderData
        ? loaderData.conversation
        : null;
    if (!conversation) return;

    useComposerStore.getState().clear();

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

    useEditingStore.getState().clear();
    setConversationId(loadingConversationId);
    initializeTree(mappedMessages, currentPath);
    setArtifacts(
      Array.isArray(conversation.artifacts) ? conversation.artifacts : [],
    );
    const store = useChatSessionStore.getState();
    const roleId =
      conversation.role ??
      store.currentRole ??
      store.availableRoles[0]?.id ??
      "";
    store.setCurrentRole(roleId);
  }, [
    loadingConversationId,
    currentConversationId,
    loaderData,
    setConversationId,
    initializeTree,
    setArtifacts,
  ]);

  useEffect(() => {
    if (
      !loadingConversationId ||
      currentConversationId !== loadingConversationId
    ) {
      return;
    }

    const requestStatus = useChatRequestStore.getState().status;
    if (requestStatus === "sending" || requestStatus === "streaming") {
      return;
    }

    resetLastEventId();

    const abortController = new AbortController();

    resumeRunningConversation(
      loadingConversationId,
      abortController.signal,
    ).catch(() => {});

    return () => {
      abortController.abort();
    };
  }, [loadingConversationId, currentConversationId]);

  const conversations = useChatSessionStore((state) => state.conversations);
  const title = conversations.find(
    (item) => item.id === loadingConversationId,
  )?.title;

  useEffect(() => {
    const defaultTitle = "Aether";

    if (title) {
      const truncatedTitle =
        title.length > 50 ? `${title.slice(0, 50)}...` : title;
      document.title = `${truncatedTitle} - Aether`;
    } else {
      document.title = defaultTitle;
    }

    return () => {
      document.title = defaultTitle;
    };
  }, [title]);

  useEffect(() => {
    return () => {
      resetLastEventId();
      useChatRequestStore.getState().setStatus("idle");
    };
  }, [loadingConversationId]);

  return { isLoading: loadingConversationId !== currentConversationId };
}
