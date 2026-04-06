// @vitest-environment node
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OpenAIChatProvider } from './openai';
import type { ChatServerToClientEvent } from '@/features/chat/chat-api';
import { processEventToTree } from '@/features/chat/agent-runtime/event-processor';
import { createEmptyMessageState } from '@/features/conversations/conversation-tree/message-tree';
import { ResearchBlock } from '@/features/chat/research/ResearchBlock';
import type { AssistantContentBlock } from '@/features/chat/message-thread';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readMetadataMessage = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('error' in error)) {
    return null;
  }

  const inner = error.error;
  if (!inner || typeof inner !== 'object' || !('metadata' in inner)) {
    return null;
  }

  const metadata = inner.metadata;
  if (!metadata || typeof metadata !== 'object' || !('raw' in metadata)) {
    return null;
  }

  return typeof metadata.raw === 'string' ? metadata.raw : null;
};

const runProviderProbe = async () => {
  const provider = new OpenAIChatProvider({
    model: 'xiaomi/mimo-v2-pro',
    backendConfig: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'User-Agent': 'aether-test' },
    },
    tools: [],
    systemPrompt: '',
  });

  const events: ChatServerToClientEvent[] = [];

  for await (const event of provider.run([
    {
      role: 'user',
      content:
        'Count how many times the letter r appears in the word strawberry, then answer briefly.',
    },
  ])) {
    events.push(event);
  }

  return events;
};

const findConsecutiveDuplicateThinkingChunks = (events: ChatServerToClientEvent[]) => {
  const thinkingEvents = events.filter(
    (event): event is Extract<ChatServerToClientEvent, { type: 'thinking' }> =>
      event.type === 'thinking',
  );
  const duplicatePairs: Array<{ index: number; content: string }> = [];

  for (let index = 1; index < thinkingEvents.length; index += 1) {
    const previous = thinkingEvents[index - 1];
    const current = thinkingEvents[index];

    if (!previous.content || previous.content !== current.content) {
      continue;
    }

    duplicatePairs.push({
      index,
      content: current.content,
    });
  }

  return {
    thinkingEvents,
    duplicatePairs,
  };
};

const getRenderedThinkingText = (events: ChatServerToClientEvent[]) => {
  let tree = createEmptyMessageState();

  for (const event of events) {
    tree = processEventToTree(tree, event);
  }

  const assistantId = tree.currentPath.at(-1);
  if (!assistantId) {
    return '';
  }

  const assistantMessage = tree.messages[assistantId - 1];
  if (!assistantMessage || assistantMessage.role !== 'assistant') {
    return '';
  }

  const researchBlock = assistantMessage.blocks.find(
    (block): block is Extract<AssistantContentBlock, { type: 'research' }> =>
      block.type === 'research',
  );
  if (!researchBlock) {
    return '';
  }

  const html = renderToStaticMarkup(
    createElement(ResearchBlock, {
      items: researchBlock.items,
      blockIndex: 0,
      messageIndex: 0,
    }),
  );

  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

describe('thinking chunk duplication', () => {
  it('fails when the rendered page would show duplicated thinking chunks from one real mimo response', async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('Missing OPENROUTER_API_KEY');
    }

    let events: ChatServerToClientEvent[] | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        events = await runProviderProbe();
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 4) {
          break;
        }
        await delay(attempt * 3000);
      }
    }

    if (!events) {
      const metadataMessage = readMetadataMessage(lastError);
      if (metadataMessage) {
        throw new Error(metadataMessage, { cause: lastError });
      }
      throw lastError;
    }

    const answerEvents = events.filter(
      (event): event is Extract<ChatServerToClientEvent, { type: 'content' }> =>
        event.type === 'content',
    );
    const { thinkingEvents, duplicatePairs } = findConsecutiveDuplicateThinkingChunks(events);
    const renderedThinkingText = getRenderedThinkingText(events);

    const renderedDuplicateChunks = duplicatePairs.filter((pair) =>
      renderedThinkingText.includes(`${pair.content}${pair.content}`),
    );

    console.log(
      JSON.stringify(
        {
          model: 'xiaomi/mimo-v2-pro',
          eventCount: events.length,
          thinkingEventCount: thinkingEvents.length,
          answerChunkCount: answerEvents.length,
          consecutiveDuplicateThinkingPairs: duplicatePairs.length,
          renderedThinkingLength: renderedThinkingText.length,
          renderedDuplicateChunkCount: renderedDuplicateChunks.length,
          firstThinkingChunks: thinkingEvents.slice(0, 12),
          firstAnswerChunks: answerEvents.slice(0, 12),
        },
        null,
        2,
      ),
    );

    expect(events.length).toBeGreaterThan(0);
    expect(thinkingEvents.length).toBeGreaterThan(0);
    expect(answerEvents.length).toBeGreaterThan(0);
    expect(renderedThinkingText.length).toBeGreaterThan(0);
    expect(renderedDuplicateChunks).toEqual([]);
  }, 90_000);
});
