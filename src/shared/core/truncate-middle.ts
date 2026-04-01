const ELLIPSIS = '…';

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 0) {
    return '';
  }
  if (maxChars <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, maxChars);
  }
  const inner = maxChars - ELLIPSIS.length;
  const headLen = Math.ceil(inner / 2);
  const tailLen = Math.floor(inner / 2);
  if (tailLen === 0) {
    return text.slice(0, headLen) + ELLIPSIS;
  }
  return text.slice(0, headLen) + ELLIPSIS + text.slice(-tailLen);
}
