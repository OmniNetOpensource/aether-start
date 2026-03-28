import { createContext, useContext, type ReactNode } from 'react';
import { type ModelInfo, type PromptInfo } from '../session';

export type AppShellRouteData = {
  availableModels: ModelInfo[];
  availablePrompts: PromptInfo[];
  initialModelId: string;
  initialPromptId: string;
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
