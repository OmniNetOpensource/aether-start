import { fetchUrlTool } from './fetch'
import { searchTool } from './search'
import {
  type ChatTool,
  type ToolDefinition,
  type ToolHandler,
  type ToolProgressCallback,
  type ToolName,
} from './types'

const hasSearchKey = Boolean(process.env.SERP_API_KEY)

const toolMap: Partial<Record<ToolName, ToolDefinition>> = {
  fetch_url: fetchUrlTool,
}

if (hasSearchKey) {
  toolMap.search = searchTool
}

const toolEntries = Object.entries(toolMap) as Array<
  [ToolName, ToolDefinition]
>

toolEntries.forEach(([name]) => {
  console.error('[Tools] Enabled tool:', name)
})

if (!hasSearchKey) {
  console.error('[Tools] Skipping tool: search (missing SERP_API_KEY)')
}

export const toolSpecs: ChatTool[] = toolEntries.map(([, tool]) => tool.spec)

const enabledToolHandlers = new Map<string, ToolHandler>(
  toolEntries.map(([name, tool]) => [name, tool.handler])
)

export const callToolByName = async (
  name: string,
  args: unknown,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  const handler = enabledToolHandlers.get(name)
  if (!handler) {
    console.error('[Tools] Tool not available:', name)
    return `Error: Tool "${name}" is not available.`
  }

  try {
    return await handler(args, onProgress)
  } catch (error) {
    console.error(
      `[Tools] Error calling tool "${name}":`,
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
