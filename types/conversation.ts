export type Conversation = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  pinned_at?: string;
};
