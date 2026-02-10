let composerTextarea: HTMLTextAreaElement | null = null

export const setComposerTextarea = (el: HTMLTextAreaElement | null) => {
  composerTextarea = el
}

export const focusComposerTextarea = () => {
  composerTextarea?.focus()
}
