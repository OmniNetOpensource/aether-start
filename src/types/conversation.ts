export type ConversationMeta = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  currentPath: number[];
  messages: import('./message').Message[];
  created_at: string;
  updated_at: string;
};

export type ConversationSearchItem = {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
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
