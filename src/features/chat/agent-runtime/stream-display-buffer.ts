import type { ChatRuntimeState } from './chat-runtime-state';

/** 每帧最多展示多少个 Unicode 码位（展开字符串迭代），过大则调快，过小则更平滑 */
const CHARS_PER_FRAME = 14;

type Segment =
  | { kind: 'content'; text: string; runtime: ChatRuntimeState }
  | { kind: 'thinking'; text: string; runtime: ChatRuntimeState }
  | { kind: 'artifact'; artifactId: string; text: string; runtime: ChatRuntimeState };

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

  if (head.kind === 'content') {
    head.runtime.session.appendToAssistant({ type: 'content', content: chunk });
  } else if (head.kind === 'thinking') {
    head.runtime.session.appendToAssistant({ kind: 'thinking', text: chunk });
  } else {
    head.runtime.session.appendArtifactCode(head.artifactId, chunk);
  }

  if (!head.text) {
    queue.shift();
  }

  if (queue.length > 0) {
    schedulePump();
  }
};

export const enqueueStreamContent = (runtime: ChatRuntimeState, text: string) => {
  if (!text) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'content' && last.runtime === runtime) {
    last.text += text;
  } else {
    queue.push({ kind: 'content', text, runtime });
  }
  schedulePump();
};

export const enqueueStreamThinking = (runtime: ChatRuntimeState, text: string) => {
  if (!text) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'thinking' && last.runtime === runtime) {
    last.text += text;
  } else {
    queue.push({ kind: 'thinking', text, runtime });
  }
  schedulePump();
};

export const enqueueStreamArtifactCode = (
  runtime: ChatRuntimeState,
  artifactId: string,
  delta: string,
) => {
  if (!delta) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'artifact' && last.artifactId === artifactId && last.runtime === runtime) {
    last.text += delta;
  } else {
    queue.push({ kind: 'artifact', artifactId, text: delta, runtime });
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

  for (const seg of queue) {
    if (!seg.text) continue;
    if (seg.kind === 'content') {
      seg.runtime.session.appendToAssistant({ type: 'content', content: seg.text });
    } else if (seg.kind === 'thinking') {
      seg.runtime.session.appendToAssistant({ kind: 'thinking', text: seg.text });
    } else {
      seg.runtime.session.appendArtifactCode(seg.artifactId, seg.text);
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
