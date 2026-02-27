import type { AssistantContentBlock, Attachment, UserContentBlock } from '@/types/message'

export type ArenaVoteChoice = 'a' | 'b' | 'tie' | 'both_bad'

export type ArenaModelSummary = {
  roleId: string
  name: string
}

export type ArenaResponseView = {
  label: 'A' | 'B'
  blocks: AssistantContentBlock[]
  model?: ArenaModelSummary
}

export type ArenaRoundView = {
  id: string
  sessionId: string
  prompt: UserContentBlock[]
  responseA: ArenaResponseView
  responseB: ArenaResponseView
  vote: ArenaVoteChoice | null
  created_at: string
  updated_at: string
}

export type ArenaSessionView = {
  id: string
  created_at: string
  updated_at: string
  rounds: ArenaRoundView[]
}

export type ArenaLeaderboardItem = {
  rank: number
  roleId: string
  name: string
  rating: number
  matches: number
  wins: number
  losses: number
  draws: number
  winRate: number
}

export type ArenaCreateRoundInput = {
  sessionId?: string
  promptText: string
  attachments: Attachment[]
}

export type ArenaVoteInput = {
  roundId: string
  choice: ArenaVoteChoice
}
