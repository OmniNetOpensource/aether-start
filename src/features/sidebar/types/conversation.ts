import type { Message } from '@/types/message';
import type { ArtifactLanguage } from '@/types/chat-api';

export type ConversationArtifact = {
  id: string;
  conversation_id: string;
  title: string;
  language: ArtifactLanguage;
  code: string;
  created_at: string;
  updated_at: string;
};

export type ConversationMeta = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  currentPath: number[];
  messages: Message[];
  artifacts: ConversationArtifact[];
  created_at: string;
  updated_at: string;
};

export type ConversationSearchItem = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  matchedIn: 'title' | 'content';
  excerpt: string;
};

export type ConversationSearchPageResult = {
  items: ConversationSearchItem[];
  nextCursor: { updated_at: string; id: string } | null;
  mode: 'fts' | 'contains';
};
