import { fetchUrlTool } from './fetch'
import {
  stringifyFetchClientPayload,
  parseSearchClientPayload,
  stringifySearchClientPayload,
} from '@/lib/chat/search-result-payload'
import { searchTool } from './search'
import { getServerEnv } from '@/server/env'
import { log } from '@/server/agents/services/logger'
import type { ChatTool, ToolHandler } from './types'
import type { PendingToolInvocation, ToolInvocationResult, ChatServerToClientEvent } from '@/types/chat-api'

export const getAvailableTools = (): ChatTool[] => {
  const env = getServerEnv()
  const tools: ChatTool[] = []

  tools.push(fetchUrlTool.spec)

  if (env.SERP_API_KEY) {
    tools.push(searchTool.spec)
  } else {
    log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY)')
  }

  return tools
}

export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
  signal?: AbortSignal,
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = []

  for (const toolcall of toolCalls) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    yield { type: 'tool_call', tool: toolcall.name, args: toolcall.args as Record<string, object | string | number | boolean>, callId: toolcall.id }

    const env = getServerEnv()
    const handleTool: ToolHandler | null =
      toolcall.name === 'fetch_url'
        ? fetchUrlTool.handler
        : toolcall.name === 'search' && env.SERP_API_KEY
          ? searchTool.handler
          : null
    let result: string
    if (!handleTool) {
      log('TOOLS', `Tool not available: ${toolcall.name}`)
      result = `Error: Tool "${toolcall.name}" is not available.`
    } else {
      try {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        result = await handleTool(toolcall.args, signal)
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === 'AbortError') ||
          (error instanceof Error && error.name === 'AbortError') ||
          signal?.aborted
        ) {
          result = 'Error: Aborted'
        } else {
          log(
            'TOOLS',
            `Error calling tool "${toolcall.name}"`,
            typeof error === 'object' && error !== null
              ? (error as Error).stack || (error as Error).message
              : String(error)
          )
          result = `Error executing ${toolcall.name}: ${
            typeof error === 'object' && error !== null
              ? (error as Error).message
              : String(error)
          }`
        }
      }
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    let resultForChannels: { clientResult: string; modelResult: string }
    if (toolcall.name === 'search') {
      try {
        const parsed = JSON.parse(result)
        if (typeof parsed !== 'object' || parsed === null) {
          resultForChannels = { clientResult: result, modelResult: result }
        } else {
          const clientPayload = parseSearchClientPayload(
            JSON.stringify((parsed as { client?: unknown }).client ?? {}),
          )
          const ai = (parsed as { ai?: unknown }).ai
          if (!clientPayload || typeof ai !== 'string') {
            resultForChannels = { clientResult: result, modelResult: result }
          } else {
            resultForChannels = {
              clientResult: stringifySearchClientPayload(clientPayload),
              modelResult: ai,
            }
          }
        }
      } catch {
        resultForChannels = { clientResult: result, modelResult: result }
      }
    } else {
      let clientResult = result
      if (toolcall.name === 'fetch_url') {
        const text = result.trim()
        const isFetchError = text && text.startsWith('Error')
        if (isFetchError) {
          clientResult = 'Error: Fetch failed'
        } else {
          try {
            const parsed = JSON.parse(result)
            if (parsed.type === 'image' && parsed.data_url) {
              clientResult = JSON.stringify(parsed)
            } else {
              clientResult = stringifyFetchClientPayload({ type: 'fetch_result' })
            }
          } catch {
            clientResult = stringifyFetchClientPayload({ type: 'fetch_result' })
          }
        }
      }
      resultForChannels = { clientResult, modelResult: result }
    }

    yield {
      type: 'tool_result',
      tool: toolcall.name,
      result: resultForChannels.clientResult,
      callId: toolcall.id,
    }

    results.push({ id: toolcall.id, name: toolcall.name, result: resultForChannels.modelResult })
  }

  return results
}
