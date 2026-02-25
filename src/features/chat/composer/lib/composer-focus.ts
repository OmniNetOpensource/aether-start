import { useComposerStore } from '@/stores/useComposerStore'

let composerTextarea: HTMLTextAreaElement | null = null

export const setComposerTextarea = (el: HTMLTextAreaElement | null) => {
  composerTextarea = el
}

export const focusComposerTextarea = () => {
  composerTextarea?.focus()
}

export const insertQuoteAtCursor = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return

  const quoted = trimmed
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n')

  const store = useComposerStore.getState()
  const current = store.input
  const pos = composerTextarea?.selectionStart ?? current.length

  const before = current.slice(0, pos)
  const after = current.slice(pos)

  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n')
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n')

  const insert =
    (needsLeadingNewline ? '\n' : '') +
    quoted +
    '\n' +
    (needsTrailingNewline ? '\n' : '')

  const newValue = before + insert + after
  store.setInput(newValue)

  const cursorPos = before.length + insert.length
  requestAnimationFrame(() => {
    if (composerTextarea) {
      composerTextarea.focus()
      composerTextarea.selectionStart = cursorPos
      composerTextarea.selectionEnd = cursorPos
    }
  })
}
