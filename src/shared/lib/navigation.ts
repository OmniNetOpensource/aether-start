let navigateFn: ((path: string) => void) | null = null

export const setNavigate = (fn: (path: string) => void) => {
  navigateFn = fn
}

export const appNavigate = (path: string) => {
  navigateFn?.(path)
}
