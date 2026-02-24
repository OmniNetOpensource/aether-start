import type { Message } from '@/features/chat/types/chat'

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g
const IMAGE_WAIT_TIMEOUT_MS = 8000
const FALLBACK_IMAGE_DATA_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">' +
      '<rect width="100%" height="100%" fill="#f3f4f6"/>' +
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="16" font-family="sans-serif">Image unavailable</text>' +
      '</svg>',
  )

export const sanitizeFilename = (title: string) => {
  const sanitized = title
    .replace(INVALID_FILENAME_CHARS, '-')
    .split('')
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()

  const collapsed = sanitized.replace(/-+/g, '-').trim()
  const withoutLeadingDots = collapsed.replace(/^\.+/, '').trim()
  const safe = withoutLeadingDots.slice(0, 80)

  return safe || 'Aether'
}

const pad = (value: number) => value.toString().padStart(2, '0')

export const formatTimestampForFilename = (date: Date = new Date()) => {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())

  return `${year}-${month}-${day}-${hour}-${minute}`
}

export const waitForImages = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll('img'))

  await Promise.all(
    images.map(async (image) => {
      if (image.complete) {
        return
      }

      await new Promise<void>((resolve) => {
        let settled = false
        const cleanup = () => {
          window.clearTimeout(timeoutId)
          image.removeEventListener('load', onLoad)
          image.removeEventListener('error', onError)
        }

        const onLoad = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }

        const onError = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }

        const timeoutId = window.setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }, IMAGE_WAIT_TIMEOUT_MS)

        image.addEventListener('load', onLoad, { once: true })
        image.addEventListener('error', onError, { once: true })

        if (image.complete) {
          onLoad()
        }
      })
    })
  )
}

const blobToDataUrl = async (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })

type ImageSnapshot = {
  image: HTMLImageElement
  src: string
  srcset: string
  crossorigin: string | null
}

export const prepareCrossOriginImagesForExport = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll('img'))
  const snapshots: ImageSnapshot[] = []

  await Promise.all(
    images.map(async (image) => {
      const srcAttr = image.getAttribute('src') ?? ''
      if (!srcAttr) {
        return
      }

      const resolvedSrc = image.currentSrc || srcAttr
      let parsedUrl: URL

      try {
        parsedUrl = new URL(resolvedSrc, window.location.href)
      } catch {
        return
      }

      if (
        parsedUrl.protocol === 'data:' ||
        parsedUrl.protocol === 'blob:' ||
        parsedUrl.origin === window.location.origin
      ) {
        return
      }

      snapshots.push({
        image,
        src: srcAttr,
        srcset: image.getAttribute('srcset') ?? '',
        crossorigin: image.getAttribute('crossorigin'),
      })

      try {
        const response = await fetch(parsedUrl.toString(), {
          mode: 'cors',
          credentials: 'omit',
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const blob = await response.blob()
        const dataUrl = await blobToDataUrl(blob)
        image.setAttribute('src', dataUrl)
        image.removeAttribute('srcset')
      } catch {
        image.setAttribute('src', FALLBACK_IMAGE_DATA_URL)
        image.removeAttribute('srcset')
      }
    }),
  )

  return () => {
    for (const snapshot of snapshots) {
      snapshot.image.setAttribute('src', snapshot.src)
      if (snapshot.srcset) {
        snapshot.image.setAttribute('srcset', snapshot.srcset)
      } else {
        snapshot.image.removeAttribute('srcset')
      }
      if (snapshot.crossorigin === null) {
        snapshot.image.removeAttribute('crossorigin')
      } else {
        snapshot.image.setAttribute('crossorigin', snapshot.crossorigin)
      }
    }
  }
}

export const buildMessageSnippet = (message: Message) => {
  const parts: string[] = []

  for (const block of message.blocks) {
    if (block.type === 'content') {
      const content = block.content.trim()
      if (content) {
        parts.push(content)
      }
      continue
    }

    if (block.type === 'error') {
      parts.push(`Error: ${block.message}`)
      continue
    }

    if (block.type === 'research') {
      const lastItem = block.items[block.items.length - 1]
      if (!lastItem) {
        continue
      }

      if (lastItem.kind === 'thinking') {
        parts.push(`Research: ${lastItem.text}`)
      } else {
        parts.push(`Research: ${lastItem.data.call.tool}`)
      }
      continue
    }

    if (block.type === 'attachments' && block.attachments.length > 0) {
      parts.push(`Attachments: ${block.attachments.length}`)
    }
  }

  const text = parts.join('\n').replace(/\s+/g, ' ').trim()

  if (!text) {
    return message.role === 'user' ? '用户消息' : '助手消息'
  }

  if (text.length <= 140) {
    return text
  }

  return `${text.slice(0, 139)}…`
}

export const buildFontEmbedCSS = async (): Promise<string> => {
  const fontFaceRules: CSSFontFaceRule[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        fontFaceRules.push(rule)
      }
    }
  }

  const cssTexts = await Promise.all(
    fontFaceRules.map(async (rule) => {
      const src = rule.style.getPropertyValue('src')
      const urlMatch = src.match(/url\(["']?([^"')]+)["']?\)/)
      if (!urlMatch) return rule.cssText

      try {
        const res = await fetch(urlMatch[1])
        const blob = await res.blob()
        const dataUri = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        return rule.cssText.replace(urlMatch[0], `url(${dataUri})`)
      } catch {
        return rule.cssText
      }
    })
  )

  return cssTexts.join('\n')
}

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
}
