export function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.trim().split('\n')
  const paragraphs: string[] = []
  let current: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      current.push(line)
    } else if (!inCodeBlock && line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join('\n'))
        current = []
      }
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join('\n'))
  }

  return paragraphs
}
