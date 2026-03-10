import { GoogleGenAI, createPartFromFunctionResponse } from '@google/genai'
import type * as genai from '@google/genai'
import { buildSystemPrompt, type BackendConfig } from '@/server/agents/services/chat-config'
import { log } from './logger'
import { resolveAttachmentToBase64 } from './attachment-utils'
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from '@/types/chat-api'
import type { ChatTool } from '@/server/agents/tools/types'
import type { SerializedMessage } from '@/types/message'
import type { ChatProvider, ChatProviderConfig } from './provider-types'

export type GeminiMessage = genai.Content

type GeminiProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[]
  thinkingBlocks: unknown[]
}

type GeminiChatProviderConfig = {
  model: string
  backendConfig: BackendConfig
  tools: ChatTool[]
  systemPrompt: string
}

export const getGeminiClient = (config: BackendConfig) => {
  return new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: {
      baseUrl: config.baseURL,
      headers: config.defaultHeaders,
    },
  })
}

const getClient = getGeminiClient

const convertToolsToGemini = (tools: ChatTool[]): genai.FunctionDeclaration[] => {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters as genai.Schema,
    }))
}


export async function convertToGeminiMessages(history: SerializedMessage[]): Promise<GeminiMessage[]> {
  return Promise.all(history.map(async (message, msgIdx) => {
    const parts: genai.Part[] = []

    for (const block of message.blocks) {
      if (block.type === 'content' && block.content) {
        parts.push({ text: block.content })
      } else if (block.type === 'attachments') {
        for (const attachment of block.attachments) {
          if (attachment.kind !== 'image') continue

          const resolved = await resolveAttachmentToBase64('GEMINI', {
            name: attachment.name,
            mimeType: attachment.mimeType,
            url: attachment.url,
            storageKey: attachment.storageKey,
          })

          if (resolved) {
            parts.push({
              inlineData: {
                mimeType: resolved.media_type,
                data: resolved.data,
              },
            })
          } else {
            log('GEMINI', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`)
          }
        }
      }
    }

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: parts.length > 0 ? parts : [{ text: '' }],
    }
  }))
}

export function formatGeminiToolContinuation(
  assistantText: string,
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): GeminiMessage[] {
  const modelParts: genai.Part[] = []

  if (assistantText) {
    modelParts.push({ text: assistantText })
  }

  for (const toolCall of pendingToolCalls) {
    modelParts.push({
      functionCall: {
        id: toolCall.id,
        name: toolCall.name,
        args: toolCall.args,
      },
    })
  }

  const userParts: genai.Part[] = toolResults.map((result) => {
    let response: Record<string, unknown>
    try {
      response = { output: JSON.parse(result.result) }
    } catch {
      response = { output: result.result }
    }
    return createPartFromFunctionResponse(
      result.id,
      result.name,
      response,
    )
  })

  return [
    { role: 'model', parts: modelParts },
    { role: 'user', parts: userParts },
  ]
}

export class GeminiChatProvider {
  private readonly model: string
  private readonly backendConfig: BackendConfig
  private readonly geminiTools: genai.FunctionDeclaration[] | undefined
  private readonly systemPrompt: string

  constructor(config: GeminiChatProviderConfig) {
    this.model = config.model
    this.backendConfig = config.backendConfig
    this.systemPrompt = config.systemPrompt
    this.geminiTools = config.tools.length > 0
      ? convertToolsToGemini(config.tools)
      : undefined
  }

  async *run(
    messages: GeminiMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, GeminiProviderRunResult> {
    const systemParts = [buildSystemPrompt()]
    if (this.systemPrompt.trim()) {
      systemParts.push(this.systemPrompt.trim())
    }

    const emptyResult: GeminiProviderRunResult = { pendingToolCalls: [], thinkingBlocks: [] }
    const pendingToolCalls: PendingToolInvocation[] = []

    try {
      const client = getClient(this.backendConfig)

      const config: genai.GenerateContentConfig = {
        abortSignal: signal,
        systemInstruction: systemParts.join('\n\n'),
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: -1,
        },
      }

      if (this.geminiTools) {
        config.tools = [{ functionDeclarations: this.geminiTools }]
      }

      const streamResponse = await client.models.generateContentStream({
        model: this.model,
        contents: messages,
        config,
      })

      for await (const chunk of streamResponse) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        const candidate = chunk.candidates?.[0]
        if (!candidate?.content?.parts) continue

        for (const part of candidate.content.parts) {
          if (part.thought && part.text) {
            yield { type: 'thinking', content: part.text }
          } else if (part.text && !part.thought) {
            yield { type: 'content', content: part.text }
          } else if (part.functionCall) {
            const fc = part.functionCall
            pendingToolCalls.push({
              id: fc.id || `gemini_tool_${pendingToolCalls.length + 1}`,
              name: fc.name || 'unknown_tool',
              args: (fc.args ?? {}) as Record<string, unknown>,
            })
          }
        }
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal?.aborted
      ) {
        return emptyResult
      }

      log('GEMINI', 'Gemini provider run failed', {
        error,
        model: this.model,
      })

      const errorMessage = error instanceof Error ? error.message : 'Failed to start Gemini completion'
      yield {
        type: 'error',
        message: `错误：Gemini 请求失败 (model=${this.model}): ${errorMessage}`,
      }
      return emptyResult
    }

    if (pendingToolCalls.length === 0) {
      return emptyResult
    }

    return { pendingToolCalls, thinkingBlocks: [] }
  }
}

export function createGeminiAdapter(config: ChatProviderConfig): ChatProvider<GeminiMessage> {
  const provider = new GeminiChatProvider(config)
  return {
    convertMessages: (history) => convertToGeminiMessages(history),
    run: (messages, signal) => provider.run(messages, signal),
    formatToolContinuation: (assistantText, _runResult, pendingToolCalls, toolResults) =>
      formatGeminiToolContinuation(assistantText, pendingToolCalls, toolResults),
  }
}
