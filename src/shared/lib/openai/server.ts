import type { OpenAIInputItem, OpenAITool } from "./converter";

export type OpenAIStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "response_id"; id: string }
  | { type: "function_call_start"; id: string; call_id: string; name: string }
  | { type: "function_call_delta"; id: string; call_id: string; arguments: string }
  | { type: "function_call_done"; id: string; call_id: string; name: string; arguments: string }
  | { type: "stop" };

const getConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
  };
};

export async function* streamOpenAIResponse(params: {
  model: string;
  input: OpenAIInputItem[];
  tools?: OpenAITool[];
  systemPrompt?: string;
  previousResponseId?: string | null;
}): AsyncGenerator<OpenAIStreamChunk> {
  const { apiKey, baseUrl } = getConfig();

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
