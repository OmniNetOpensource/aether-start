import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from '@/server/functions/chat/models'
import {
  listConversationsPageFn,
  type ConversationListCursor,
  clearConversationsFn,
  deleteConversationFn,
  setConversationPinnedFn,
  updateConversationTitleFn,
} from '@/server/functions/conversations'
import {
  addMessage,
  buildCurrentPath,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage,
  getBranchInfo,
  normalizeMessageParentIds,
  switchBranch,
} from '@/lib/conversation/tree/message-tree'
import {
  applyAssistantAddition,
  type AssistantAddition,
} from '@/lib/conversation/tree/block-operations'
import type { ConversationDetail, ConversationMeta } from '@/types/conversation'
import type {
  AssistantMessage,
  BranchInfo,
  ContentBlock,
  Message,
} from '@/types/message'

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>

export type RoleInfo = { id: string; name: string }

export type PromptInfo = { id: string; name: string }

type ConversationListState = {
  conversations: ConversationMeta[]
  conversationsLoading: boolean
  hasLoaded: boolean
  loadingMore: boolean
  hasMore: boolean
  conversationsCursor: ConversationListCursor
}

export const initialConversationListState: ConversationListState = {
  conversations: [],
  conversationsLoading: false,
  hasLoaded: false,
  loadingMore: false,
  hasMore: false,
  conversationsCursor: null,
}

const MODEL_STORAGE_KEY = 'aether_current_role'
const PROMPT_STORAGE_KEY = 'aether_current_prompt'
const PAGE_SIZE = 10

const getStoredValue = (key: string) => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStoredValue = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export type ChatSessionSelectionState = {
  currentRole: string
  availableRoles: RoleInfo[]
  rolesLoading: boolean
  currentPrompt: string
  availablePrompts: PromptInfo[]
  promptsLoading: boolean
}

export const initialChatSessionSelectionState: ChatSessionSelectionState = {
  currentRole: '',
  availableRoles: [],
  rolesLoading: false,
  currentPrompt: '',
  availablePrompts: [],
  promptsLoading: false,
}

type ChatSessionState = TreeSnapshot &
  ConversationListState &
  ChatSessionSelectionState & {
    conversationId: string | null
  }

type ChatSessionActions = {
  addConversation: (conversation: ConversationMeta) => void
  setConversations: (conversations: ConversationMeta[]) => void
  loadInitialConversations: () => Promise<void>
  loadMoreConversations: () => Promise<void>
  clearConversations: () => Promise<void>
  resetConversations: () => void
  deleteConversation: (id: string) => Promise<void>
  updateConversationTitle: (id: string, title: string) => Promise<void>
  setConversationPinned: (id: string, pinned: boolean) => Promise<void>
  setMessages: (messages: Message[]) => void
  initializeTree: (messages?: Message[], currentPath?: number[]) => void
  getMessagesFromPath: () => Message[]
  setConversationId: (id: string | null) => void
  selectMessage: (messageId: number) => void
  appendToAssistant: (addition: AssistantAddition) => void
  getBranchInfo: (messageId: number) => BranchInfo | null
  navigateBranch: (
    messageId: number,
    depth: number,
    direction: 'prev' | 'next',
  ) => void
  setCurrentRole: (role: string) => void
  setAvailableRoles: (roles: RoleInfo[]) => void
  setRolesLoading: (loading: boolean) => void
  loadAvailableRoles: () => Promise<void>
  setCurrentPrompt: (promptId: string) => void
  setAvailablePrompts: (prompts: PromptInfo[]) => void
  setPromptsLoading: (loading: boolean) => void
  loadAvailablePrompts: () => Promise<void>
  cyclePrompt: () => void
  clearSession: () => void
  getTreeState: () => TreeSnapshot
  setTreeState: (partial: Partial<TreeSnapshot>) => void
  addMessage: (
    role: Message['role'],
    blocks: ContentBlock[],
    createdAt?: string,
  ) => ReturnType<typeof addMessage>
  editMessage: (
    depth: number,
    messageId: number,
    blocks: ContentBlock[],
  ) => ReturnType<typeof editMessage> | null
}

const sortConversations = (conversations: ConversationMeta[]): ConversationMeta[] => {
  const sorted = [...conversations]
  sorted.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1
    }

    const aSortAt = a.is_pinned ? (a.pinned_at ?? a.updated_at) : a.updated_at
    const bSortAt = b.is_pinned ? (b.pinned_at ?? b.updated_at) : b.updated_at
    const bySortAt = bSortAt.localeCompare(aSortAt)

    if (bySortAt !== 0) {
      return bySortAt
    }

    const byUpdated = b.updated_at.localeCompare(a.updated_at)
    if (byUpdated !== 0) {
      return byUpdated
    }

    return b.id.localeCompare(a.id)
  })

  return sorted
}

const upsertConversations = (
  conversations: ConversationMeta[],
  incoming: ConversationMeta[],
) => {
  const map = new Map<string, ConversationMeta>()

  for (const conversation of conversations) {
    map.set(conversation.id, conversation)
  }

  for (const conversation of incoming) {
    map.set(conversation.id, conversation)
  }

  return sortConversations(Array.from(map.values()))
}

const mapDetailToMeta = (detail: ConversationDetail): ConversationMeta => ({
  id: detail.id,
  title: detail.title,
  role: detail.role,
  is_pinned: detail.is_pinned,
  pinned_at: detail.pinned_at,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
  user_id: detail.user_id,
})

export const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()(
  devtools(
    (set, get) => ({
      ...createEmptyMessageState(),
      ...initialConversationListState,
      conversationId: null,
      ...initialChatSessionSelectionState,
      addConversation: (conversation) =>
        set((state) => ({
          conversations: upsertConversations(state.conversations, [conversation]),
        })),
      setConversations: (conversations) =>
        set((state) => ({
          conversations: upsertConversations(state.conversations, conversations),
        })),
      loadInitialConversations: async () => {
        const { hasLoaded, conversationsLoading } = get()
        if (hasLoaded || conversationsLoading) {
          return
        }

        set({ conversationsLoading: true }, false, 'loadInitialConversations/start')

        try {
          const page = await listConversationsPageFn({
            data: { limit: PAGE_SIZE, cursor: null },
          })
          const conversations = (page.items as ConversationDetail[]).map(mapDetailToMeta)

          set(
            (state) => ({
              conversations: upsertConversations(state.conversations, conversations),
              hasLoaded: true,
              conversationsLoading: false,
              hasMore: page.nextCursor !== null,
              conversationsCursor: page.nextCursor,
            }),
            false,
            'loadInitialConversations/success',
          )
        } catch (error) {
          console.error('Failed to load conversations:', error)
          set(
            {
              hasLoaded: true,
              conversationsLoading: false,
              hasMore: false,
              conversationsCursor: null,
            },
            false,
            'loadInitialConversations/failure',
          )
        }
      },
      loadMoreConversations: async () => {
        const {
          hasLoaded,
          conversationsLoading,
          loadingMore,
          hasMore,
          conversationsCursor,
        } = get()
        if (!hasLoaded || conversationsLoading || loadingMore || !hasMore) {
          return
        }

        set({ loadingMore: true }, false, 'loadMoreConversations/start')

        try {
          const page = await listConversationsPageFn({
            data: { limit: PAGE_SIZE, cursor: conversationsCursor },
          })
          const conversations = (page.items as ConversationDetail[]).map(mapDetailToMeta)

          set(
            (state) => ({
              conversations: upsertConversations(state.conversations, conversations),
              loadingMore: false,
              hasMore: page.nextCursor !== null,
              conversationsCursor: page.nextCursor,
            }),
            false,
            'loadMoreConversations/success',
          )
        } catch (error) {
          console.error('Failed to load more conversations:', error)
          set(
            {
              loadingMore: false,
              hasMore: false,
              conversationsCursor: null,
            },
            false,
            'loadMoreConversations/failure',
          )
        }
      },
      clearConversations: async () => {
        try {
          await clearConversationsFn()
        } catch (error) {
          console.error('Failed to clear conversations:', error)
        }

        set(
          {
            conversations: [],
            hasLoaded: true,
            conversationsLoading: false,
            loadingMore: false,
            hasMore: false,
            conversationsCursor: null,
          },
          false,
          'clearConversations',
        )
      },
      resetConversations: () =>
        set(
          {
            ...initialConversationListState,
          },
          false,
          'resetConversations',
        ),
      deleteConversation: async (id) => {
        set(
          (state) => ({
            conversations: state.conversations.filter((item) => item.id !== id),
          }),
          false,
          'deleteConversation/optimistic',
        )

        try {
          await deleteConversationFn({ data: { id } })
        } catch (error) {
          console.error('Failed to delete conversation:', error)
        }
      },
      updateConversationTitle: async (id, title) => {
        const { conversations } = get()
        const target = conversations.find((item) => item.id === id)
        if (!target) {
          return
        }

        const updated: ConversationMeta = { ...target, title }
        set(
          (state) => ({
            conversations: upsertConversations(state.conversations, [updated]),
          }),
          false,
          'updateConversationTitle/optimistic',
        )

        try {
          await updateConversationTitleFn({ data: { id, title } })
        } catch (error) {
          console.error('Failed to update conversation title:', error)
        }
      },
      setConversationPinned: async (id, pinned) => {
        const { conversations } = get()
        const target = conversations.find((item) => item.id === id)
        if (!target) {
          return
        }

        const optimistic: ConversationMeta = {
          ...target,
          is_pinned: pinned,
          pinned_at: pinned ? new Date().toISOString() : null,
        }

        set(
          (state) => ({
            conversations: upsertConversations(state.conversations, [optimistic]),
          }),
          false,
          'setConversationPinned/optimistic',
        )

        try {
          const result = await setConversationPinnedFn({ data: { id, pinned } })
          set(
            (state) => ({
              conversations: upsertConversations(state.conversations, [
                {
                  ...optimistic,
                  pinned_at: pinned ? result.pinned_at : null,
                },
              ]),
            }),
            false,
            'setConversationPinned/success',
          )
        } catch (error) {
          console.error('Failed to update conversation pin state:', error)
          set(
            (state) => ({
              conversations: upsertConversations(state.conversations, [target]),
            }),
            false,
            'setConversationPinned/rollback',
          )
        }
      },
      setMessages: (messages) => {
        const linearState = createLinearMessages(
          messages.map((message) => ({
            role: message.role,
            blocks: message.blocks ?? [],
            createdAt: message.createdAt,
          })),
        )

        set(
          {
            messages: linearState.messages,
            currentPath: linearState.currentPath,
            latestRootId: linearState.latestRootId,
            nextId: linearState.nextId,
          },
          false,
          'setMessages',
        )
      },
      initializeTree: (messages = [], currentPath = []) => {
        const normalizedMessages = normalizeMessageParentIds(messages)
        const resolvedCurrentPath =
          Array.isArray(currentPath) &&
          currentPath.every((id) => typeof id === 'number')
            ? currentPath
            : []
        const fallbackRootId =
          normalizedMessages.length > 0 ? normalizedMessages[0].id : null
        const nextPath =
          resolvedCurrentPath.length > 0
            ? resolvedCurrentPath
            : buildCurrentPath(normalizedMessages, fallbackRootId)
        const latestRootId = nextPath[0] ?? fallbackRootId
        const nextId =
          normalizedMessages.reduce(
            (maxId, message) => Math.max(maxId, message.id),
            0,
          ) + 1

        set(
          {
            messages: normalizedMessages,
            currentPath: nextPath,
            latestRootId,
            nextId,
          },
          false,
          'initializeTree',
        )
      },
      getMessagesFromPath: () =>
        computeMessagesFromPath(get().messages, get().currentPath),
      setConversationId: (conversationId) =>
        set({ conversationId }, false, 'setConversationId'),
      selectMessage: (messageId) => {
        const state = get()
        const targetPath: number[] = []
        const visited = new Set<number>()
        let currentId: number | null = messageId

        while (currentId !== null) {
          if (visited.has(currentId)) {
            return
          }

          const currentMessage: Message | undefined =
            state.messages[currentId - 1]
          if (!currentMessage) {
            return
          }

          targetPath.push(currentId)
          visited.add(currentId)
          currentId = currentMessage.parentId
        }

        targetPath.reverse()

        let nextState = state.getTreeState()
        for (let index = 0; index < targetPath.length; index += 1) {
          nextState = switchBranch(nextState, index + 1, targetPath[index])
        }

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          'selectMessage',
        )
      },
      appendToAssistant: (addition) =>
        set(
          (state) => {
            const lastId = state.currentPath[state.currentPath.length - 1] ?? null
            const lastMessage = lastId ? state.messages[lastId - 1] : null

            let nextMessages = state.messages
            let nextPath = state.currentPath
            let nextLatestRootId = state.latestRootId
            let nextId = state.nextId
            let assistantId = lastId

            if (!lastMessage || lastMessage.role !== 'assistant') {
              const result = addMessage(
                {
                  messages: state.messages,
                  currentPath: state.currentPath,
                  latestRootId: state.latestRootId,
                  nextId: state.nextId,
                },
                'assistant',
                [],
              )
              nextMessages = result.messages
              nextPath = result.currentPath
              nextLatestRootId = result.latestRootId
              nextId = result.nextId
              assistantId = result.addedMessage.id
            }

            if (!assistantId || !nextMessages[assistantId - 1]) {
              return state
            }

            const targetMessage = nextMessages[assistantId - 1] as AssistantMessage
            const updatedMessages = [...nextMessages]
            updatedMessages[assistantId - 1] = {
              ...targetMessage,
              blocks: applyAssistantAddition(targetMessage.blocks ?? [], addition),
            }

            return {
              messages: updatedMessages,
              currentPath: nextPath,
              latestRootId: nextLatestRootId,
              nextId,
            }
          },
          false,
          'appendToAssistant',
        ),
      getBranchInfo: (messageId) => getBranchInfo(get().messages, messageId),
      navigateBranch: (messageId, depth, direction) => {
        const state = get()
        const info = getBranchInfo(state.messages, messageId)
        if (!info) {
          return
        }

        const nextIndex =
          direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1
        if (nextIndex < 0 || nextIndex >= info.total) {
          return
        }

        const targetId = info.siblingIds[nextIndex]
        const nextState = switchBranch(state.getTreeState(), depth, targetId)

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          'navigateBranch',
        )
      },
      setCurrentRole: (currentRole) => {
        set({ currentRole }, false, 'setCurrentRole')

        if (currentRole) {
          setStoredValue(MODEL_STORAGE_KEY, currentRole)
        }
      },
      setAvailableRoles: (availableRoles) =>
        set({ availableRoles }, false, 'setAvailableRoles'),
      setRolesLoading: (rolesLoading) =>
        set({ rolesLoading }, false, 'setRolesLoading'),
      loadAvailableRoles: async () => {
        const state = get()
        if (state.availableRoles.length > 0 || state.rolesLoading) {
          return
        }

        set({ rolesLoading: true }, false, 'loadAvailableRoles/start')

        try {
          const roles = await getAvailableModelsFn()
          const firstId = roles[0]?.id ?? ''
          const stored = getStoredValue(MODEL_STORAGE_KEY)
          const roleToUse =
            stored && roles.some((role) => role.id === stored) ? stored : firstId

          if (roleToUse) {
            get().setCurrentRole(roleToUse)
          }

          set({ availableRoles: roles }, false, 'loadAvailableRoles/success')
        } catch {
          // ignore
        } finally {
          set({ rolesLoading: false }, false, 'loadAvailableRoles/finish')
        }
      },
      setCurrentPrompt: (currentPrompt) => {
        set({ currentPrompt }, false, 'setCurrentPrompt')

        if (currentPrompt) {
          setStoredValue(PROMPT_STORAGE_KEY, currentPrompt)
        }
      },
      setAvailablePrompts: (availablePrompts) =>
        set({ availablePrompts }, false, 'setAvailablePrompts'),
      setPromptsLoading: (promptsLoading) =>
        set({ promptsLoading }, false, 'setPromptsLoading'),
      loadAvailablePrompts: async () => {
        const state = get()
        if (state.availablePrompts.length > 0 || state.promptsLoading) {
          return
        }

        set({ promptsLoading: true }, false, 'loadAvailablePrompts/start')

        try {
          const prompts = await getAvailablePromptsFn()
          const firstId = prompts[0]?.id ?? 'aether'
          const stored = getStoredValue(PROMPT_STORAGE_KEY)
          const promptToUse =
            stored && prompts.some((prompt) => prompt.id === stored)
              ? stored
              : firstId

          if (promptToUse) {
            get().setCurrentPrompt(promptToUse)
          }

          set({ availablePrompts: prompts }, false, 'loadAvailablePrompts/success')
        } catch {
          // ignore
        } finally {
          set({ promptsLoading: false }, false, 'loadAvailablePrompts/finish')
        }
      },
      cyclePrompt: () => {
        const state = get()
        if (state.availablePrompts.length === 0) {
          return
        }

        const currentIndex = state.availablePrompts.findIndex(
          (prompt) => prompt.id === state.currentPrompt,
        )
        const nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + 1) % state.availablePrompts.length

        get().setCurrentPrompt(state.availablePrompts[nextIndex].id)
      },
      clearSession: () => {
        const state = get()
        set(
          {
            ...createEmptyMessageState(),
            conversationId: null,
            currentRole: state.currentRole,
            availableRoles: state.availableRoles,
            rolesLoading: state.rolesLoading,
            currentPrompt: state.currentPrompt,
            availablePrompts: state.availablePrompts,
            promptsLoading: state.promptsLoading,
          },
          false,
          'clearSession',
        )
      },
      getTreeState: () => {
        const state = get()
        return {
          messages: state.messages,
          currentPath: state.currentPath,
          latestRootId: state.latestRootId,
          nextId: state.nextId,
        }
      },
      setTreeState: (partial) =>
        set(
          (state) => ({
            messages: partial.messages
              ? normalizeMessageParentIds(partial.messages)
              : state.messages,
            currentPath: partial.currentPath ?? state.currentPath,
            latestRootId: partial.latestRootId ?? state.latestRootId,
            nextId: partial.nextId ?? state.nextId,
          }),
          false,
          'setTreeState',
        ),
      addMessage: (role, blocks, createdAt) => {
        const result = addMessage(get().getTreeState(), role, blocks, createdAt)
        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          'addMessage',
        )
        return result
      },
      editMessage: (depth, messageId, blocks) => {
        const result = editMessage(get().getTreeState(), depth, messageId, blocks)
        if (!result) {
          return null
        }

        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          'editMessage',
        )

        return result
      },
    }),
    { name: 'ChatSessionStore' },
  ),
)

export const useIsNewChat = () =>
  useChatSessionStore(
    (state) => state.conversationId === null && state.messages.length === 0,
  )
