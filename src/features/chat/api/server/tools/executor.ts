import { fetchUrlTool } from './fetch'
import { searchTool } from './search'
import { getServerEnv } from '@/server/env'
import { getLogger } from '@/features/chat/api/server/services/logger'
import type { ChatTool, ToolHandler, ToolProgressUpdate } from './types'
import type { PendingToolInvocation, ToolInvocationResult, ChatServerToClientEvent } from '@/features/chat/api/shared/types'

// Get tool handler by name (replaces registry)
const getToolHandler = (name: string): ToolHandler | null => {
  const env = getServerEnv()

  if (name === 'fetch_url' && env.JINA_API_KEY) {
    return fetchUrlTool.handler
  }

  if (name === 'search' && env.SERP_API_KEY) {
    return searchTool.handler
  }

  return null
}

// Get available tool specs (used by chat-agent.ts)
export const getAvailableTools = (): ChatTool[] => {
  const env = getServerEnv()
  const tools: ChatTool[] = []

  if (env.JINA_API_KEY) {
    tools.push(fetchUrlTool.spec)
    getLogger().log('TOOLS', 'Enabled tool: fetch_url')
  }

  if (env.SERP_API_KEY) {
    tools.push(searchTool.spec)
    getLogger().log('TOOLS', 'Enabled tool: search')
  } else {
    getLogger().log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY)')
  }

  return tools
}

// Call tool by name with error handling
const callToolByName = async (
  name: string,
  args: unknown,
  onProgress?: (progress: ToolProgressUpdate) => void,
  signal?: AbortSignal,
): Promise<string> => {
  const handler = getToolHandler(name)
  if (!handler) {
    getLogger().log('TOOLS', `Tool not available: ${name}`)
    return `Error: Tool "${name}" is not available.`
  }

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    return await handler(args, onProgress, signal)
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError') ||
      signal?.aborted
    ) {
      getLogger().log('TOOLS', `Tool aborted: ${name}`)
      return 'Error: Aborted'
    }

    getLogger().log(
      'TOOLS',
      `Error calling tool "${name}"`,
      typeof error === 'object' && error !== null
        ? (error as Error).stack || (error as Error).message
        : String(error)
    )
    return `Error executing ${name}: ${
      typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error)
    }`
  }
}

// Helper to check if fetch result is an error
const isFetchResultError = (result: string) => {
  const text = result.trim()
  if (!text) {
    return false
  }

  const isSystemPromptTooLong =
    text.startsWith('[系统提示:') &&
    (text.includes('内容过长') || text.includes('已省略不返回'))

  return text.startsWith('Error') || isSystemPromptTooLong
}

// Format tool result for client display
const formatToolResultForClient = (toolName: string, result: string) => {
  if (toolName !== 'fetch_url') {
    return result
  }

  return isFetchResultError(result) ? 'Error: Fetch failed' : 'Success'
}

// Execute tools with generator (used by chat-agent.ts)
export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
  signal?: AbortSignal,
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = []

  for (const tc of toolCalls) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    yield { type: 'tool_call', tool: tc.name, args: tc.args as Record<string, object | string | number | boolean>, callId: tc.id }

    const progressBuffer: ChatServerToClientEvent[] = []

    const result = await callToolByName(tc.name, tc.args, (progress: ToolProgressUpdate) => {
      progressBuffer.push({
        type: 'tool_progress',
        tool: tc.name,
        stage: progress.stage,
        message: String(progress.message ?? ''),
        receivedBytes: progress.receivedBytes,
        totalBytes: progress.totalBytes,
        callId: tc.id,
      })
    }, signal)

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    for (const event of progressBuffer) {
      yield event
    }

    const normalizedResult = typeof result === 'string' ? result : JSON.stringify(result)
    const clientResult = formatToolResultForClient(tc.name, normalizedResult)

    yield {
      type: 'tool_result',
      tool: tc.name,
      result: clientResult,
      callId: tc.id,
    }

    getLogger().log('TOOL', `Tool result: ${tc.name}`, {
      callId: tc.id,
      resultLength: normalizedResult.length,
    })

    results.push({ id: tc.id, name: tc.name, result: normalizedResult })
  }

  return results
}
