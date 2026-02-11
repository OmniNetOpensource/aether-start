import { toast } from "@/shared/hooks/useToast";
import { useConversationsStore } from "@/features/conversation/persistence/store/useConversationsStore";
import { buildConversationTitle } from "@/features/conversation/formatting/format";
import type {
  Attachment,
  ContentBlock,
  Message,
  MessageLike,
  SerializedAttachment,
  SerializedContentBlock,
  SerializedMessage,
} from "@/features/chat/types/chat";
import type { ChatServerToClientEvent } from "@/features/chat/api/types/server-events";
import { streamChatFn } from "@/features/chat/api/server/functions/chat";
import { appNavigate } from "@/shared/lib/navigation";
import { useMessageTreeStore } from "@/features/chat/messages/store/useMessageTreeStore";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";
import {
  buildConversationPayload,
  persistConversation as persistConversationService,
  resolveExistingConversation,
  cacheExistingConversation,
} from "@/features/conversation/persistence/persist-service";

// --- Serialization ---

const serializeAttachments = async (
  attachments: Attachment[]
): Promise<SerializedAttachment[]> => {
  const serialized: SerializedAttachment[] = [];

  for (const attachment of attachments) {
    const serializedAttachment = {
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: attachment.displayUrl,
      storageKey: attachment.storageKey,
    };

    serialized.push(serializedAttachment);
  }

  return serialized;
};

const serializeBlocks = async (
  blocks: ContentBlock[]
): Promise<SerializedContentBlock[]> =>
  Promise.all(
    blocks.map(async (block) => {
      if (block.type === "attachments") {
        return {
          ...block,
          attachments: await serializeAttachments(block.attachments),
        };
      }
      return { ...block };
    })
  );

const serializeMessagesForRequest = async (
  messages: Message[]
): Promise<SerializedMessage[]> =>
  Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      blocks: await serializeBlocks(message.blocks),
    } as SerializedMessage))
  );

// --- ChatClient ---

type ChatClientOptions = {
  onEvent: (event: ChatServerToClientEvent) => void;
  onError: (error: Error) => void;
  onFinish?: () => void;
};

export class ChatClient {
  private abortController: AbortController | null = null;

  constructor(private options: ChatClientOptions) {}

  public async sendMessage(
    messages: SerializedMessage[],
    role: string,
    conversationId: string | null,
  ) {
    this.abortController = new AbortController();

    try {
      const result = await streamChatFn({
        data: {
          conversationHistory: messages,
          conversationId: conversationId ?? null,
          role,
        },
        signal: this.abortController.signal,
      });

      for await (const event of result) {
        this.options.onEvent(event as ChatServerToClientEvent);
      }
    } catch (error) {
      const isAbortError =
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");

      if (!isAbortError) {
        const enhancedError = this.enhanceError(error);
        this.options.onError(enhancedError);
      }
    } finally {
      this.abortController = null;
      this.options.onFinish?.();
    }
  }

  public abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private enhanceError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new Error(`未知错误: ${String(error)}`);
    }

    const errorName = error.name;
    const errorMessage = error.message;

    if (error instanceof TypeError && errorMessage.includes("fetch")) {
      return new Error(
        `网络连接失败: ${errorMessage}\n` +
          `可能原因: 网络断开、DNS 解析失败、服务器不可达\n` +
          `建议: 请检查网络连接后重试`,
      );
    }

    if (errorName === "TimeoutError" || errorMessage.includes("timeout")) {
      return new Error(
        `请求超时: ${errorMessage}\n` +
          `可能原因: 网络延迟过高、服务器响应缓慢\n` +
          `建议: 请稍后重试`,
      );
    }

    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("socket") ||
      errorMessage.includes("ECONNRESET") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT")
    ) {
      return new Error(
        `网络中断: ${errorMessage}\n` +
          `可能原因: 网络不稳定、连接被重置\n` +
          `建议: 请检查网络连接后重试`,
      );
    }

    return new Error(`${errorName}: ${errorMessage}`);
  }
}

// --- Chat Request ---

const generateLocalMessageId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;

type StartRequestOptions = {
  messages: Message[];
  titleSource?: MessageLike;
  preferLocalTitle?: boolean;
};

export const startChatRequest = async (
  options: StartRequestOptions,
) => {
  const { messages, titleSource, preferLocalTitle } = options;
  const selectedRole = useChatRequestStore.getState().currentRole;

  if (useChatRequestStore.getState().pending) {
    return;
  }
  if (!selectedRole) {
    toast.warning("请先选择角色");
    return;
  }

  let currentConversationId = useMessageTreeStore.getState().conversationId;

  const requestId = generateLocalMessageId();

  const persistConversation = async (
    id: string,
    options?: {
      title?: string;
      created_at?: string;
      updated_at?: string;
      titleSource?: MessageLike;
      force?: boolean;
    },
  ) => {
    const existing = await resolveExistingConversation(id);
    const treeState = useMessageTreeStore.getState();
    const payload = buildConversationPayload({
      id,
      messages: treeState.messages,
      currentPath: treeState.currentPath,
      title: options?.title,
      titleSource: options?.titleSource,
      created_at: options?.created_at,
      updated_at: options?.updated_at,
      existingConversation: existing,
    });
    cacheExistingConversation(id, payload);
    persistConversationService(payload, { force: options?.force === true });
  };

  let serializedMessages: SerializedMessage[];
  try {
    serializedMessages = await serializeMessagesForRequest(messages);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error || "未知原因");
    console.error("Failed to serialize attachments", error);
    toast.error(
      `附件处理失败：${detail}。建议: 重新选择附件或减少数量后重试。`,
    );
    return;
  }

  const chatClient = new ChatClient({
    onEvent: (data) => {
      console.log('[DEBUG] onEvent received:', data.type, data)
      if (useChatRequestStore.getState().activeRequestId !== requestId) {
        console.log('[DEBUG] requestId mismatch, skipping event', { activeRequestId: useChatRequestStore.getState().activeRequestId, requestId })
        return;
      }
      if (data.type === "conversation_created") {
        const id =
          typeof data.conversationId === "string" ? data.conversationId : null;
        console.log('[DEBUG] conversation_created event, id:', id)
        if (id) {
          currentConversationId = id;
          if (!useMessageTreeStore.getState().conversationId) {
            useMessageTreeStore.getState().setConversationId(id);
          }

          const serverTitle =
            typeof data.title === "string"
              ? data.title
              : "New Chat";
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

          void persistConversation(id, {
            title: resolvedTitle,
            created_at,
            updated_at,
            titleSource,
            force: true,
          });

          console.log('[DEBUG] calling appNavigate to:', `/app/c/${id}`)
          appNavigate(`/app/c/${id}`);
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
          void persistConversation(id, { updated_at, titleSource });

          const { conversations, setConversations } = useConversationsStore.getState();
          const existing = conversations.find((item) => item.id === id);
          if (existing) {
            const updated = { ...existing, updated_at };
            const remaining = conversations.filter((item) => item.id !== id);
            setConversations([updated, ...remaining]);
          }
        }
        return;
      }

      if (data.type === "thinking") {
        useMessageTreeStore.getState().appendToAssistant({
          kind: "thinking",
          text:
            typeof data.content === "string"
              ? data.content
              : String(data.content ?? ""),
        });
      } else if (data.type === "tool_call") {
        const tool = typeof data.tool === "string" ? data.tool : "未知工具";
        const args = (
          data.args && typeof data.args === "object" ? data.args : {}
        ) as Record<string, unknown>;

        useMessageTreeStore.getState().appendToAssistant({
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
        const stage = typeof data.stage === "string" ? data.stage : "progress";
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

        useMessageTreeStore.getState().appendToAssistant({
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

        useMessageTreeStore.getState().appendToAssistant({
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

        if (
          lowerMessage.includes("load error") ||
          lowerMessage.includes("load_error")
        ) {
          enhancedMessage =
            `模型加载失败: ${safeMessage}\n` +
            `可能原因: 网络不稳定、模型服务暂时不可用\n` +
            `建议: 请稍后重试或切换其他模型\n` +
            `提示: 若持续出现，可尝试刷新页面`;
        } else if (
          lowerMessage.includes("timeout") ||
          lowerMessage.includes("timed out")
        ) {
          enhancedMessage =
            `请求超时: ${safeMessage}\n` +
            `可能原因: 网络延迟过高、服务器响应缓慢\n` +
            `建议: 请稍后重试\n` +
            `提示: 可尝试切换网络或降低请求频率`;
        } else if (
          lowerMessage.includes("rate limit") ||
          lowerMessage.includes("too many")
        ) {
          enhancedMessage =
            `请求频率限制: ${safeMessage}\n` +
            `可能原因: 短时间内请求过多\n` +
            `建议: 请稍等片刻后重试`;
        } else if (
          lowerMessage.includes("unavailable") ||
          lowerMessage.includes("503")
        ) {
          enhancedMessage =
            `服务暂时不可用: ${safeMessage}\n` +
            `可能原因: 服务器维护或过载\n` +
            `建议: 请稍后重试`;
        } else if (
          lowerMessage.includes("connection") ||
          lowerMessage.includes("network")
        ) {
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

        useMessageTreeStore.getState().appendToAssistant({
          type: "error",
          message: enhancedMessage,
        });
        if (currentConversationId) {
          void persistConversation(currentConversationId, {
            updated_at: new Date().toISOString(),
            titleSource,
          });
        }
      } else if (data.type === "content") {
        const addition =
          typeof data.content === "string"
            ? data.content
            : String(data.content ?? "");
        useMessageTreeStore.getState().appendToAssistant({
          type: "content",
          content: addition,
        });
      }
    },
    onError: (error) => {
      if (useChatRequestStore.getState().activeRequestId !== requestId) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "无法连接到聊天服务";
      const detailedMessage =
        message.includes("可能原因:") || message.includes("建议:")
          ? message
          : `网络或服务异常: ${message}\n可能原因: 网络不稳定、服务不可用或浏览器阻止请求\n建议: 检查网络并稍后重试`;
      useMessageTreeStore.getState().appendToAssistant({
        type: "error",
        message: detailedMessage,
      });
    },
    onFinish: () => {
      if (useChatRequestStore.getState().activeRequestId !== requestId) {
        return;
      }

      useChatRequestStore.setState({ pending: false, chatClient: null, activeRequestId: null });

      if (currentConversationId) {
        const now = new Date().toISOString();
        void persistConversation(currentConversationId, {
          updated_at: now,
          titleSource,
          force: true,
        });
      }
    },
  });

  useChatRequestStore.setState({
    pending: true,
    chatClient,
    activeRequestId: requestId,
  });

  if (currentConversationId) {
    void persistConversation(currentConversationId, {
      updated_at: new Date().toISOString(),
      titleSource,
    });
  }

  chatClient.sendMessage(
    serializedMessages,
    selectedRole,
    currentConversationId,
  );
};
