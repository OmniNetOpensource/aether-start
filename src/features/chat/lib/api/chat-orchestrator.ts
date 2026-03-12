import { toast } from "@/hooks/useToast";
import { useConversationsStore } from "@/stores/zustand/useConversationsStore";
import { applyChatEventToTree } from "@/lib/chat/api/event-handlers";
import type { Message, MessageLike, SerializedMessage } from "@/types/message";
import type { ChatAgentStatus, MessageTreeSnapshot } from "@/types/chat-api";
import { appNavigate } from "@/lib/navigation";
import { useMessageTreeStore } from "@/stores/zustand/useMessageTreeStore";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import type { ChatServerToClientEvent } from "@/types/chat-event-types";

const AGENT_NAME = "chat-agent";
const BUSY_WARNING = "当前会话正在生成中";
const SELECT_ROLE_WARNING = "请先选择角色";
const QUOTA_EXCEEDED_MESSAGE = "额度不足";

type FinishedChatStatus = "completed" | "aborted" | "error";

export type AgentStatusResponse = {
  status: ChatAgentStatus;
  requestId?: string;
};

type StartRequestPayload = {
  messages: Message[];
  titleSource?: MessageLike;
  preferLocalTitle?: boolean;
};

type ChatStatusEvent =
  | { type: "sync"; status: ChatAgentStatus; requestId?: string }
  | { type: "started"; requestId: string }
  | { type: "finished"; requestId: string; status: FinishedChatStatus }
  | { type: "busy"; currentRequestId: string };

// 服务端会把聊天事件按递增的数字 id 持久化下来。
// 这里在内存里记录当前已经消费到的最大 eventId，这样断线重连时既能从正确位置继续，
// 也能跳过已经应用过的事件，避免重复改动消息树。
const eventCursor = (() => {
  let value = 0;

  return {
    get value() {
      return value;
    },
    mark(eventId: number) {
      if (eventId > value) {
        value = eventId;
      }
    },
    shouldConsume(eventId: number) {
      return eventId > value;
    },
    reset() {
      value = 0;
    },
  };
})();

// 一个标签页里同时只允许存在一条活跃流。
// 无论是发起新请求还是重连，都会替换掉旧的 controller，避免旧流继续写入共享状态。
let activeAbortController: AbortController | null = null;

export const resetLastEventId = () => eventCursor.reset();

// chat agent 接口直接挂在当前站点 origin 下。
// 这里从浏览器当前的 host/protocol 推导基础地址，开发和线上都能共用，不需要额外的前端环境变量。
const resolveAgentBaseUrl = () => {
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const host =
    typeof window !== "undefined" ? window.location.host : "localhost:3000";

  return `${isSecure ? "https" : "http"}://${host}/agents/${AGENT_NAME}`;
};

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

// 创建当前活跃流使用的 AbortController。
// 如果上层传入了 signal，它中止时这里也要跟着中止；但我们仍然保留自己的 controller，
// 因为当前模块还需要在“新请求接管旧请求”时主动取消旧流。
const replaceActiveAbortController = (linkedSignal?: AbortSignal) => {
  activeAbortController?.abort();

  const controller = new AbortController();
  const abortSignal = linkedSignal;
  const unlink = abortSignal ? () => controller.abort() : null;

  activeAbortController = controller;

  if (abortSignal && unlink) {
    abortSignal.addEventListener("abort", unlink);
  }

  return {
    signal: controller.signal,
    release() {
      if (abortSignal && unlink) {
        abortSignal.removeEventListener("abort", unlink);
      }
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    },
  };
};

// 这里没有直接用 EventSource，而是统一走 fetch 流式读取。
// 原因是发起聊天是 POST，请求恢复时又需要带认证信息的普通 fetch，所以两条路径都复用这一套 SSE 解析逻辑。
// 解析时还顺手处理了 CRLF 行尾和网络分片导致的半包问题。
const consumeSSE = async (
  body: ReadableStream<Uint8Array>,
  onMessage: (event: string, data: string) => void,
  signal?: AbortSignal,
) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBufferedMessages = () => {
    let boundaryIndex = buffer.indexOf("\n\n");

    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      if (!block.trim()) {
        continue;
      }

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
        onMessage(event, dataLines.join("\n"));
      }
    }
  };

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      flushBufferedMessages();
    }

    buffer += decoder.decode().replace(/\r\n/g, "\n");
    flushBufferedMessages();
  } finally {
    reader.cancel().catch(() => {});
  }
};

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

// 流断了，不代表服务端一定已经停止生成。
// 这一类错误会把请求留在“可重连”状态，让路由层的重连逻辑可以重新订阅，并从上一个 eventId 继续接上。
const isRecoverableStreamError = (error: unknown) => {
  if (isAbortError(error) || !(error instanceof Error)) {
    return false;
  }

  if (error.message.startsWith("Chat request failed:")) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    error instanceof TypeError ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("stream") ||
    message.includes("load failed")
  );
};

// 重置本次请求相关的生命周期状态，但保留角色、prompt 这类和当前请求无关的选择。
const resetRequestState = () => {
  const store = useChatRequestStore.getState();
  store.clearRequestState();
  store.setConnectionState("idle");
};

// 只把流标记为断开，不把请求判定为结束。
// 这点很关键：UI 仍然应该认为 assistant 还在忙，页面也还能继续重连，因为服务端可能还在生成。
// 同时它还会避免误改别的 requestId 对应的状态。
const markRequestDisconnected = (requestId?: string | null) => {
  const store = useChatRequestStore.getState();

  if (
    requestId &&
    store.activeRequestId &&
    store.activeRequestId !== requestId
  ) {
    return;
  }

  if (store.requestPhase === "done") {
    return;
  }

  store.setRequestPhase("answering");
  store.setConnectionState("disconnected");
};

// 大多数事件都只属于某一个请求；如果当前已经切到更新的请求，就应该忽略旧请求的事件。
// 但会话标题更新是例外，它不依赖当前活跃 requestId，安全的话可以直接应用。
const handleChatEvent = (event: ChatServerToClientEvent, requestId: string) => {
  const store = useChatRequestStore.getState();
  const isConversationUpdate = event.type === "conversation_updated";

  if (
    !isConversationUpdate &&
    store.activeRequestId &&
    store.activeRequestId !== requestId
  ) {
    return;
  }

  if (
    !isConversationUpdate &&
    (store.activeRequestId === requestId || store.requestPhase !== "done")
  ) {
    store.setRequestPhase("answering");
  }

  applyChatEventToTree(event);
};

// 消费一条服务端持久化事件前，会先检查数据形状、请求归属和事件顺序。
// eventCursor 的校验让“重连时回放历史事件”这件事变得安全，因为 sync 响应和事件流里都可能再次带回旧事件。
const consumeEvent = (item: Record<string, unknown>) => {
  const eventId = typeof item.eventId === "number" ? item.eventId : null;
  const requestId = typeof item.requestId === "string" ? item.requestId : null;
  const event = isRecord(item.event)
    ? (item.event as ChatServerToClientEvent)
    : null;

  if (!eventId || !requestId || !event || !eventCursor.shouldConsume(eventId)) {
    return;
  }

  eventCursor.mark(eventId);
  handleChatEvent(event, requestId);
};

// requestPhase 和 connectionState 是刻意拆开的两个维度。
// 一个请求完全可能处在“正在回答”，但传输连接已经断开；后续重连时，也只是把 connectionState 拉回 connected，
// 并不是重新创建一条新请求。
const handleChatStatus = (statusEvent: ChatStatusEvent) => {
  const store = useChatRequestStore.getState();

  switch (statusEvent.type) {
    case "busy":
      toast.warning(BUSY_WARNING);
      store.setRequestPhase("answering");
      store.setActiveRequestId(statusEvent.currentRequestId);
      store.setConnectionState("connected");
      return;

    case "started":
      store.setRequestPhase(
        store.requestPhase === "answering" ? "answering" : "sending",
      );
      store.setActiveRequestId(statusEvent.requestId);
      store.setConnectionState("connected");
      return;

    case "sync":
      if (statusEvent.status === "running") {
        store.setRequestPhase("answering");
        store.setActiveRequestId(
          statusEvent.requestId ?? store.activeRequestId,
        );
        store.setConnectionState("connected");
        return;
      }

      if (statusEvent.status !== "idle") {
        store.setRequestPhase("done");
        store.setActiveRequestId(null);
      }
      return;

    case "finished":
      if (
        store.activeRequestId &&
        store.activeRequestId !== statusEvent.requestId
      ) {
        return;
      }

      store.setRequestPhase("done");
      store.setActiveRequestId(null);
  }
};

// 服务端在 SSE 之上定义了一层自己的事件协议。
// 这里负责把原始 SSE 数据翻译成前端本地的状态更新和消息树变更。
const dispatchSSE = (event: string, raw: string) => {
  let payload: Record<string, unknown>;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return;
    }
    payload = parsed;
  } catch {
    return;
  }

  switch (event) {
    case "chat_event":
      consumeEvent(payload);
      return;

    case "chat_started":
      if (typeof payload.requestId === "string") {
        handleChatStatus({ type: "started", requestId: payload.requestId });
      }
      return;

    case "chat_finished":
      if (typeof payload.requestId !== "string") {
        return;
      }

      handleChatStatus({
        type: "finished",
        requestId: payload.requestId,
        status:
          payload.status === "completed" ||
          payload.status === "aborted" ||
          payload.status === "error"
            ? payload.status
            : "error",
      });
      return;

    case "sync_response":
      handleChatStatus({
        type: "sync",
        status: isChatAgentStatus(payload.status) ? payload.status : "idle",
        requestId:
          typeof payload.requestId === "string" ? payload.requestId : undefined,
      });

      if (!Array.isArray(payload.events)) {
        return;
      }

      for (const item of payload.events) {
        if (isRecord(item)) {
          consumeEvent(item);
        }
      }
      return;

    case "busy":
      if (typeof payload.currentRequestId === "string") {
        handleChatStatus({
          type: "busy",
          currentRequestId: payload.currentRequestId,
        });
      }
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
  }
};

const consumeStreamResponse = async (
  response: Response,
  signal: AbortSignal,
) => {
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  await consumeSSE(response.body, dispatchSSE, signal);
};

// 请求体里同时带上“拍平后的对话历史”和“完整消息树快照”。
// 前者给当前这轮生成直接使用，后者让后端知道当前分支上下文，能沿着本地同一棵树继续生成。
const buildPreparedRequest = (
  conversationId: string,
  role: string,
  promptId: string | undefined,
  requestId: string,
  messages: Message[],
) => {
  const rawTreeSnapshot: MessageTreeSnapshot = useMessageTreeStore
    .getState()
    .getTreeState();
  const treeSnapshot: MessageTreeSnapshot = {
    ...rawTreeSnapshot,
    messages: rawTreeSnapshot.messages,
  };

  const conversationHistory: SerializedMessage[] = messages.map(
    (message) =>
      ({
        role: message.role,
        blocks: message.blocks,
      }) as SerializedMessage,
  );

  return {
    requestId,
    role,
    promptId,
    conversationId,
    conversationHistory,
    treeSnapshot,
  };
};

// 主动探测某个会话在服务端 worker 里的 agent 状态。
// 重连前先做这一步，前端才能区分“只是流断了”还是“服务端其实已经生成结束了”。
export const checkAgentStatus = async (
  conversationId: string,
): Promise<AgentStatusResponse> => {
  const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}`, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 404) {
    return { status: "idle" };
  }

  if (!response.ok) {
    throw new Error(`Agent status probe failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    status: isChatAgentStatus(data.status) ? data.status : "idle",
    requestId: typeof data.requestId === "string" ? data.requestId : undefined,
  };
};

// 从浏览器侧发起一条全新的聊天请求。
// 它负责几件事：
// - 如果这是首轮消息，先补建会话壳子
// - 发送初始请求体
// - 消费实时返回的 SSE 流
// - 如果中途断流，保留足够的状态给后续重连使用
export const startChatRequest = async ({ messages }: StartRequestPayload) => {
  const requestStore = useChatRequestStore.getState();
  const treeStore = useMessageTreeStore.getState();
  if (requestStore.requestPhase !== "done") {
    return;
  }

  if (!treeStore.currentRole) {
    toast.warning(SELECT_ROLE_WARNING);
    return;
  }

  let conversationId = treeStore.conversationId;
  const requestId = generateId("msg");

  if (!conversationId) {
    conversationId = generateId("conv");
    const now = new Date().toISOString();

    useMessageTreeStore.getState().setConversationId(conversationId);
    useConversationsStore.getState().addConversation({
      id: conversationId,
      title: "New Chat",
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });
    appNavigate(`/app/c/${conversationId}`);
  }

  const body = buildPreparedRequest(
    conversationId,
    treeStore.currentRole,
    treeStore.currentPrompt || undefined,
    requestId,
    messages,
  );

  const { signal, release } = replaceActiveAbortController();
  requestStore.setRequestPhase("sending");
  requestStore.setActiveRequestId(requestId);
  requestStore.setConnectionState("connecting");

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

    // 409 表示这个会话已经有别的请求在跑了。
    // 这里直接把本地状态切到那个已有请求上，UI 后续就可以接过去显示它的进度。
    if (response.status === 409) {
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.currentRequestId === "string") {
        handleChatStatus({
          type: "busy",
          currentRequestId: data.currentRequestId,
        });
      }
      return;
    }

    // 这里把 402 当作额度不足处理。
    // 这种情况对当前尝试来说已经是终态了，所以直接抛一个 error 事件出来，并完整重置请求状态。
    if (response.status === 402) {
      const data = (await response.json()) as Record<string, unknown>;
      applyChatEventToTree({
        type: "error",
        message:
          typeof data.message === "string"
            ? data.message
            : QUOTA_EXCEEDED_MESSAGE,
      });
      resetRequestState();
      return;
    }

    requestStore.setConnectionState("connected");
    await consumeStreamResponse(response, signal);

    // 流结束时，服务端未必已经发出了终态事件。
    // 所以这里不会急着把请求判定成功完成，而是先保留成可重连状态。
    if (useChatRequestStore.getState().activeRequestId === requestId) {
      markRequestDisconnected(requestId);
    }
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    // 这类可恢复的传输错误不会直接把请求清掉，而是保留成“请求还活着，只是当前连接断了”。
    if (isRecoverableStreamError(error)) {
      markRequestDisconnected(requestId);
      return;
    }

    resetRequestState();
  } finally {
    release();
  }
};

// 先立刻停掉本地流，再向服务端发一个尽力而为的 abort 请求，让服务端也停止生成。
export const stopActiveChatRequest = () => {
  const conversationId = useMessageTreeStore.getState().conversationId;
  const requestId = useChatRequestStore.getState().activeRequestId;

  activeAbortController?.abort();
  activeAbortController = null;

  if (conversationId) {
    fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ requestId }),
    }).catch(() => {});
  }

  resetRequestState();
};

// 在路由切换、页面刷新或流中断后，重新挂回一个仍在运行的会话。
// 先探测状态，再决定要不要重连；否则本地任何过期请求都会盲目去订阅 events，徒增无效连接。
export const resumeRunningConversation = async (
  conversationId: string,
  signal: AbortSignal,
) => {
  if (!conversationId) {
    return;
  }

  let agentStatus: AgentStatusResponse;

  try {
    agentStatus = await checkAgentStatus(conversationId);
  } catch {
    if (!signal.aborted) {
      markRequestDisconnected(useChatRequestStore.getState().activeRequestId);
    }
    return;
  }

  if (agentStatus.status !== "running") {
    resetRequestState();
    return;
  }

  const requestStore = useChatRequestStore.getState();
  requestStore.setRequestPhase("answering");
  requestStore.setActiveRequestId(agentStatus.requestId ?? null);
  requestStore.setConnectionState("connecting");

  const activeRequest = replaceActiveAbortController(signal);

  try {
    // 把当前 eventCursor 带给服务端，告诉它哪些持久化事件前端已经渲染过了。
    const response = await fetch(
      `${resolveAgentBaseUrl()}/${conversationId}/events?lastEventId=${eventCursor.value}`,
      {
        credentials: "include",
        signal: activeRequest.signal,
      },
    );

    requestStore.setConnectionState("connected");
    await consumeStreamResponse(response, activeRequest.signal);

    // 和新请求一样，如果流结束时还没收到终态，就继续保持可重连，而不是悄悄清空请求状态。
    if (
      agentStatus.requestId &&
      useChatRequestStore.getState().activeRequestId === agentStatus.requestId
    ) {
      markRequestDisconnected(agentStatus.requestId);
    }
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    if (isRecoverableStreamError(error)) {
      markRequestDisconnected(agentStatus.requestId);
      return;
    }

    resetRequestState();
  } finally {
    activeRequest.release();
  }
};
