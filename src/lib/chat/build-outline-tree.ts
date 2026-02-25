import type { Message } from '@/types/chat'

export type OutlineNode = {
  messageId: number
  role: Message['role']
  preview: string
  children: OutlineNode[]
  siblingIndex: number
  siblingCount: number
}

export type ParentById = Record<number, number | null>

const PREVIEW_LIMIT = 60

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()

const truncateText = (value: string, limit = PREVIEW_LIMIT) => {
  const chars = Array.from(value)
  if (chars.length <= limit) {
    return value
  }
  return chars.slice(0, limit).join('')
}

export const collectSiblingIds = (
  messages: Message[],
  anchorId: number | null
): number[] => {
  if (anchorId === null) {
    return []
  }

  const anchor = messages[anchorId - 1]
  if (!anchor) {
    return []
  }

  let leftmostId = anchorId
  const leftVisited = new Set<number>([anchorId])

  while (true) {
    const current = messages[leftmostId - 1]
    if (!current || current.prevSibling === null) {
      break
    }

    if (leftVisited.has(current.prevSibling)) {
      break
    }

    leftmostId = current.prevSibling
    leftVisited.add(leftmostId)
  }

  const siblingIds: number[] = []
  const rightVisited = new Set<number>()
  let currentId: number | null = leftmostId

  while (currentId !== null) {
    if (rightVisited.has(currentId)) {
      break
    }

    const current: Message | undefined = messages[currentId - 1]
    if (!current) {
      break
    }

    siblingIds.push(currentId)
    rightVisited.add(currentId)
    currentId = current.nextSibling
  }

  return siblingIds
}

export const buildParentMap = (messages: Message[]): Record<number, number> => {
  const parentById: Record<number, number> = {}

  for (const message of messages) {
    const childIds = collectSiblingIds(messages, message.latestChild)
    for (const childId of childIds) {
      parentById[childId] = message.id
    }
  }

  return parentById
}

export const getPreview = (message: Message): string => {
  for (const block of message.blocks) {
    if (block.type !== 'content') {
      continue
    }

    const content = normalizeText(block.content)
    if (content) {
      return truncateText(content)
    }
  }

  let attachmentCount = 0
  let errorMessage: string | null = null
  let hasResearch = false

  for (const block of message.blocks) {
    if (block.type === 'attachments') {
      attachmentCount += block.attachments.length
      continue
    }

    if (block.type === 'error' && errorMessage === null) {
      const normalizedError = normalizeText(block.message)
      errorMessage = normalizedError || '错误'
      continue
    }

    if (block.type === 'research') {
      hasResearch = true
    }
  }

  if (attachmentCount > 0) {
    return `图片 x${attachmentCount}`
  }

  if (errorMessage) {
    return truncateText(`错误: ${errorMessage}`)
  }

  if (hasResearch) {
    return '思考/工具调用'
  }

  return '空消息'
}

const buildNodes = (
  messages: Message[],
  parentById: ParentById,
  siblingIds: number[],
  visited: Set<number>
): OutlineNode[] => {
  const siblingCount = siblingIds.length

  return siblingIds
    .map((messageId, index) => {
      if (visited.has(messageId)) {
        return null
      }

      const message = messages[messageId - 1]
      if (!message) {
        return null
      }

      const nextVisited = new Set(visited)
      nextVisited.add(messageId)

      const childIds = collectSiblingIds(messages, message.latestChild).filter(
        (childId) => parentById[childId] === messageId
      )

      return {
        messageId,
        role: message.role,
        preview: getPreview(message),
        children: buildNodes(messages, parentById, childIds, nextVisited),
        siblingIndex: index + 1,
        siblingCount,
      } satisfies OutlineNode
    })
    .filter((node): node is OutlineNode => node !== null)
}

export const buildOutlineTree = (
  messages: Message[],
  latestRootId: number | null
): { roots: OutlineNode[]; parentById: ParentById } => {
  const rawParentById = buildParentMap(messages)
  const childIdSet = new Set<number>(
    Object.keys(rawParentById).map((id) => Number(id))
  )

  const allRootIds = messages
    .map((message) => message.id)
    .filter((id) => !childIdSet.has(id))

  const rootIdSet = new Set<number>(allRootIds)
  const preferredRootIds = collectSiblingIds(messages, latestRootId).filter((id) =>
    rootIdSet.has(id)
  )

  const preferredRootSet = new Set<number>(preferredRootIds)
  const orphanRootIds = allRootIds
    .filter((id) => !preferredRootSet.has(id))
    .sort((a, b) => a - b)

  const orderedRootIds = [...preferredRootIds, ...orphanRootIds]

  const parentById: ParentById = {}
  for (const [childId, parentId] of Object.entries(rawParentById)) {
    parentById[Number(childId)] = parentId
  }

  for (const rootId of orderedRootIds) {
    parentById[rootId] = null
  }

  return {
    roots: buildNodes(messages, parentById, orderedRootIds, new Set()),
    parentById,
  }
}

export const findPathToMessage = (
  parentById: ParentById,
  targetId: number
): number[] => {
  if (!Number.isInteger(targetId) || !(targetId in parentById)) {
    return []
  }

  const reversedPath: number[] = []
  const visited = new Set<number>()
  let currentId: number | null = targetId

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return []
    }

    reversedPath.push(currentId)
    visited.add(currentId)

    const parentId: number | null | undefined = parentById[currentId]
    if (parentId === null) {
      break
    }

    if (typeof parentId !== 'number') {
      return []
    }

    currentId = parentId
  }

  return reversedPath.reverse()
}
