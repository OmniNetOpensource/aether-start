import {
  Brain,
  Search,
  Link,
  Image as ImageIcon,
  Captions,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ResearchItem, Tool } from '@/features/chat/types/chat'
import type { StepStatus } from '@/shared/ui/chain-of-thought'
import { getToolLifecycle, getSearchResultCount } from './utils'

const SEARCH_TOOL_NAMES = new Set([
  'search',
  'serper_search',
  'tavily_search',
  'serp_search',
  'brave_search',
])

type SearchResultBadge = {
  title: string
  url: string
}

export type StepData = {
  icon: LucideIcon
  label: string
  description?: string
  status: StepStatus
  searchResults?: SearchResultBadge[]
  imageUrl?: string
  imageCaption?: string
}

// Parse search results to badge data
function parseSearchResults(rawResult: string): SearchResultBadge[] {
  try {
    const data = JSON.parse(rawResult)
    const rawResults =
      (Array.isArray(data?.results) && data.results) ||
      (Array.isArray(data?.rawResults) && data.rawResults) ||
      (Array.isArray(data?.web?.results) && data.web.results) ||
      []

    if (!Array.isArray(rawResults)) {
      return []
    }

    const normalized = rawResults
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const title =
          'title' in item && typeof item.title === 'string'
            ? item.title.trim()
            : ''
        const url =
          'url' in item && typeof item.url === 'string'
            ? item.url
            : 'link' in item && typeof item.link === 'string'
              ? item.link
              : ''

        if (!title && !url) {
          return null
        }

        return {
          title: title || url,
          url,
        }
      })
      .filter((item): item is SearchResultBadge => Boolean(item?.url))
      .slice(0, 10) // Limit to 10 results

    return normalized
  } catch {
    return []
  }
}

// Determine step status from tool lifecycle state
function getStepStatus(tool: Tool, isActive: boolean): StepStatus {
  const { result } = getToolLifecycle(tool)

  if (!result) {
    return isActive ? 'active' : 'pending'
  }

  return 'complete'
}

// Get appropriate Lucide icon for tool type
function getToolIcon(toolName: string, tool?: Tool): LucideIcon {
  if (SEARCH_TOOL_NAMES.has(toolName)) {
    return Search
  }

  if (toolName === 'fetch_url' && tool) {
    const args = tool.call.args as Record<string, unknown>
    const responseType =
      typeof args.response_type === 'string' ? args.response_type : 'markdown'

    if (responseType === 'image') {
      return ImageIcon
    }
    if (responseType === 'youtube') {
      return Captions
    }
    return Link
  }

  return Wrench
}

// Truncate text helper
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

// Get Chinese label text for step
function getToolLabel(tool: Tool): string {
  const toolName = tool.call.tool
  const args = tool.call.args as Record<string, unknown>

  if (SEARCH_TOOL_NAMES.has(toolName)) {
    const query = typeof args.query === 'string' ? args.query : ''
    return query ? `搜索: ${query}` : '搜索'
  }

  if (toolName === 'fetch_url') {
    const url = typeof args.url === 'string' ? args.url : ''
    return url ? `获取: ${truncateText(url, 50)}` : '获取'
  }

  return toolName
}

// Get Chinese description/status text
function getToolDescription(tool: Tool, isActive: boolean): string {
  const toolName = tool.call.tool
  const { result } = getToolLifecycle(tool)

  // No result yet
  if (!result) {
    if (!isActive) {
      return '等待中...'
    }

    if (SEARCH_TOOL_NAMES.has(toolName)) {
      return '搜索中...'
    }
    if (toolName === 'fetch_url') {
      return '获取中...'
    }
    return '执行中...'
  }

  // Has result - check for errors
  const resultText = typeof result.result === 'string' ? result.result : ''
  const isError =
    resultText.startsWith('Error') ||
    (resultText.startsWith('[系统提示:') &&
      (resultText.includes('内容过长') || resultText.includes('已省略不返回')))

  if (isError) {
    const errorSummary = resultText.startsWith('Error')
      ? resultText.replace(/^Error:\s*/, '').split('\n')[0]
      : '失败'
    return `失败 · ${truncateText(errorSummary, 30)}`
  }

  // Success
  if (SEARCH_TOOL_NAMES.has(toolName)) {
    const count = getSearchResultCount(resultText)
    if (typeof count === 'number') {
      return `完成 · ${count} 个结果`
    }
  }

  return '完成'
}

// Main adapter - converts ResearchItem[] to step data for rendering
export function adaptResearchItemsToSteps(
  items: ResearchItem[],
  isActive: boolean
): StepData[] {
  return items.map((item, index) => {
    // Thinking item
    if (item.kind === 'thinking') {
      const preview = truncateText(item.text, 100)
      return {
        icon: Brain,
        label: '思考',
        description: preview,
        status: 'complete' as StepStatus,
      }
    }

    // Tool item
    const tool = item.data
    const toolName = tool.call.tool
    const isLastItem = index === items.length - 1
    const itemIsActive = isActive && isLastItem

    const stepData: StepData = {
      icon: getToolIcon(toolName, tool),
      label: getToolLabel(tool),
      description: getToolDescription(tool, itemIsActive),
      status: getStepStatus(tool, itemIsActive),
    }

    // Add search results if available
    if (SEARCH_TOOL_NAMES.has(toolName)) {
      const { result } = getToolLifecycle(tool)
      if (result) {
        const resultText =
          typeof result.result === 'string' ? result.result : ''
        const searchResults = parseSearchResults(resultText)
        if (searchResults.length > 0) {
          stepData.searchResults = searchResults
        }
      }
    }

    return stepData
  })
}
