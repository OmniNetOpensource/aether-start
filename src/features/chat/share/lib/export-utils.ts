import type { Message } from '@/features/chat/types/chat'

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g

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
      if (image.complete && image.naturalWidth > 0) {
        return
      }

      await new Promise<void>((resolve) => {
        const cleanup = () => {
          image.removeEventListener('load', onLoad)
          image.removeEventListener('error', onError)
        }

        const onLoad = () => {
          cleanup()
          resolve()
        }

        const onError = () => {
          cleanup()
          resolve()
        }

        image.addEventListener('load', onLoad)
        image.addEventListener('error', onError)
      })
    })
  )
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
