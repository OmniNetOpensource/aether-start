import { arrayBufferToBase64 } from '@/server/base64'

const FAVICON_TIMEOUT_MS = 5_000

const buildFaviconServiceUrl = (url: string): string | null => {
  try {
    const hostname = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`
  } catch {
    return null
  }
}

export const fetchFaviconDataUrl = async (
  url: string,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  const faviconUrl = buildFaviconServiceUrl(url)
  if (!faviconUrl) {
    return undefined
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS)
  const linkedAbort = () => controller.abort()
  signal?.addEventListener('abort', linkedAbort)

  try {
    const response = await fetch(faviconUrl, {
      headers: {
        Accept: 'image/*',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      return undefined
    }

    const contentType = response.headers.get('content-type') || 'image/png'
    if (!contentType.startsWith('image/')) {
      return undefined
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      return undefined
    }

    return `data:${contentType.split(';')[0].trim()};base64,${arrayBufferToBase64(arrayBuffer)}`
  } catch {
    return undefined
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
    clearTimeout(timeoutId)
  }
}
