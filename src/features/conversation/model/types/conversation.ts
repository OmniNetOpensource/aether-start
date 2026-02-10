export type Conversation = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  pinned_at?: string;
};

export type LocalConversation = {
  id: string;
  title: string | null;
  currentPath: number[];
  messages: import('./message').Message[];
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  pinned_at?: string;
};
