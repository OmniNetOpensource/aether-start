import { fetchUrlTool } from './fetch'
import { searchTool } from './search'
import {
  type ToolDefinition,
  type ToolHandler,
  type ToolProgressCallback,
  type ToolName,
} from './types'
import { getLogger } from '@/src/server/functions/chat/logger'

const hasSearchKey = Boolean(process.env.SERP_API_KEY)

const toolMap: Partial<Record<ToolName, ToolDefinition>> = {
  fetch_url: fetchUrlTool,
}

if (hasSearchKey) {
  toolMap.search = searchTool
}

Object.keys(toolMap).forEach((name) => {
  getLogger().log('TOOLS', `Enabled tool: ${name}`)
})

if (!hasSearchKey) {
  getLogger().log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY)')
}

const enabledToolHandlers = new Map<string, ToolHandler>(
  (Object.entries(toolMap) as Array<[ToolName, ToolDefinition]>).map(
    ([name, tool]) => [name, tool.handler]
  )
)

export const callToolByName = async (
  name: string,
  args: unknown,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  const handler = enabledToolHandlers.get(name)
  if (!handler) {
    getLogger().log('TOOLS', `Tool not available: ${name}`)
    return `Error: Tool "${name}" is not available.`
  }

  try {
    return await handler(args, onProgress)
  } catch (error) {
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
