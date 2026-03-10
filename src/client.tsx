import { StrictMode, startTransition } from 'react'

// react-render-tracker 暂时禁用
// if (
//   import.meta.env.DEV &&
//   typeof document !== 'undefined' &&
//   import.meta.env.VITE_ENABLE_RENDER_TRACKER === 'true'
// ) {
//   await import('@aether/react-render-tracker/auto')
// }

const { hydrateRoot } = await import('react-dom/client')
const { StartClient } = await import('@tanstack/react-start/client')

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
