export function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      current.push(line);
      continue;
    }

    if (inCodeBlock) {
      current.push(line);
      continue;
    }

    if (current.length > 0) {
      paragraphs.push(current.join('\n'));
    }

    current = [];
    paragraphs.push(line);
  }

  if (current.length > 0) {
    paragraphs.push(current.join('\n'));
  }

  return paragraphs;
}
