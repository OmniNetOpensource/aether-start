import { toast } from "@/hooks/useToast";
import { useConversationsStore } from "@/stores/zustand/useConversationsStore";
import { applyChatEventToTree } from "@/lib/chat/api/event-handlers";
import type { Message, MessageLike, SerializedMessage } from "@/types/message";
import type {
  ChatAgentStatus,
  MessageTreeSnapshot,
  PersistedChatEvent,
} from "@/types/chat-api";
import { appNavigate } from "@/lib/navigation";
import { useMessageTreeStore } from "@/stores/zustand/useMessageTreeStore";
import {
  isChatRequestActive,
  selectActiveRequestId,
  selectChatRequestStatus,
  selectCurrentRole,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";
import type { ChatServerToClientEvent } from "@/types/chat-event-types";

const AGENT_NAME = "chat-agent";

// ── URL resolution ──────────────────────────────────────────────────────

const resolveAgentBaseUrl = () => {
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const host =
    typeof window !== "undefined" ? window.location.host : "localhost:3000";
  return `${isSecure ? "https" : "http"}://${host}/agents/${AGENT_NAME}`;
};

// ── Event ID cursor ─────────────────────────────────────────────────────

const eventCursor = (() => {
  let value = 0;
  return {
    get value() {
      return value;
    },
    mark(eventId: number) {
      if (eventId > value) value = eventId;
    },
    shouldConsume(eventId: number) {
      return eventId > value;
    },
    reset() {
      value = 0;
    },
  };
})();

export const resetLastEventId = () => eventCursor.reset();

// ── Type guards & helpers ───────────────────────────────────────────────

const isChatAgentStatus = (value: unknown): value is ChatAgentStatus =>
  value === "idle" ||
  value === "running" ||
  value === "completed" ||
  value === "aborted" ||
  value === "error";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const generateId = (prefix = "id") =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

// ── Agent status probe ──────────────────────────────────────────────────

export type AgentStatusResponse = {
  status: ChatAgentStatus;
  requestId?: string;
};

export const checkAgentStatus = async (
  conversationId: string,
): Promise<AgentStatusResponse> => {
  const url = `${resolveAgentBaseUrl()}/${conversationId}`;

  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (res.status === 404) {
    return { status: "idle" };
  }
  if (!res.ok) {
    throw new Error(`Agent status probe failed: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const status = isChatAgentStatus(data.status) ? data.status : "idle";
  const requestId =
    typeof data.requestId === "string" ? data.requestId : undefined;

  return { status, requestId };
};

// ── SSE consumer ────────────────────────────────────────────────────────

async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onMessage: (event: string, data: string) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop()!;

      for (const part of parts) {
        let event = "message";
        let data = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (data) onMessage(event, data);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ── Event dispatching ───────────────────────────────────────────────────

type ChatEventMeta = {
  requestId: string;
  eventId: number;
  source: "sync" | "live";
};

const consumeEvent = (
  item: Record<string, unknown>,
  source: "sync" | "live",
): boolean => {
  const eventId = typeof item.eventId === "number" ? item.eventId : null;
  const requestId =
    typeof item.requestId === "string" ? item.requestId : null;
  const event = isRecord(item.event)
    ? (item.event as ChatServerToClientEvent)
    : null;

  if (!eventId || !requestId || !event) return false;
  if (!eventCursor.shouldConsume(eventId)) return false;

  eventCursor.mark(eventId);
  handleChatEvent(event, { requestId, eventId, source });
  return true;
};

function dispatchSSE(event: string, raw: string) {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(data)) return;

  switch (event) {
    case "chat_event":
      consumeEvent(data, "live");
      break;

    case "chat_started":
      if (typeof data.requestId === "string") {
        handleChatStatus({ type: "started", requestId: data.requestId });
      }
      break;

    case "chat_finished": {
      if (typeof data.requestId !== "string") break;
      const status =
        data.status === "completed" ||
        data.status === "aborted" ||
        data.status === "error"
          ? data.status
          : "error";
      handleChatStatus({
        type: "finished",
        requestId: data.requestId,
        status,
      });
      break;
    }

    case "sync_response": {
      const status = isChatAgentStatus(data.status) ? data.status : "idle";
      const requestId =
        typeof data.requestId === "string" ? data.requestId : undefined;
      const events = Array.isArray(data.events)
        ? (data.events as PersistedChatEvent[])
        : [];

      handleChatStatus({ type: "sync", status, requestId });

      for (const item of events) {
        if (isRecord(item)) consumeEvent(item as Record<string, unknown>, "sync");
      }
      break;
    }

    case "busy":
      if (typeof data.currentRequestId === "string") {
        handleChatStatus({
          type: "busy",
          currentRequestId: data.currentRequestId,
        });
      }
      break;

    case "conversation_update": {
      const conversationId =
        typeof data.conversationId === "string" ? data.conversationId : null;
      const title = typeof data.title === "string" ? data.title : null;
      const updated_at =
        typeof data.updated_at === "string" ? data.updated_at : null;

      if (conversationId && title && updated_at) {
        applyChatEventToTree({
          type: "conversation_updated",
          conversationId,
          title,
          updated_at,
        });
      }
      break;
    }
  }
}

// ── Global event handlers ───────────────────────────────────────────────

type ChatStatusEvent =
  | { type: "sync"; status: ChatAgentStatus; requestId?: string }
  | { type: "started"; requestId: string }
  | {
      type: "finished";
      requestId: string;
      status: "completed" | "aborted" | "error";
    }
  | { type: "busy"; currentRequestId: string };

const handleChatEvent = (
  event: ChatServerToClientEvent,
  meta: ChatEventMeta,
) => {
  const store = useChatRequestStore.getState();
  const activeRequestId = selectActiveRequestId(store);
  const status = selectChatRequestStatus(store);

  if (
    event.type !== "conversation_updated" &&
    activeRequestId &&
    activeRequestId !== meta.requestId
  ) {
    return;
  }

  if (
    event.type !== "conversation_updated" &&
    (activeRequestId === meta.requestId || isChatRequestActive(status))
  ) {
    useChatRequestStore.getState().setStatus("answering");
  }

  applyChatEventToTree(event);
};

const handleChatStatus = (statusEvent: ChatStatusEvent) => {
  const store = useChatRequestStore.getState();

  switch (statusEvent.type) {
    case "busy":
      toast.warning("当前会话正在生成中");
      store.setStatus("answering");
      store.setActiveRequestId(statusEvent.currentRequestId);
      break;

    case "started":
      store.setStatus(
        selectChatRequestStatus(store) === "answering"
          ? "answering"
          : "sending",
      );
      store.setActiveRequestId(statusEvent.requestId);
      break;

    case "sync":
      if (statusEvent.status === "running") {
        store.setStatus("answering");
        store.setActiveRequestId(
          statusEvent.requestId ?? selectActiveRequestId(store),
        );
      } else if (statusEvent.status !== "idle") {
        store.setStatus("done");
        store.setActiveRequestId(null);
      }
      break;

    case "finished": {
      const activeRequestId = selectActiveRequestId(
        useChatRequestStore.getState(),
      );
      if (activeRequestId && activeRequestId !== statusEvent.requestId) break;
      store.setStatus("done");
      store.setActiveRequestId(null);
      break;
    }
  }
};

// ── Module-level state ──────────────────────────────────────────────────

let activeAbort: AbortController | null = null;

// ── Request building ────────────────────────────────────────────────────

type StartRequestOptions = {
  messages: Message[];
  titleSource?: MessageLike;
  preferLocalTitle?: boolean;
};

const buildPreparedRequest = (
  conversationId: string,
  role: string,
  requestId: string,
  messages: Message[],
) => {
  const conversationHistory: SerializedMessage[] = messages.map(
    (msg) =>
      ({
        role: msg.role,
        blocks: msg.blocks,
      }) as SerializedMessage,
  );

  const treeSnapshot = useMessageTreeStore
    .getState()
    ._getTreeState() as MessageTreeSnapshot;

  return { requestId, role, conversationId, conversationHistory, treeSnapshot };
};

// ── Public commands ─────────────────────────────────────────────────────

export const startChatRequest = async (options: StartRequestOptions) => {
  const { messages } = options;
  const store = useChatRequestStore.getState();
  const selectedRole = selectCurrentRole(store);

  if (isChatRequestActive(selectChatRequestStatus(store))) return;
  if (!selectedRole) {
    toast.warning("请先选择角色");
    return;
  }

  let currentConversationId = useMessageTreeStore.getState().conversationId;
  const requestId = generateId("msg");

  if (!currentConversationId) {
    currentConversationId = generateId("conv");
    const now = new Date().toISOString();

    useMessageTreeStore.getState().setConversationId(currentConversationId);

    useConversationsStore.getState().addConversation({
      id: currentConversationId,
      title: "New Chat",
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });

    appNavigate(`/app/c/${currentConversationId}`);
  }

  const body = buildPreparedRequest(
    currentConversationId,
    selectedRole,
    requestId,
    messages,
  );

  activeAbort?.abort();
  activeAbort = new AbortController();

  const reqStore = useChatRequestStore.getState();
  reqStore.setStatus("sending");
  reqStore.setActiveRequestId(requestId);
  reqStore.setConnectionState("connected");

  const baseUrl = resolveAgentBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/${currentConversationId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      signal: activeAbort.signal,
    });

    if (res.status === 409) {
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.currentRequestId === "string") {
        handleChatStatus({
          type: "busy",
          currentRequestId: data.currentRequestId,
        });
      }
      return;
    }

    if (res.status === 402) {
      const data = (await res.json()) as Record<string, unknown>;
      const message =
        typeof data.message === "string" ? data.message : "额度不足";
      applyChatEventToTree({ type: "error", message });
      useChatRequestStore.getState().clearRequestState();
      return;
    }

    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed: ${res.status}`);
    }

    await consumeSSE(res.body, dispatchSSE, activeAbort.signal);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    useChatRequestStore.getState().clearRequestState();
  }
};

export const stopActiveChatRequest = () => {
  const convId = useMessageTreeStore.getState().conversationId;
  const requestId = selectActiveRequestId(useChatRequestStore.getState());

  activeAbort?.abort();
  activeAbort = null;

  if (convId) {
    const baseUrl = resolveAgentBaseUrl();
    fetch(`${baseUrl}/${convId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ requestId }),
    }).catch(() => {});
  }

  useChatRequestStore.getState().clearRequestState();
};

// ── Event subscription (for reconnect / page restore) ───────────────────

const subscribeToEvents = async (
  conversationId: string,
  signal: AbortSignal,
) => {
  const baseUrl = resolveAgentBaseUrl();
  const res = await fetch(
    `${baseUrl}/${conversationId}/events?lastEventId=${eventCursor.value}`,
    {
      credentials: "include",
      signal,
    },
  );

  if (!res.ok || !res.body) return;

  await consumeSSE(res.body, dispatchSSE, signal);
};

export const resumeRunningConversation = async (
  conversationId: string,
  signal: AbortSignal,
) => {
  if (!conversationId) return;

  let agentStatus: AgentStatusResponse;
  try {
    agentStatus = await checkAgentStatus(conversationId);
  } catch {
    return;
  }

  if (agentStatus.status !== "running") return;

  const store = useChatRequestStore.getState();
  store.setStatus("answering");
  store.setActiveRequestId(agentStatus.requestId ?? null);
  store.setConnectionState("connected");

  activeAbort?.abort();
  activeAbort = new AbortController();

  // Link lifecycle to the provided signal
  const onAbort = () => activeAbort?.abort();
  signal.addEventListener("abort", onAbort);

  try {
    await subscribeToEvents(conversationId, activeAbort.signal);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};
