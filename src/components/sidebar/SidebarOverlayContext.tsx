import { createContext, useContext, type ReactNode } from 'react'

type SidebarOverlayContextValue = {
  setOverlayOpen: (overlayId: string, open: boolean) => void
}

const SidebarOverlayContext = createContext<SidebarOverlayContextValue | null>(
  null
)

export function SidebarOverlayProvider({
  children,
  value,
}: {
  children: ReactNode
  value: SidebarOverlayContextValue
}) {
  return (
    <SidebarOverlayContext.Provider value={value}>
      {children}
    </SidebarOverlayContext.Provider>
  )
}

export function useSidebarOverlay() {
  const context = useContext(SidebarOverlayContext)

  if (!context) {
    throw new Error(
      'useSidebarOverlay must be used within a SidebarOverlayProvider'
    )
  }

  return context
}
