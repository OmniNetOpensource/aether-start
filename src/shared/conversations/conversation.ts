import type { Message } from '@/shared/chat/message';
import type { ArtifactLanguage } from '@/shared/chat/chat-api';

export type ConversationArtifact = {
  id: string;
  conversation_id: string;
  title: string;
  language: ArtifactLanguage;
  code: string;
  deploy_url: string | null;
  deployed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationMeta = {
  id: string;
  user_id?: string;
  title: string | null;
  model?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  id: string;
  user_id?: string;
  title: string | null;
  model?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  messages: Message[];
  artifacts: ConversationArtifact[];
  created_at: string;
  updated_at: string;
};

export type ConversationSearchItem = {
  id: string;
  user_id?: string;
  title: string | null;
  model?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  matchedIn: 'title' | 'content';
  excerpt: string;
};

export type ConversationListCursor = {
  is_pinned: 0 | 1;
  sort_at: string;
  updated_at: string;
  id: string;
} | null;

export type ConversationSearchCursor = {
  updated_at: string;
  id: string;
} | null;

export type ConversationSearchPageResult = {
  items: ConversationSearchItem[];
  nextCursor: ConversationSearchCursor;
  mode: 'fts' | 'contains';
};
