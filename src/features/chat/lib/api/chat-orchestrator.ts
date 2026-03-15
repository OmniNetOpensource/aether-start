import { toast } from "@/hooks/useToast";
import { appNavigate } from "@/lib/navigation";
import { applyChatEventToTree } from "@/lib/chat/api/event-handlers";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import type { Message, SerializedMessage } from "@/types/message";
import type { ChatAgentStatus, MessageTreeSnapshot } from "@/types/chat-api";
import type { ChatServerToClientEvent } from "@/types/chat-event-types";

const AGENT_NAME = "chat-agent";
const BUSY_WARNING = "This conversation is already generating a response.";
const SELECT_ROLE_WARNING = "Select a role before sending a message.";
const QUOTA_EXCEEDED_MESSAGE = "Quota exceeded.";

let lastEventId = 0;
export const resetLastEventId = () => {
  lastEventId = 0;
};

let activeController: AbortController | null = null;

const resolveAgentBaseUrl = () => {
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "https"
      : "http";
  const host =
    typeof window !== "undefined" ? window.location.host : "localhost:3000";
  return `${protocol}://${host}/agents/${AGENT_NAME}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const generateId = (prefix = "id") =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

const finalizeStream = () => {
  if (useChatRequestStore.getState().status !== "idle") {
    useChatRequestStore.getState().setStatus("disconnected");
  }
};

const handleSSEMessage = (
  event: string,
  raw: string,
  shouldFilterEventId: boolean,
) => {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return;
    payload = parsed;
  } catch {
    return;
  }

  const { setStatus } = useChatRequestStore.getState();

  switch (event) {
    case "chat_event": {
      if (typeof payload.eventId !== "number") return;
      if (shouldFilterEventId && payload.eventId <= lastEventId) return;
      lastEventId = payload.eventId;
      setStatus("streaming");
      applyChatEventToTree(payload.event as ChatServerToClientEvent);
      return;
    }
    case "chat_started":
      setStatus("streaming");
      return;
    case "chat_finished":
      setStatus("idle");
      return;
    case "sync_response":
      setStatus(payload.status === "running" ? "streaming" : "idle");
      if (Array.isArray(payload.events)) {
        for (const item of payload.events) {
          if (
            isRecord(item) &&
            typeof item.eventId === "number" &&
            item.eventId > lastEventId
          ) {
            lastEventId = item.eventId;
            applyChatEventToTree(item.event as ChatServerToClientEvent);
          }
        }
      }
      return;
    case "busy":
      toast.warning(BUSY_WARNING);
      setStatus("streaming");
      return;
    case "conversation_update":
      if (
        typeof payload.conversationId === "string" &&
        typeof payload.title === "string" &&
        typeof payload.updated_at === "string"
      ) {
        applyChatEventToTree({
          type: "conversation_updated",
          conversationId: payload.conversationId,
          title: payload.title,
          updated_at: payload.updated_at,
        });
      }
      return;
  }
};

const consumeStreamResponse = async (
  response: Response,
  signal: AbortSignal,
  shouldFilterEventId = true,
) => {
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = () => {
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      if (!block.trim()) continue;

      let event = "message";
      const dataLines: string[] = [];

      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trimStart();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length > 0) {
        handleSSEMessage(event, dataLines.join("\n"), shouldFilterEventId);
      }
    }
  };

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      flush();
    }
    buffer += decoder.decode().replace(/\r\n/g, "\n");
    flush();
  } finally {
    reader.cancel().catch(() => {});
  }
};

export const checkAgentStatus = async (
  conversationId: string,
): Promise<{ status: ChatAgentStatus }> => {
  const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}`, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 404) return { status: "idle" };
  if (!response.ok)
    throw new Error(`Agent status probe failed: ${response.status}`);

  const data = (await response.json()) as Record<string, unknown>;
  const status = data.status;

  return {
    status:
      status === "idle" ||
      status === "running" ||
      status === "completed" ||
      status === "aborted" ||
      status === "error"
        ? status
        : "idle",
  };
};

export const startChatRequest = async ({
  messages,
}: {
  messages: Message[];
}) => {
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  if (requestStore.status !== "idle") return;

  resetLastEventId();

  if (!sessionStore.currentRole) {
    toast.warning(SELECT_ROLE_WARNING);
    return;
  }

  let conversationId = sessionStore.conversationId;
  const idempotencyKey = generateId("msg");

  if (!conversationId) {
    conversationId = generateId("conv");
    const now = new Date().toISOString();

    useChatSessionStore.getState().setConversationId(conversationId);
    useChatSessionStore.getState().addConversation({
      id: conversationId,
      title: "New Chat",
      role: sessionStore.currentRole,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });
    appNavigate(`/app/c/${conversationId}`);
  }

  const treeSnapshot: MessageTreeSnapshot = useChatSessionStore
    .getState()
    .getTreeState();

  const body = {
    idempotencyKey,
    role: sessionStore.currentRole,
    promptId: sessionStore.currentPrompt || undefined,
    conversationId,
    conversationHistory: messages.map(
      (message) =>
        ({
          role: message.role,
          blocks: message.blocks,
        }) as SerializedMessage,
    ),
    treeSnapshot,
  };

  activeController?.abort();
  activeController = new AbortController();
  const signal = activeController.signal;
  requestStore.setStatus("sending");

  try {
    const response = await fetch(
      `${resolveAgentBaseUrl()}/${conversationId}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal,
      },
    );

    if (response.status === 409) {
      await response.json().catch(() => ({}));
      toast.warning(BUSY_WARNING);
      useChatRequestStore.getState().setStatus("streaming");
      return;
    }

    if (response.status === 402) {
      const data = (await response.json()) as Record<string, unknown>;
      applyChatEventToTree({
        type: "error",
        message:
          typeof data.message === "string"
            ? data.message
            : QUOTA_EXCEEDED_MESSAGE,
      });
      useChatRequestStore.getState().setStatus("idle");
      return;
    }

    await consumeStreamResponse(response, signal, false);

    finalizeStream();
  } catch (error) {
    if (isAbortError(error)) return;

    if (error instanceof TypeError) {
      finalizeStream();
      return;
    }

    useChatRequestStore.getState().setStatus("idle");
  } finally {
    activeController = null;
  }
};

export const stopActiveChatRequest = () => {
  const conversationId = useChatSessionStore.getState().conversationId;

  activeController?.abort();
  activeController = null;

  if (conversationId) {
    fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  useChatRequestStore.getState().setStatus("idle");
};

export const resumeRunningConversation = async (
  conversationId: string,
  linkedSignal: AbortSignal,
) => {
  if (!conversationId || linkedSignal.aborted) return;

  let agentStatus: { status: ChatAgentStatus };

  try {
    agentStatus = await checkAgentStatus(conversationId);
  } catch {
    if (!linkedSignal.aborted) {
      finalizeStream();
    }
    return;
  }

  if (agentStatus.status !== "running") {
    useChatRequestStore.getState().setStatus("idle");
    return;
  }

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  const handleLinkedAbort = () => controller.abort();
  if (linkedSignal.aborted) {
    controller.abort();
  } else {
    linkedSignal.addEventListener("abort", handleLinkedAbort);
  }

  useChatRequestStore.getState().setStatus("sending");

  try {
    const response = await fetch(
      `${resolveAgentBaseUrl()}/${conversationId}/events`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastEventId }),
        signal: controller.signal,
      },
    );

    await consumeStreamResponse(response, controller.signal);

    finalizeStream();
  } catch (error) {
    if (isAbortError(error)) return;

    if (error instanceof TypeError) {
      finalizeStream();
      return;
    }

    useChatRequestStore.getState().setStatus("idle");
  } finally {
    linkedSignal.removeEventListener("abort", handleLinkedAbort);
    if (activeController === controller) {
      activeController = null;
    }
  }
};
