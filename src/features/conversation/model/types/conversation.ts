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
