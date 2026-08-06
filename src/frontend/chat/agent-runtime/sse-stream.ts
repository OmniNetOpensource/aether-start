/**
 * sse-stream.ts
 *
 * 纯 SSE 协议解析：把 Response body 的字节流按 \n\n 切成事件块，
 * 解析 event: 与 data: 行后回调 onMessage。不含任何聊天业务逻辑。
 */
export const readSSEStream = async (
  response: Response,
  signal: AbortSignal,
  onMessage: (event: string, data: string) => void,
) => {
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /** 从 buffer 中按 \n\n 切出完整事件块，解析并分发 */
  const flush = () => {
    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf('\n\n');

      if (!block.trim()) continue;

      let event = 'message';
      const dataLines: string[] = [];

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trimStart();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length > 0) {
        onMessage(event, dataLines.join('\n'));
      }
    }
  };

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      flush();
    }
    buffer += decoder.decode().replace(/\r\n/g, '\n');
    flush();
  } finally {
    await Promise.allSettled([reader.cancel()]);
  }
};
