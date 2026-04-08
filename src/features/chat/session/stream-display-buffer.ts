import { useChatSessionStore } from '@/features/conversations/session';

/** 每帧最多展示多少个 Unicode 码位（展开字符串迭代），过大则调快，过小则更平滑 */
const CHARS_PER_FRAME = 24;

type Segment =
  | { kind: 'content'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'artifact'; artifactId: string; text: string };

let queue: Segment[] = [];
let rafId: number | null = null;

const schedulePump = () => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(tick);
};

const tick = () => {
  rafId = null;
  if (queue.length === 0) {
    return;
  }

  const head = queue[0];
  if (!head.text) {
    queue.shift();
    schedulePump();
    return;
  }

  const units = [...head.text];
  const chunk = units.slice(0, CHARS_PER_FRAME).join('');
  head.text = units.slice(CHARS_PER_FRAME).join('');

  const store = useChatSessionStore.getState();
  if (head.kind === 'content') {
    store.appendToAssistant({ type: 'content', content: chunk });
  } else if (head.kind === 'thinking') {
    store.appendToAssistant({ kind: 'thinking', text: chunk });
  } else {
    store.appendArtifactCode(head.artifactId, chunk);
  }

  if (!head.text) {
    queue.shift();
  }

  if (queue.length > 0) {
    schedulePump();
  }
};

export const enqueueStreamContent = (text: string) => {
  if (!text) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'content') {
    last.text += text;
  } else {
    queue.push({ kind: 'content', text });
  }
  schedulePump();
};

export const enqueueStreamThinking = (text: string) => {
  if (!text) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'thinking') {
    last.text += text;
  } else {
    queue.push({ kind: 'thinking', text });
  }
  schedulePump();
};

export const enqueueStreamArtifactCode = (artifactId: string, delta: string) => {
  if (!delta) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'artifact' && last.artifactId === artifactId) {
    last.text += delta;
  } else {
    queue.push({ kind: 'artifact', artifactId, text: delta });
  }
  schedulePump();
};

export const flushAll = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (queue.length === 0) {
    return;
  }

  const store = useChatSessionStore.getState();
  for (const seg of queue) {
    if (!seg.text) continue;
    if (seg.kind === 'content') {
      store.appendToAssistant({ type: 'content', content: seg.text });
    } else if (seg.kind === 'thinking') {
      store.appendToAssistant({ kind: 'thinking', text: seg.text });
    } else {
      store.appendArtifactCode(seg.artifactId, seg.text);
    }
  }
  queue = [];
};

export const reset = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  queue = [];
};
