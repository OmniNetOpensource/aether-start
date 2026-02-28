import OpenAI from 'openai'
import { buildSystemPrompt, type BackendConfig } from '@/server/agents/services/chat-config'
import { log } from './logger'
import { arrayBufferToBase64, parseDataUrl } from '@/server/base64'
import { getServerBindings } from '@/server/env'
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from '@/types/chat-api'
import type { ChatTool } from '@/server/agents/tools/types'
import type { SerializedMessage } from '@/types/message'

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | OpenAIContentPart[]
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type OpenAIProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[]
}

type OpenAIChatProviderConfig = {
  model: string
  backendConfig: BackendConfig
  tools: ChatTool[]
  systemPrompt?: string
}

const loggingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  let requestBody: unknown
  try {
    requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
  } catch {
    requestBody = init?.body
  }

  log('OPENAI', 'HTTP Request', {
    method: init?.method ?? 'GET',
    url,
    headers: init?.headers,
    body: requestBody,
  })

  const response = await fetch(input, init)

  log('OPENAI', 'HTTP Response', {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
  })

  if (!response.body) {
    return response
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk)
      log('OPENAI', 'HTTP SSE chunk', text)
      controller.enqueue(chunk)
    },
  })

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export const getOpenAIClient = (config: BackendConfig) => {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders,
    fetch: loggingFetch,
  })
}

const resolveAttachmentToBase64 = async (attachment: {
  name: string
  mimeType: string
  url?: string
  storageKey?: string
}): Promise<{ media_type: string; data: string } | null> => {
  if (attachment.url) {
    const parsed = parseDataUrl(attachment.url)
    if (parsed) {
      return {
        media_type: parsed.mimeType,
        data: parsed.base64,
      }
    }
  }

  if (attachment.storageKey) {
    try {
      const { CHAT_ASSETS } = getServerBindings()
      const object = await CHAT_ASSETS.get(attachment.storageKey)
      if (!object) {
        log('OPENAI', `R2 object not found for ${attachment.storageKey}`)
      } else {
        const buffer = await object.arrayBuffer()
        return {
          media_type: object.httpMetadata?.contentType || attachment.mimeType,
          data: arrayBufferToBase64(buffer),
        }
      }
    } catch (error) {
      log('OPENAI', `Failed to read storageKey ${attachment.storageKey}`, error)
    }
  }

  if (attachment.url && /^https?:\/\//.test(attachment.url)) {
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) {
        log('OPENAI', 'Failed to fetch attachment url', {
          url: attachment.url,
          status: response.status,
        })
        return null
      }

      const arrayBuffer = await response.arrayBuffer()
      return {
        media_type: response.headers.get('content-type') || attachment.mimeType,
        data: arrayBufferToBase64(arrayBuffer),
      }
    } catch (error) {
      log('OPENAI', 'Failed to fetch http attachment', error)
    }
  }

  return null
}

const convertToolsToOpenAI = (tools: ChatTool[]): OpenAITool[] => {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as Record<string, unknown>,
      },
    }))
}

const extractThinkingTexts = (delta: Record<string, unknown>): string[] => {
  const thinkingTexts: string[] = []

  const tryPush = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      thinkingTexts.push(value)
    }
  }

  tryPush(delta.thinking)
  tryPush(delta.reasoning)
  tryPush(delta.reasoning_content)

  const detailCandidates = [
    delta.reasoning_details,
    delta.reasoningDetails,
    delta.thinking_details,
  ]

  for (const candidate of detailCandidates) {
    if (!Array.isArray(candidate)) {
      continue
    }

    for (const item of candidate) {
      if (typeof item === 'string') {
        tryPush(item)
        continue
      }

      if (item && typeof item === 'object') {
        const detail = item as Record<string, unknown>
        tryPush(detail.text)
        tryPush(detail.content)
      }
    }
  }

  return thinkingTexts
}

export async function convertToOpenAIMessages(history: SerializedMessage[]): Promise<OpenAIMessage[]> {
  return Promise.all(history.map(async (message, msgIdx) => {
    const contentParts: OpenAIContentPart[] = []

    for (const block of message.blocks) {
      if (block.type === 'content' && block.content) {
        contentParts.push({ type: 'text', text: block.content })
      } else if (block.type === 'attachments') {
        for (const attachment of block.attachments) {
          if (attachment.kind !== 'image') {
            continue
          }

          const resolved = await resolveAttachmentToBase64({
            name: attachment.name,
            mimeType: attachment.mimeType,
            url: attachment.url,
            storageKey: attachment.storageKey,
          })

          if (resolved) {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${resolved.media_type};base64,${resolved.data}`,
              },
            })
          } else {
            log('OPENAI', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`)
          }
        }
      }
    }

    return {
      role: message.role,
      content: contentParts.length > 0 ? contentParts : '',
    }
  }))
}

export function formatOpenAIToolContinuation(
  assistantText: string,
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): OpenAIMessage[] {
  const assistantToolCalls = pendingToolCalls.map((toolCall, index) => ({
    id: toolCall.id || `tool_${index + 1}`,
    type: 'function' as const,
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args ?? {}),
    },
  }))

  const assistantMessage: OpenAIMessage = {
    role: 'assistant',
    content: assistantText || '',
    tool_calls: assistantToolCalls,
  }

  const toolMessages: OpenAIMessage[] = toolResults.map((toolResult, index) => ({
    role: 'tool',
    tool_call_id: toolResult.id || assistantToolCalls[index]?.id || `tool_${index + 1}`,
    content: toolResult.result,
  }))

  return [assistantMessage, ...toolMessages]
}

export class OpenAIChatProvider {
  private readonly model: string
  private readonly backendConfig: BackendConfig
  private readonly openaiTools: OpenAITool[] | undefined
  private readonly systemPrompt?: string

  constructor(config: OpenAIChatProviderConfig) {
    this.model = config.model
    this.backendConfig = config.backendConfig
    this.systemPrompt = config.systemPrompt
    this.openaiTools = config.tools.length > 0 ? convertToolsToOpenAI(config.tools) : undefined
  }

  async *run(
    messages: OpenAIMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, OpenAIProviderRunResult> {
    const systemParts = [buildSystemPrompt()]
    if (this.systemPrompt?.trim()) {
      systemParts.push(this.systemPrompt.trim())
    }

    const fullMessages: OpenAIMessage[] = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...messages,
    ]

    const emptyResult: OpenAIProviderRunResult = { pendingToolCalls: [] }
    const toolCallsByIndex = new Map<number, { id: string; name: string; argsJson: string }>()

    try {
      const client = getOpenAIClient(this.backendConfig)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamParams: any = {
        model: this.model,
        messages: fullMessages,
        tools: this.openaiTools,
        stream: true,
      }

      const streamResponse = await client.chat.completions.create(streamParams, {
        signal,
      })

      const stream = streamResponse as unknown as AsyncIterable<{
        choices?: Array<{ delta?: Record<string, unknown> }>
      }>

      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        const choice = chunk.choices?.[0]
        if (!choice) {
          continue
        }

        const delta = (choice.delta ?? {}) as Record<string, unknown>
        const deltaContent = delta.content
        if (typeof deltaContent === 'string' && deltaContent.length > 0) {
          yield { type: 'content', content: deltaContent }
        }

        const thinkingTexts = extractThinkingTexts(delta)
        for (const text of thinkingTexts) {
          yield { type: 'thinking', content: text }
        }

        const deltaToolCalls = Array.isArray((delta as { tool_calls?: unknown[] }).tool_calls)
          ? ((delta as { tool_calls: unknown[] }).tool_calls as Array<Record<string, unknown>>)
          : []

        for (const toolCall of deltaToolCalls) {
          const index = typeof toolCall.index === 'number' ? toolCall.index : 0
          const existing = toolCallsByIndex.get(index) ?? { id: '', name: '', argsJson: '' }

          if (typeof toolCall.id === 'string' && toolCall.id.length > 0) {
            existing.id = toolCall.id
          }

          const functionInfo = toolCall.function
          if (functionInfo && typeof functionInfo === 'object') {
            const fn = functionInfo as Record<string, unknown>
            if (typeof fn.name === 'string' && fn.name.length > 0) {
              existing.name = fn.name
            }
            if (typeof fn.arguments === 'string' && fn.arguments.length > 0) {
              existing.argsJson += fn.arguments
            }
          }

          toolCallsByIndex.set(index, existing)
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

      log('OPENAI', 'OpenAI provider run failed', {
        error,
        model: this.model,
      })

      const errorMessage = error instanceof Error ? error.message : 'Failed to start OpenAI completion'
      yield {
        type: 'error',
        message: `错误：OpenAI 请求失败 (model=${this.model}): ${errorMessage}`,
      }
      return emptyResult
    }

    log('OPENAI', 'Stream completed', {
      model: this.model,
      toolCallCount: toolCallsByIndex.size,
    })

    const pendingToolCalls: PendingToolInvocation[] = [...toolCallsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, toolCall]) => {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolCall.argsJson || '{}')
        } catch (error) {
          log('OPENAI', 'Failed to parse tool arguments', {
            error,
            index,
            toolCall,
          })
        }

        return {
          id: toolCall.id || `tool_${index + 1}`,
          name: toolCall.name || 'unknown_tool',
          args,
        }
      })

    return { pendingToolCalls }
  }
}
