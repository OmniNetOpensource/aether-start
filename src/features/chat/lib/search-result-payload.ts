import type { ContentBlock, MessageLike, ResearchItem, Tool } from '@/types/message'

export const SEARCH_TOOL_NAMES = new Set([
  'search',
  'serper_search',
  'tavily_search',
  'serp_search',
  'brave_search',
])

export type SearchClientResult = {
  title: string
  url: string
  faviconDataUrl?: string
}

export type SearchClientPayload = {
  results: SearchClientResult[]
}

export type FetchClientPayload = {
  type: 'fetch_result'
  faviconDataUrl?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const cloneTool = (tool: Tool): Tool => ({
  call: {
    tool: tool.call.tool,
    args: { ...tool.call.args },
  },
  ...(tool.result
    ? {
        result: { ...tool.result },
      }
    : {}),
})

export const parseSearchClientPayload = (raw: string): SearchClientPayload | null => {
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
      return null
    }

    const results = parsed.results
      .map((item) => {
        if (!isRecord(item)) {
          return null
        }

        const title = typeof item.title === 'string' ? item.title.trim() : ''
        const url = typeof item.url === 'string' ? item.url : ''
        const faviconDataUrl =
          typeof item.faviconDataUrl === 'string' && item.faviconDataUrl.length > 0
            ? item.faviconDataUrl
            : undefined

        if (!title || !url) {
          return null
        }

        return faviconDataUrl
          ? { title, url, faviconDataUrl }
          : { title, url }
      })
      .filter((item): item is SearchClientResult => Boolean(item))

    return { results }
  } catch {
    return null
  }
}

export const stringifySearchClientPayload = (payload: SearchClientPayload): string =>
  JSON.stringify({
    results: payload.results.map((item) =>
      item.faviconDataUrl
        ? {
            title: item.title,
            url: item.url,
            faviconDataUrl: item.faviconDataUrl,
          }
        : {
            title: item.title,
            url: item.url,
          },
    ),
  })

export const parseFetchClientPayload = (raw: string): FetchClientPayload | null => {
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.type !== 'fetch_result') {
      return null
    }

    const faviconDataUrl =
      typeof parsed.faviconDataUrl === 'string' && parsed.faviconDataUrl.length > 0
        ? parsed.faviconDataUrl
        : undefined

    return faviconDataUrl
      ? { type: 'fetch_result', faviconDataUrl }
      : { type: 'fetch_result' }
  } catch {
    return null
  }
}

export const stringifyFetchClientPayload = (payload: FetchClientPayload): string =>
  JSON.stringify(
    payload.faviconDataUrl
      ? {
          type: 'fetch_result',
          faviconDataUrl: payload.faviconDataUrl,
        }
      : {
          type: 'fetch_result',
        },
  )

export const stripTransientSearchClientPayload = (raw: string): string => {
  const parsed = parseSearchClientPayload(raw)
  if (!parsed) {
    return raw
  }

  return stringifySearchClientPayload({
    results: parsed.results.map(({ title, url }) => ({ title, url })),
  })
}

export const stripTransientFetchClientPayload = (raw: string): string => {
  const parsedFetchPayload = parseFetchClientPayload(raw)
  if (parsedFetchPayload) {
    return stringifyFetchClientPayload({ type: 'fetch_result' })
  }

  try {
    const parsed = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.type !== 'image' ||
      typeof parsed.data_url !== 'string' ||
      typeof parsed.faviconDataUrl !== 'string'
    ) {
      return raw
    }

    const rest = { ...parsed }
    delete rest.faviconDataUrl
    return JSON.stringify(rest)
  } catch {
    return raw
  }
}

const stripTransientSearchDataFromResearchItems = (
  items: ResearchItem[],
): ResearchItem[] =>
  items.map((item) => {
    if (item.kind !== 'tool') {
      return { ...item }
    }

    const tool = cloneTool(item.data)
    if (
      SEARCH_TOOL_NAMES.has(tool.call.tool) &&
      tool.result &&
      typeof tool.result.result === 'string'
    ) {
      tool.result.result = stripTransientSearchClientPayload(tool.result.result)
    } else if (
      tool.call.tool === 'fetch_url' &&
      tool.result &&
      typeof tool.result.result === 'string'
    ) {
      tool.result.result = stripTransientFetchClientPayload(tool.result.result)
    }

    return {
      kind: 'tool',
      data: tool,
    }
  })

export const stripTransientSearchDataFromBlocks = (
  blocks: ContentBlock[],
): ContentBlock[] =>
  blocks.map((block) => {
    if (block.type === 'research') {
      return {
        ...block,
        items: stripTransientSearchDataFromResearchItems(block.items),
      }
    }

    if (block.type === 'attachments') {
      return {
        ...block,
        attachments: block.attachments.map((attachment) => ({ ...attachment })),
      }
    }

    return { ...block }
  })

export const stripTransientSearchDataFromMessages = <T extends MessageLike>(
  messages: T[],
): T[] =>
  messages.map((message) => ({
    ...message,
    blocks: stripTransientSearchDataFromBlocks(message.blocks),
  })) as T[]
