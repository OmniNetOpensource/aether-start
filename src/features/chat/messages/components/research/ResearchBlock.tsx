import { memo } from 'react'
import { Search, Link, Wrench } from 'lucide-react'
import type { ResearchItem, Tool } from '@/features/chat/types/chat'
import type { StepStatus } from '@/shared/ui/chain-of-thought'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from '@/shared/ui/chain-of-thought'
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

// Get favicon URL for a domain
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  } catch {
    return ''
  }
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
      .slice(0, 10)

    return normalized
  } catch {
    return []
  }
}

// Get step status from tool lifecycle
function getStepStatus(tool: Tool, isActive: boolean): StepStatus {
  const { result } = getToolLifecycle(tool)
  if (!result) {
    return isActive ? 'active' : 'pending'
  }
  return 'complete'
}

// Get status text for a tool
function getStatusText(tool: Tool, isActive: boolean, toolName: string): string {
  const { result } = getToolLifecycle(tool)

  if (!result) {
    if (!isActive) return '等待中...'
    if (SEARCH_TOOL_NAMES.has(toolName)) return '搜索中...'
    if (toolName === 'fetch_url') return '获取中...'
    return '执行中...'
  }

  const resultText = typeof result.result === 'string' ? result.result : ''
  const isError =
    resultText.startsWith('Error') ||
    (resultText.startsWith('[系统提示:') &&
      (resultText.includes('内容过长') || resultText.includes('已省略不返回')))

  if (isError) {
    const errorSummary = resultText.startsWith('Error')
      ? resultText.replace(/^Error:\s*/, '').split('\n')[0]
      : '失败'
    return `失败 · ${errorSummary}`
  }

  if (SEARCH_TOOL_NAMES.has(toolName)) {
    const count = getSearchResultCount(resultText)
    if (typeof count === 'number') {
      return `完成 · ${count} 个结果`
    }
  }

  return '完成'
}

// Favicon image component with fallback
function Favicon({ url, fallback }: { url: string; fallback?: React.ReactNode }) {
  const faviconSrc = getFaviconUrl(url)
  if (!faviconSrc) return <>{fallback}</>
  return (
    <img
      src={faviconSrc}
      alt=""
      className="h-4 w-4 rounded-sm"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

// Render a thinking step
function ThinkingStep({ text, hideConnector }: { text: string; hideConnector: boolean }) {
  return (
    <ChainOfThoughtStep
      icon={<div className="h-2 w-2 rounded-full bg-current opacity-40" />}
      description={text}
      hideConnector={hideConnector}
    />
  )
}

// Render a search tool step
function SearchStep({
  tool,
  isActive,
  hideConnector,
  stepKey,
}: {
  tool: Tool
  isActive: boolean
  hideConnector: boolean
  stepKey: string
}) {
  const toolName = tool.call.tool
  const args = tool.call.args as Record<string, unknown>
  const query = typeof args.query === 'string' ? args.query : ''
  const status = getStatusText(tool, isActive, toolName)
  const description = query ? `${query} · ${status}` : status

  const { result } = getToolLifecycle(tool)
  let searchResults: SearchResultBadge[] = []
  if (result) {
    const resultText = typeof result.result === 'string' ? result.result : ''
    searchResults = parseSearchResults(resultText)
  }

  return (
    <ChainOfThoughtStep
      icon={<Search className="h-full w-full" />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    >
      {searchResults.length > 0 && (
        <ChainOfThoughtSearchResults>
          {searchResults.map((r, i) => (
            <ChainOfThoughtSearchResult
              key={`${stepKey}-result-${i}`}
              href={r.url}
              icon={<Favicon url={r.url} />}
              url={r.url}
            >
              {r.title}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      )}
    </ChainOfThoughtStep>
  )
}

// Render a fetch tool step
function FetchStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool
  isActive: boolean
  hideConnector: boolean
}) {
  const args = tool.call.args as Record<string, unknown>
  const url = typeof args.url === 'string' ? args.url : ''
  const status = getStatusText(tool, isActive, 'fetch_url')
  const description = url ? `${url} · ${status}` : status

  return (
    <ChainOfThoughtStep
      icon={url ? <Favicon url={url} fallback={<Link className="h-full w-full" />} /> : <Link className="h-full w-full" />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    />
  )
}

// Render a generic tool step
function GenericToolStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool
  isActive: boolean
  hideConnector: boolean
}) {
  const toolName = tool.call.tool
  const status = getStatusText(tool, isActive, toolName)
  const description = `${toolName} · ${status}`

  return (
    <ChainOfThoughtStep
      icon={<Wrench className="h-full w-full" />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    />
  )
}

type ResearchBlockProps = {
  items: ResearchItem[]
  blockIndex: number
  messageIndex: number
  isActive?: boolean
}

export const ResearchBlock = memo(function ResearchBlock({
  items,
  blockIndex,
  messageIndex,
  isActive = false,
}: ResearchBlockProps) {
  return (
    <ChainOfThought defaultOpen={true}>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {items.map((item, index) => {
          const stepKey = `${messageIndex}-${blockIndex}-${index}`
          const isLastStep = index === items.length - 1

          if (item.kind === 'thinking') {
            return (
              <ThinkingStep
                key={stepKey}
                text={item.text}
                hideConnector={isLastStep}
              />
            )
          }

          const tool = item.data
          const toolName = tool.call.tool
          const isLastItem = index === items.length - 1
          const itemIsActive = isActive && isLastItem

          if (SEARCH_TOOL_NAMES.has(toolName)) {
            return (
              <SearchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
                stepKey={stepKey}
              />
            )
          }

          if (toolName === 'fetch_url') {
            return (
              <FetchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            )
          }

          return (
            <GenericToolStep
              key={stepKey}
              tool={tool}
              isActive={itemIsActive}
              hideConnector={isLastStep}
            />
          )
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
})
