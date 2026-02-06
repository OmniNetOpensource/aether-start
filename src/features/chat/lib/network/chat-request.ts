import { ChatClient } from "./chat-client";
import { toast } from "@/src/hooks/useToast";
import { localDB } from "@/src/lib/storage/indexed-db";
import { useConversationsStore } from "@/src/features/sidebar/store/useConversationsStore";
import { buildConversationTitle } from "@/src/features/chat/lib/format";
import type {
  Message,
  MessageLike,
  SerializedMessage,
} from "@/src/features/chat/types/chat";
import { serializeMessagesForRequest } from "./serialization";
import {
  cloneMessages,
  extractContentFromBlocks,
  type AssistantAddition,
} from "../tree/block-operations";
import { computeMessagesFromPath } from "../tree/message-tree";
import { generateTitleFn } from "@/src/server/functions/chat-title";

const generateLocalMessageId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const DEFAULT_CONVERSATION_TITLE = "New Chat";

const isFirstRound = (messages: Message[]) => {
  const userCount = messages.filter((message) => message.role === "user").length;
  const assistantCount = messages.filter(
    (message) => message.role === "assistant"
  ).length;
  return userCount === 1 && assistantCount === 1;
};

const buildTitleMessages = (messages: Message[]): SerializedMessage[] =>
  messages.map((message) => ({
    role: message.role,
    blocks: message.blocks
      .filter((block) => block.type === "content")
      .map((block) => ({ type: "content", content: block.content })),
  }));

const generateTitle = async (conversationId: string, messages: Message[]) => {
  const assistantMessage = messages.find(
    (message) => message.role === "assistant"
  );
  const assistantText = assistantMessage
    ? extractContentFromBlocks(assistantMessage.blocks).trim()
    : "";

  if (!assistantText) {
    return;
  }

  try {
    const result = await generateTitleFn({
      data: { messages: buildTitleMessages(messages) },
    });
    const title = typeof result.title === "string" ? result.title.trim() : "";

    if (!title || title === DEFAULT_CONVERSATION_TITLE) {
      return;
    }

    const { updateConversationTitle } = useConversationsStore.getState();
    await updateConversationTitle(conversationId, title);
  } catch (error) {
    console.error("Failed to generate conversation title:", error);
  }
};

// Aggregated store getter (message tree + request state).
type StoreGetter = () => {
  messages: Message[];
  currentPath: number[];
  conversationId: string | null;
  currentRole: string;
  pending: boolean;
  activeRequestId: string | null;
  appendToAssistant: (addition: AssistantAddition) => void;
};

type StoreState = {
  messages: Message[];
  currentPath: number[];
  conversationId: string | null;
  pending: boolean;
  chatClient: ChatClient | null;
  activeRequestId: string | null;
};

// Setter updates request state (pending/client/requestId) and conversation id.
type StoreSetter = (
  partial:
    | Partial<StoreState>
    | ((state: StoreState) => Partial<StoreState>)
) => void;

type StartRequestOptions = {
  messages: Message[];
  navigate?: (path: string) => void;
  titleSource?: MessageLike;
  preferLocalTitle?: boolean;
};

export const startChatRequest = async (
  get: StoreGetter,
  set: StoreSetter,
  options: StartRequestOptions
) => {
  const { messages, navigate, titleSource, preferLocalTitle } = options;
  const selectedRole = get().currentRole;

  if (get().pending) {
    return;
  }
  if (!selectedRole) {
    toast.warning("请先选择角色");
    return;
  }

  let currentConversationId = get().conversationId;

  const requestId = generateLocalMessageId();

  let serializedMessages: SerializedMessage[];
  try {
    serializedMessages = await serializeMessagesForRequest(messages);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error || "未知原因");
    console.error("Failed to serialize attachments", error);
    toast.error(
      `附件处理失败：${detail}。建议: 重新选择附件或减少数量后重试。`
    );
    return;
  }

  const persistLocalConversation = async (
    id: string,
    options?: {
      title?: string;
      created_at?: string;
      updated_at?: string;
      titleSource?: MessageLike;
    }
  ) => {
    const now = options?.updated_at ?? new Date().toISOString();
    const existing = await localDB.get(id);
    const allMessages = cloneMessages(get().messages);
    const currentPath =
      get().currentPath.length > 0
        ? get().currentPath
        : existing?.currentPath ?? [];
    const pathMessages = computeMessagesFromPath(get().messages, currentPath);
    const { pinnedConversations, normalConversations } =
      useConversationsStore.getState();
    const storedConversation = [
      ...pinnedConversations,
      ...normalConversations,
    ].find((item) => item.id === id);
    const pinned = storedConversation?.pinned ?? existing?.pinned;
    const pinned_at = storedConversation?.pinned_at ?? existing?.pinned_at;
    const resolvedTitleSource =
      options?.titleSource ??
      pathMessages.find((message) => message.role === "user") ??
      pathMessages[0];
    const title =
      options?.title ??
      existing?.title ??
      (resolvedTitleSource
        ? buildConversationTitle(resolvedTitleSource)
        : DEFAULT_CONVERSATION_TITLE);
    const created_at = options?.created_at ?? existing?.created_at ?? now;

    await localDB.save({
      id,
      title,
      currentPath,
      messages: allMessages,
      created_at,
      updated_at: now,
      pinned,
      pinned_at,
    });

  };

  const chatClient = new ChatClient({
    onEvent: (data) => {
      if (get().activeRequestId !== requestId) {
        return;
      }
      if (data.type === "conversation_created") {
        const id =
          typeof data.conversationId === "string" ? data.conversationId : null;
        if (id) {
          currentConversationId = id;
          set((state) => ({
            conversationId: state.conversationId ?? id,
          }));

          const serverTitle =
            typeof data.title === "string"
              ? data.title
              : DEFAULT_CONVERSATION_TITLE;
          const fallbackTitle = titleSource
            ? buildConversationTitle(titleSource)
            : serverTitle;
          const resolvedTitle = preferLocalTitle
            ? fallbackTitle
            : serverTitle || fallbackTitle;
          const user_id = typeof data.user_id === "string" ? data.user_id : "";
          const created_at =
            typeof data.created_at === "string"
              ? data.created_at
              : new Date().toISOString();
          const updated_at =
            typeof data.updated_at === "string"
              ? data.updated_at
              : new Date().toISOString();
          const { addConversation } = useConversationsStore.getState();
          addConversation({
            id,
            title: resolvedTitle,
            user_id,
            created_at,
            updated_at,
          });

          void persistLocalConversation(id, {
            title: resolvedTitle,
            created_at,
            updated_at,
            titleSource,
          });

          navigate?.(`/app/c/${id}`);
        }
        return;
      }

      if (data.type === "conversation_updated") {
        const id =
          typeof data.conversationId === "string" ? data.conversationId : null;
        const updated_at =
          typeof data.updated_at === "string"
            ? data.updated_at
            : new Date().toISOString();

        if (id) {
          void persistLocalConversation(id, { updated_at, titleSource });

          const { pinnedConversations, normalConversations, setConversations } =
            useConversationsStore.getState();
          const allConversations = [
            ...pinnedConversations,
            ...normalConversations,
          ];
          const existing = allConversations.find((item) => item.id === id);
          if (existing) {
            const updated = { ...existing, updated_at };
            const remaining = allConversations.filter((item) => item.id !== id);
            setConversations([updated, ...remaining]);
          }
        }
        return;
      }

      if (data.type === "thinking") {
        get().appendToAssistant({
          kind: "thinking",
          text:
            typeof data.content === "string"
              ? data.content
              : String(data.content ?? ""),
        });
      } else if (data.type === "tool_call") {
        const tool = typeof data.tool === "string" ? data.tool : "未知工具";
        const args = (data.args && typeof data.args === "object"
          ? data.args
          : {}) as Record<string, unknown>;

        get().appendToAssistant({
          kind: "tool",
          data: {
            call: {
              tool,
              args,
            },
            progress: [],
          },
        });
      } else if (data.type === "tool_progress") {
        const tool = typeof data.tool === "string" ? data.tool : "未知工具";
        const stage =
          typeof data.stage === "string" ? data.stage : "progress";
        const message =
          typeof data.message === "string"
            ? data.message
            : String(data.message ?? "");
        const receivedBytes =
          typeof data.receivedBytes === "number"
            ? data.receivedBytes
            : undefined;
        const totalBytes =
          typeof data.totalBytes === "number" ? data.totalBytes : undefined;

        get().appendToAssistant({
          kind: "tool_progress",
          tool,
          stage,
          message,
          receivedBytes,
          totalBytes,
        });
      } else if (data.type === "tool_result") {
        let resultText: string;
        if (typeof data.result === "string") {
          resultText = data.result;
        } else {
          try {
            resultText = JSON.stringify(data.result, null, 2);
          } catch {
            resultText = String(data.result ?? "");
          }
        }

        get().appendToAssistant({
          kind: "tool_result",
          tool: typeof data.tool === "string" ? data.tool : "未知工具",
          result: resultText,
        });
      } else if (data.type === "error") {
        const rawMessage =
          typeof data.message === "string"
            ? data.message
            : String(data.message ?? "");
        const safeMessage = rawMessage || "未知错误";

        // 增强服务端返回的错误信息
        let enhancedMessage = safeMessage;
        const lowerMessage = safeMessage.toLowerCase();

        if (lowerMessage.includes("load error") || lowerMessage.includes("load_error")) {
          enhancedMessage =
            `模型加载失败: ${safeMessage}\n` +
            `可能原因: 网络不稳定、模型服务暂时不可用\n` +
            `建议: 请稍后重试或切换其他模型\n` +
            `提示: 若持续出现，可尝试刷新页面`;
        } else if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
          enhancedMessage =
            `请求超时: ${safeMessage}\n` +
            `可能原因: 网络延迟过高、服务器响应缓慢\n` +
            `建议: 请稍后重试\n` +
            `提示: 可尝试切换网络或降低请求频率`;
        } else if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many")) {
          enhancedMessage =
            `请求频率限制: ${safeMessage}\n` +
            `可能原因: 短时间内请求过多\n` +
            `建议: 请稍等片刻后重试`;
        } else if (lowerMessage.includes("unavailable") || lowerMessage.includes("503")) {
          enhancedMessage =
            `服务暂时不可用: ${safeMessage}\n` +
            `可能原因: 服务器维护或过载\n` +
            `建议: 请稍后重试`;
        } else if (lowerMessage.includes("connection") || lowerMessage.includes("network")) {
          enhancedMessage =
            `网络连接问题: ${safeMessage}\n` +
            `可能原因: 网络不稳定、连接被中断\n` +
            `建议: 请检查网络连接后重试`;
        } else {
          enhancedMessage =
            `请求失败: ${safeMessage}\n` +
            `可能原因: 服务异常或网络问题\n` +
            `建议: 请稍后重试或刷新页面`;
        }

        get().appendToAssistant({
          type: "error",
          message: enhancedMessage,
        });
        if (currentConversationId) {
          void persistLocalConversation(currentConversationId, {
            updated_at: new Date().toISOString(),
            titleSource,
          });
        }
      } else if (data.type === "content") {
        const addition =
          typeof data.content === "string"
            ? data.content
            : String(data.content ?? "");
        get().appendToAssistant({
          type: "content",
          content: addition,
        });
      }
    },
    onError: (error) => {
      if (get().activeRequestId !== requestId) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "无法连接到聊天服务";
      const detailedMessage =
        message.includes("可能原因:") || message.includes("建议:")
          ? message
          : `网络或服务异常: ${message}\n可能原因: 网络不稳定、服务不可用或浏览器阻止请求\n建议: 检查网络并稍后重试`;
      get().appendToAssistant({
        type: "error",
        message: detailedMessage,
      });
    },
    onFinish: () => {
      if (get().activeRequestId !== requestId) {
        return;
      }

      set({ pending: false, chatClient: null, activeRequestId: null });

      if (currentConversationId) {
        const now = new Date().toISOString();
        void persistLocalConversation(currentConversationId, {
          updated_at: now,
          titleSource,
        });
      }

      const currentMessages = computeMessagesFromPath(
        get().messages,
        get().currentPath
      );
      if (
        currentConversationId &&
        isFirstRound(currentMessages)
      ) {
        void generateTitle(currentConversationId, currentMessages);
      }
    },
  });

  set({
    pending: true,
    chatClient,
    activeRequestId: requestId,
  });

  if (currentConversationId) {
    void persistLocalConversation(currentConversationId, {
      updated_at: new Date().toISOString(),
      titleSource,
    });
  }

  chatClient.sendMessage(
    serializedMessages,
    selectedRole,
    currentConversationId
  );
};
