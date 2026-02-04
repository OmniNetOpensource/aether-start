import { buildSystemPrompt } from "@/src/server/chat/utils";
import { getOpenAIConfig } from "./config";
import type {
  ChatRunOptions,
  ChatRunResult,
  ChatProviderState,
  PendingToolInvocation,
  ChatStreamEvent,
  ToolInvocationResult,
} from "./types";
import type { SerializedMessage } from "@/src/features/chat/types/chat";
import type { ChatTool } from "@/src/providers/tools/types";

export type OpenAIInputItem =
  | { type: "message"; role: "user" | "assistant" | "system"; content: string | OpenAIContentPart[] }
  | OpenAIFunctionCall
  | OpenAIFunctionCallOutput;

export type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type OpenAITool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type OpenAIFunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type OpenAIFunctionCall = {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
  id?: string;
};

type OpenAIStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "response_id"; id: string }
  | { type: "function_call_start"; id: string; call_id: string; name: string }
  | { type: "function_call_delta"; id: string; call_id: string; arguments: string }
  | { type: "function_call_done"; id: string; call_id: string; name: string; arguments: string }
  | { type: "stop" };

type OpenAIState = {
  openaiInput: OpenAIInputItem[];
  manualInput: OpenAIInputItem[];
  previousResponseId: string | null;
  usePreviousResponseId: boolean;
  systemPrompt: string;
  lastAssistantText: string;
  lastPendingFunctionCalls: Array<{
    id: string;
    call_id: string;
    name: string;
    args: Record<string, unknown>;
    arguments: string;
  }>;
  lastResponseId: string | null;
};

export function convertToOpenAIInput(history: SerializedMessage[]): OpenAIInputItem[] {
  return history.flatMap((msg) => {
    const contentParts: OpenAIContentPart[] = [];

    for (const block of msg.blocks) {
      if (block.type === "content" && block.content) {
        contentParts.push({ type: "input_text", text: block.content });
      } else if (block.type === "attachments") {
        for (const att of block.attachments) {
          if (att.kind === "image" && att.url) {
            contentParts.push({ type: "input_image", image_url: att.url });
          }
        }
      }
    }

    if (msg.role === "assistant" && contentParts.length === 0) {
      return [];
    }

    return [
      {
        type: "message" as const,
        role: msg.role,
        content: contentParts.length === 0 ? "" : contentParts,
      },
    ];
  });
}

export function convertToolsToOpenAI(tools: ChatTool[]): OpenAITool[] {
  return tools
    .filter((t) => t.type === "function")
    .map((t) => ({
      type: "function" as const,
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
}

export async function* streamOpenAIResponse(params: {
  model: string;
  input: OpenAIInputItem[];
  tools?: OpenAITool[];
  systemPrompt?: string;
  previousResponseId?: string | null;
}): AsyncGenerator<OpenAIStreamChunk> {
  const { apiKey, baseUrl } = getOpenAIConfig();

  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      input: params.input,
      instructions: params.systemPrompt,
      previous_response_id: params.previousResponseId || undefined,
      reasoning: {
        effort: "high",
        summary: "auto",
      },
      tools: params.tools,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error("OpenAI API returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const functionCalls = new Map<string, { id: string; call_id: string; name: string; arguments: string }>();
  const startedFunctionCalls = new Set<string>();
  const completedFunctionCalls = new Set<string>();
  const outputTextDeltaItems = new Set<string>();
  const reasoningSummaryDeltaKeys = new Set<string>();
  const reasoningTextDeltaKeys = new Set<string>();
  const reasoningSummaryItems = new Set<string>();
  const emittedResponseIds = new Set<string>();

  const upsertFunctionCall = (item: { id?: string; call_id?: string; name?: string; arguments?: string }) => {
    const id = item.id;
    if (!id) return null;
    const existing = functionCalls.get(id);
    const mergedArguments = typeof item.arguments === "string"
      ? item.arguments
      : existing?.arguments ?? "";
    const call = {
      id,
      call_id: item.call_id || existing?.call_id || id,
      name: item.name || existing?.name || "",
      arguments: mergedArguments,
    };
    if (existing && typeof item.arguments === "string") {
      if (item.arguments.length < existing.arguments.length) {
        call.arguments = existing.arguments;
      }
    }
    functionCalls.set(id, call);
    return call;
  };

  const finalizeFunctionCall = (call: { id: string; call_id: string; name: string; arguments: string }) => {
    if (completedFunctionCalls.has(call.id)) return null;
    completedFunctionCalls.add(call.id);
    functionCalls.delete(call.id);
    return { type: "function_call_done" as const, ...call };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        yield { type: "stop" };
        continue;
      }

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (event.type === "response.output_text.delta") {
        if (event.item_id) {
          outputTextDeltaItems.add(event.item_id);
        }
        yield { type: "text", text: event.delta };
      } else if (event.type === "response.reasoning_summary_text.delta") {
        if (event.item_id) {
          reasoningSummaryItems.add(event.item_id);
          reasoningSummaryDeltaKeys.add(`${event.item_id}:${event.summary_index}`);
        }
        yield { type: "thinking", text: event.delta };
      } else if (event.type === "response.reasoning_summary_text.done") {
        if (event.item_id) {
          reasoningSummaryItems.add(event.item_id);
          const key = `${event.item_id}:${event.summary_index}`;
          if (!reasoningSummaryDeltaKeys.has(key)) {
            yield { type: "thinking", text: event.text };
          }
        }
      } else if (event.type === "response.reasoning_text.delta") {
        if (event.item_id && reasoningSummaryItems.has(event.item_id)) {
          continue;
        }
        if (event.item_id) {
          reasoningTextDeltaKeys.add(`${event.item_id}:${event.content_index}`);
        }
        yield { type: "thinking", text: event.delta };
      } else if (event.type === "response.reasoning_text.done") {
        if (event.item_id && reasoningSummaryItems.has(event.item_id)) {
          continue;
        }
        if (event.item_id) {
          const key = `${event.item_id}:${event.content_index}`;
          if (!reasoningTextDeltaKeys.has(key)) {
            yield { type: "thinking", text: event.text };
          }
        }
      } else if (event.type === "response.output_text.done") {
        if (event.item_id && !outputTextDeltaItems.has(event.item_id)) {
          yield { type: "text", text: event.text };
        }
      } else if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
        const call = upsertFunctionCall(event.item);
        if (call && !startedFunctionCalls.has(call.id)) {
          startedFunctionCalls.add(call.id);
          yield { type: "function_call_start", id: call.id, call_id: call.call_id, name: call.name };
        }
      } else if (event.type === "response.function_call_arguments.delta") {
        const call = functionCalls.get(event.item_id) || upsertFunctionCall({ id: event.item_id });
        if (call) {
          call.arguments += event.delta || "";
          functionCalls.set(call.id, call);
          yield { type: "function_call_delta", id: call.id, call_id: call.call_id, arguments: event.delta || "" };
        }
      } else if (event.type === "response.function_call_arguments.done") {
        const call = functionCalls.get(event.item_id) || upsertFunctionCall({ id: event.item_id });
        if (call) {
          call.arguments = event.arguments || call.arguments;
          call.name = event.name || call.name;
          const finalized = finalizeFunctionCall(call);
          if (finalized) yield finalized;
        }
      } else if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        const call = upsertFunctionCall(event.item);
        if (call) {
          call.arguments = event.item.arguments || call.arguments;
          const finalized = finalizeFunctionCall(call);
          if (finalized) yield finalized;
        }
      } else if (event.type === "response.completed") {
        if (event.response?.id && !emittedResponseIds.has(event.response.id)) {
          emittedResponseIds.add(event.response.id);
          yield { type: "response_id", id: event.response.id };
        }
        yield { type: "stop" };
      } else if (event.type === "response.incomplete") {
        if (event.response?.id && !emittedResponseIds.has(event.response.id)) {
          emittedResponseIds.add(event.response.id);
          yield { type: "response_id", id: event.response.id };
        }
        yield { type: "stop" };
      } else if (event.type === "response.failed") {
        if (event.response?.id && !emittedResponseIds.has(event.response.id)) {
          emittedResponseIds.add(event.response.id);
          yield { type: "response_id", id: event.response.id };
        }
        const message = event.response?.error?.message || "OpenAI response failed";
        throw new Error(message);
      } else if (event.type === "error") {
        throw new Error(event.error?.message || "Unknown OpenAI error");
      }
    }
  }
}

const createInitialState = (options: ChatRunOptions): OpenAIState => {
  const rolePrompt = options.systemPrompt?.trim();
  const rolePromptInput: OpenAIInputItem[] = rolePrompt
    ? [{ type: "message", role: "system", content: rolePrompt }]
    : [];
  const openaiInput = [
    ...rolePromptInput,
    ...convertToOpenAIInput(options.messages),
  ];

  return {
    openaiInput,
    manualInput: openaiInput,
    previousResponseId: null,
    usePreviousResponseId: true,
    systemPrompt: buildSystemPrompt(),
    lastAssistantText: "",
    lastPendingFunctionCalls: [],
    lastResponseId: null,
  };
};

const toChatState = (state: OpenAIState): ChatProviderState => ({
  backend: "openai",
  data: state,
});

const appendToolResults = (state: OpenAIState, results: ToolInvocationResult[]): OpenAIState => {
  const functionCallOutputs: OpenAIFunctionCallOutput[] = results.map((tr) => ({
    type: "function_call_output" as const,
    call_id: tr.id,
    output: tr.result,
  }));

  const functionCallItems: OpenAIInputItem[] = state.lastPendingFunctionCalls.map((fc) => ({
    type: "function_call" as const,
    id: fc.id,
    call_id: fc.call_id,
    name: fc.name,
    arguments: fc.arguments,
  }));

  let manualInput = state.manualInput;
  if (state.lastAssistantText.trim().length > 0) {
    manualInput = [
      ...manualInput,
      { type: "message", role: "assistant", content: state.lastAssistantText },
    ];
  }
  manualInput = [...manualInput, ...functionCallItems, ...functionCallOutputs];

  let openaiInput: OpenAIInputItem[] = manualInput;
  let previousResponseId = state.previousResponseId;
  if (state.usePreviousResponseId) {
    previousResponseId = state.lastResponseId;
    openaiInput = functionCallOutputs;
  }

  return {
    ...state,
    manualInput,
    openaiInput,
    previousResponseId,
    lastAssistantText: "",
    lastPendingFunctionCalls: [],
    lastResponseId: null,
  };
};

export async function* runOpenAIChat(
  options: ChatRunOptions,
  state?: ChatProviderState
): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  const workingState: OpenAIState = state && state.backend === "openai"
    ? (state.data as OpenAIState)
    : createInitialState(options);

  const openaiTools = options.tools.length > 0 ? convertToolsToOpenAI(options.tools) : undefined;

  const pendingFunctionCalls: Array<{
    id: string;
    call_id: string;
    name: string;
    args: Record<string, unknown>;
    arguments: string;
  }> = [];
  let stopped = false;
  let responseId: string | null = null;
  let assistantText = "";
  let retriedWithoutPrevious = false;

  while (true) {
    try {
      for await (const chunk of streamOpenAIResponse({
        model: options.model,
        input: workingState.openaiInput,
        tools: openaiTools,
        systemPrompt: workingState.systemPrompt,
        previousResponseId: workingState.usePreviousResponseId ? workingState.previousResponseId : null,
      })) {
        if (chunk.type === "text") {
          assistantText += chunk.text;
          yield { type: "content", content: chunk.text };
        } else if (chunk.type === "thinking") {
          yield { type: "thinking", content: chunk.text };
        } else if (chunk.type === "response_id") {
          responseId = chunk.id;
        } else if (chunk.type === "function_call_done") {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(chunk.arguments || "{}");
          } catch {
          }
          pendingFunctionCalls.push({
            id: chunk.id,
            call_id: chunk.call_id,
            name: chunk.name,
            args,
            arguments: chunk.arguments || "",
          });
        } else if (chunk.type === "stop") {
          stopped = true;
        }
      }
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start OpenAI completion";
      const model = options?.model ?? "unknown";
      if (
        !retriedWithoutPrevious &&
        workingState.usePreviousResponseId &&
        message.includes("Unsupported parameter: previous_response_id")
      ) {
        workingState.usePreviousResponseId = false;
        workingState.previousResponseId = null;
        workingState.openaiInput = workingState.manualInput;
        retriedWithoutPrevious = true;
        pendingFunctionCalls.length = 0;
        stopped = false;
        responseId = null;
        assistantText = "";
        continue;
      }
      yield { type: "error", message: `Error: OpenAI 请求失败 (model=${model}): ${message}` };
      return { shouldContinue: false, pendingToolCalls: [], assistantText: "", state: toChatState(workingState) };
    }
  }

  if (stopped && pendingFunctionCalls.length === 0) {
    return { shouldContinue: false, pendingToolCalls: [], assistantText, state: toChatState(workingState) };
  }

  if (pendingFunctionCalls.length === 0) {
    return { shouldContinue: false, pendingToolCalls: [], assistantText, state: toChatState(workingState) };
  }

  if (workingState.usePreviousResponseId && !responseId) {
    const model = options?.model ?? "unknown";
    yield {
      type: "error",
      message: `OpenAI response id missing for tool follow-up (model=${model})`,
    };
    return { shouldContinue: false, pendingToolCalls: [], assistantText: "", state: toChatState(workingState) };
  }

  const nextState: OpenAIState = {
    ...workingState,
    lastAssistantText: assistantText,
    lastPendingFunctionCalls: pendingFunctionCalls,
    lastResponseId: responseId,
  };

  const pendingToolCalls: PendingToolInvocation[] = pendingFunctionCalls.map((fc) => ({
    id: fc.call_id,
    name: fc.name,
    args: fc.args,
  }));

  return {
    shouldContinue: true,
    pendingToolCalls,
    assistantText,
    state: toChatState(nextState),
  };
}

export async function* continueOpenAIChat(
  options: ChatRunOptions,
  state: ChatProviderState,
  toolResults: ToolInvocationResult[]
): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  if (state.backend !== "openai") {
    throw new Error("Invalid openai state");
  }
  const nextState = appendToolResults(state.data as OpenAIState, toolResults);
  return yield* runOpenAIChat(options, { backend: "openai", data: nextState });
}
