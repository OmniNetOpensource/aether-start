import { createContext, useContext, type ReactNode } from 'react';
import type { ConversationListCursor } from '@/server/functions/conversations';
import type { ConversationMeta } from '@/types/conversation';
import { type PromptInfo, type RoleInfo } from './useChatSessionStore';

export type AppShellRouteData = {
  availableRoles: RoleInfo[];
  availablePrompts: PromptInfo[];
  initialRoleId: string;
  initialPromptId: string;
  initialConversations: ConversationMeta[];
  nextConversationCursor: ConversationListCursor;
};

const AppShellRouteDataContext = createContext<AppShellRouteData | null>(null);

export function AppShellRouteDataProvider({
  value,
  children,
}: {
  value: AppShellRouteData;
  children: ReactNode;
}) {
  return (
    <AppShellRouteDataContext.Provider value={value}>{children}</AppShellRouteDataContext.Provider>
  );
}

export const useAppShellRouteData = () => useContext(AppShellRouteDataContext);
