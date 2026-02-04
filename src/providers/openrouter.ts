import { buildSystemPrompt, toChatMessages } from "@/src/server/chat/utils";
import type { ChatMessage, ReasoningDetail, StreamToolCall } from "@/src/server/chat/utils";
import { getOpenRouterConfig } from "./config";
import type {
  ChatOptions,
  ChatResult,
  ChatState,
  PendingToolCall,
  ProviderPreferences,
  StreamEvent,
  ToolCallResult,
} from "./types";

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: string;
      reasoning_details?: ReasoningDetail[];
      tool_calls?: StreamToolCall[];
    };
    message?: {
      images?: Array<{ image_url: { url: string } }>;
    };
    finishReason?: string | null;
  }>;
};

type OpenRouterState = {
  messages: ChatMessage[];
};

export async function streamChatCompletion(params: {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  provider?: ProviderPreferences;
  modalities?: ("text" | "image")[];
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, baseUrl, headers } = getOpenRouterConfig();

  const messages = params.messages.map((msg) => {
    const { toolCalls, toolCallId, reasoningDetails, ...rest } = msg;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newMsg: any = { ...rest };

    if (toolCalls) {
      newMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      }));
    }

    if (toolCallId) {
      newMsg.tool_call_id = toolCallId;
    }

    if (reasoningDetails) {
      newMsg.reasoning_details = reasoningDetails;
    }

    return newMsg;
  });

  const requestBody: Record<string, unknown> = {
    model: params.model,
    messages,
    stream: true,
    reasoning: {
      enabled: true,
      exclude: false,
    },
  };

  if (params.tools && params.tools.length > 0) {
    requestBody.tools = params.tools;
  }

  if (params.provider) {
    requestBody.provider = params.provider;
  }

  if (params.modalities?.length) {
    requestBody.modalities = params.modalities;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }
  return response.body;
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            yield JSON.parse(line.slice(6));
          } catch (e) {
            console.error("Failed to parse SSE line:", line, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const createInitialState = (options: ChatOptions): OpenRouterState => {
  const systemPrompt = buildSystemPrompt();
  const rolePrompt = options.systemPrompt?.trim();
  const rolePromptMessages: ChatMessage[] = rolePrompt
    ? [{ role: "system", content: rolePrompt }]
    : [];

  return {
    messages: [
      { role: "system", content: systemPrompt },
      ...rolePromptMessages,
      ...toChatMessages(options.messages),
    ],
  };
};

const toChatState = (state: OpenRouterState): ChatState => ({
  backend: "openrouter",
  data: state,
});

const appendToolResults = (state: OpenRouterState, results: ToolCallResult[]): OpenRouterState => {
  const messages = [...state.messages];
  for (const result of results) {
    messages.push({
      role: "tool",
      toolCallId: result.id,
      content: result.result,
    });
  }
  return { messages };
};

export async function* runOpenRouterChat(
  options: ChatOptions,
  state?: ChatState
): AsyncGenerator<StreamEvent, ChatResult> {
  const workingState = state && state.backend === "openrouter"
    ? (state.data as OpenRouterState)
    : createInitialState(options);

  let stream: ReadableStream<Uint8Array>;
  try {
    const requestPayload = {
      model: options.model,
      messages: workingState.messages,
      tools: options.tools.length > 0 ? options.tools : undefined,
      provider: options.provider,
    };
    stream = await streamChatCompletion(requestPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start chat completion";
    const model = options?.model ?? "unknown";
    yield {
      type: "error",
      message: `错误：OpenRouter 请求失败 (model=${model}): ${message}`,
    };
    return { shouldContinue: false, pendingToolCalls: [], assistantText: "", state: toChatState(workingState) };
  }

  let assistantMessage = "";
  let currentReasoning = "";
  let currentReasoningDetails: ReasoningDetail[] = [];
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  let currentToolCallIndex = -1;
  let finishedWithStop = false;

  const mergeReasoningDetail = (detail: ReasoningDetail) => {
    const detailIndex = typeof detail.index === "number" ? detail.index : null;

    if (detailIndex === null) {
      currentReasoningDetails = [...currentReasoningDetails, detail];
      return;
    }

    const existingIndex = currentReasoningDetails.findIndex((item) => item.index === detailIndex);
    if (existingIndex === -1) {
      currentReasoningDetails = [...currentReasoningDetails, detail];
      return;
    }

    const existing = currentReasoningDetails[existingIndex];
    const mergedText =
      typeof existing.text === "string" || typeof detail.text === "string"
        ? `${existing.text ?? ""}${detail.text ?? ""}`
        : existing.text;
    const merged = { ...existing, ...detail, text: mergedText };
    currentReasoningDetails = [
      ...currentReasoningDetails.slice(0, existingIndex),
      merged,
      ...currentReasoningDetails.slice(existingIndex + 1),
    ];
  };

  for await (const chunk of parseSSEStream(stream)) {
    const delta = chunk?.choices?.[0]?.delta;
    const finishReason = chunk?.choices?.[0]?.finishReason as string | undefined;

    if (delta?.reasoning) {
      currentReasoning += delta.reasoning;
      yield { type: "thinking", content: delta.reasoning };
    }

    if (delta?.reasoning_details) {
      for (const detail of delta.reasoning_details) {
        if (detail && typeof detail === "object") {
          mergeReasoningDetail(detail);
        }
      }
    }

    if (delta?.content) {
      assistantMessage += delta.content;
      yield { type: "content", content: delta.content };
    }

    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls as StreamToolCall[]) {
        if (toolCall.index !== undefined && toolCall.index !== currentToolCallIndex) {
          currentToolCallIndex = toolCall.index;
          toolCalls[currentToolCallIndex] = {
            id: toolCall.id || "",
            type: "function",
            function: {
              name: toolCall.function?.name || "",
              arguments: toolCall.function?.arguments || "",
            },
          };
        } else if (currentToolCallIndex >= 0 && toolCall.function?.arguments) {
          const currentToolCall = toolCalls[currentToolCallIndex];
          if (currentToolCall && currentToolCall.type === "function") {
            currentToolCall.function.arguments += toolCall.function.arguments;
          }
        }
      }
    }

    if (finishReason === "stop") {
      finishedWithStop = true;
      break;
    }

    if (finishReason === "tool_calls" && toolCalls.length > 0) {
      break;
    }
  }

  if (finishedWithStop) {
    return { shouldContinue: false, pendingToolCalls: [], assistantText: assistantMessage, state: toChatState(workingState) };
  }

  if (toolCalls.length === 0) {
    return { shouldContinue: false, pendingToolCalls: [], assistantText: assistantMessage, state: toChatState(workingState) };
  }

  const nextMessages = [...workingState.messages];
  nextMessages.push({
    role: "assistant",
    content: assistantMessage || null,
    toolCalls,
    reasoning: currentReasoning || undefined,
    reasoningDetails: currentReasoningDetails.length > 0 ? currentReasoningDetails : undefined,
  });

  const pendingToolCalls: PendingToolCall[] = toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(tc.function.arguments || "{}");
      if (parsed && typeof parsed === "object") {
        args = parsed as Record<string, unknown>;
      }
    } catch {
    }
    return { id: tc.id, name: tc.function.name, args };
  });

  return {
    shouldContinue: true,
    pendingToolCalls,
    assistantText: assistantMessage,
    state: toChatState({ messages: nextMessages }),
  };
}

export async function* continueOpenRouterChat(
  options: ChatOptions,
  state: ChatState,
  toolResults: ToolCallResult[]
): AsyncGenerator<StreamEvent, ChatResult> {
  if (state.backend !== "openrouter") {
    throw new Error("Invalid openrouter state");
  }
  const nextState = appendToolResults(state.data as OpenRouterState, toolResults);
  return yield* runOpenRouterChat(options, { backend: "openrouter", data: nextState });
}
