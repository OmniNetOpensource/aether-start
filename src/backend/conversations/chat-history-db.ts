import { z } from 'zod';
import { Buffer } from 'node:buffer';
import { getConversationById } from './conversations-db';
import { getChatHistoryText } from '@/shared/chat/chat-history';
import { isMessage, type Message } from '@/shared/chat/message';

const searchCursorSchema = z
  .object({ query: z.string(), updated_at: z.string(), conversation_id: z.string() })
  .strict();

const readCursorSchema = z
  .object({
    conversation_id: z.string(),
    message_id: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
  })
  .strict();

type HistorySearchResult = {
  conversation_id: string;
  title: string | null;
  updated_at: string;
  url: string;
  matches: { message_id: number; role: Message['role']; created_at: string; snippet: string }[];
};

export const searchChatHistory = async (
  db: D1Database,
  input: { userId: string; conversationId: string; query: string; cursor?: string },
  signal?: AbortSignal,
) => {
  const query = input.query.trim().replace(/\s+/g, ' ');
  let cursor = input.cursor
    ? searchCursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
    : null;
  if (cursor && cursor.query !== query) throw new Error('Cursor belongs to another query');

  const containsCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(
    query,
  );
  const terms = containsCjk
    ? [query.toLowerCase()]
    : (query
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .match(/[\p{L}\p{N}]+/gu) ?? []);
  const results: HistorySearchResult[] = [];
  if (terms.length === 0) return { results, next_cursor: null };

  while (results.length < 11) {
    signal?.throwIfAborted();
    const page = await db
      .prepare(
        `SELECT m.id, m.title, m.updated_at, b.messages_json
         FROM conversation_search_fts s
         JOIN conversation_metas m ON m.user_id = s.user_id AND m.id = s.conversation_id
         JOIN conversation_bodies b ON b.user_id = m.user_id AND b.id = m.id
         WHERE s.user_id = ?1 AND m.id != ?2
           AND ${containsCjk ? 'instr(lower(s.body), ?3) > 0' : 'conversation_search_fts MATCH ?3'}
           AND (?4 IS NULL OR m.updated_at < ?4 OR (m.updated_at = ?4 AND m.id < ?5))
         ORDER BY m.updated_at DESC, m.id DESC
         LIMIT 20`,
      )
      .bind(
        input.userId,
        input.conversationId,
        containsCjk ? terms[0] : `body : (${terms.map((term) => `${term}*`).join(' AND ')})`,
        cursor?.updated_at ?? null,
        cursor?.conversation_id ?? null,
      )
      .all<{ id: string; title: string | null; updated_at: string; messages_json: string }>();

    for (const row of page.results) {
      signal?.throwIfAborted();
      cursor = { query, updated_at: row.updated_at, conversation_id: row.id };
      const messages = z.array(z.custom<Message>(isMessage)).parse(JSON.parse(row.messages_json));
      const texts = messages.map((message) => ({
        message,
        text: getChatHistoryText(message).replace(/\s+/g, ' ').trim(),
      }));
      const searchable = texts
        .map(({ text }) => text)
        .join('\n')
        .toLowerCase();
      const words =
        searchable
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .match(/[\p{L}\p{N}]+/gu) ?? [];
      if (
        !terms.every((term) =>
          containsCjk ? searchable.includes(term) : words.some((word) => word.startsWith(term)),
        )
      ) {
        continue;
      }
      const matches = texts
        .flatMap(({ message, text }) => {
          const lowerText = containsCjk
            ? text.toLowerCase()
            : text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
          const hit = terms.map((term) => lowerText.indexOf(term)).find((index) => index >= 0);
          if (hit === undefined) return [];
          const start = Math.max(0, hit - 48);
          const end = Math.min(text.length, hit + 192);
          return [
            {
              message_id: message.id,
              role: message.role,
              created_at: message.createdAt,
              snippet: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
            },
          ];
        })
        .slice(0, 3);
      if (matches.length === 0) continue;
      results.push({
        conversation_id: row.id,
        title: row.title,
        updated_at: row.updated_at,
        url: `/app/${encodeURIComponent(row.id)}`,
        matches,
      });
      if (results.length === 11) break;
    }
    if (page.results.length < 20) break;
  }

  const hasMore = results.length > 10;
  results.length = Math.min(results.length, 10);
  const last = results.at(-1);
  return {
    results,
    next_cursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              query,
              updated_at: last.updated_at,
              conversation_id: last.conversation_id,
            }),
          ).toString('base64url')
        : null,
  };
};

export const readChatHistory = async (
  db: D1Database,
  input: { userId: string; conversation_id: string; message_id: number; cursor?: string },
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();
  const conversation = await getConversationById(db, input.conversation_id, input.userId);
  if (!conversation) throw new Error('Conversation is not accessible');
  const messages = z.array(z.custom<Message>(isMessage)).parse(conversation.messages);
  const byId = new Map(messages.map((message) => [message.id, message]));
  const anchor = byId.get(input.message_id);
  if (!anchor) throw new Error('Message is not accessible');

  const path: Message[] = [];
  const visited = new Set<number>();
  let current: Message | undefined = anchor;
  while (current) {
    if (visited.has(current.id)) throw new Error('Invalid conversation branch');
    visited.add(current.id);
    path.unshift(current);
    const parentId: number | null = current.parentId;
    current = parentId === null ? undefined : byId.get(parentId);
    if (parentId !== null && !current) throw new Error('Invalid conversation parent');
  }
  current = anchor;
  while (current.latestChild !== null) {
    const child = byId.get(current.latestChild);
    if (!child || child.parentId !== current.id || visited.has(child.id)) {
      throw new Error('Invalid conversation child');
    }
    visited.add(child.id);
    path.push(child);
    current = child;
  }
  const readable = path
    .map((message) => ({ message, text: getChatHistoryText(message) }))
    .filter(({ text }) => text.length > 0);
  const anchorIndex = readable.findIndex(({ message }) => message.id === anchor.id);
  if (anchorIndex < 0) throw new Error('Message has no readable body');
  const cursor = input.cursor
    ? readCursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
    : null;
  if (
    cursor &&
    (cursor.conversation_id !== input.conversation_id || cursor.message_id !== input.message_id)
  ) {
    throw new Error('Cursor belongs to another message');
  }
  const start = cursor?.index ?? Math.max(0, anchorIndex - 2);
  const offset = cursor?.offset ?? 0;
  if (start >= readable.length || offset >= readable[start].text.length) {
    throw new Error('Cursor is outside the message body');
  }
  const end = cursor
    ? Math.min(readable.length, start + 5)
    : Math.min(readable.length, anchorIndex + 3);
  const result = [];
  let index = start;
  let nextOffset = offset;
  let remaining = 12_000;
  while (index < end && remaining > 0) {
    signal?.throwIfAborted();
    const { message, text } = readable[index];
    const content = text.slice(nextOffset, nextOffset + Math.min(6_000, remaining));
    result.push({
      message_id: message.id,
      parent_id: message.parentId,
      role: message.role,
      created_at: message.createdAt,
      content,
      offset: nextOffset,
      total_chars: text.length,
      truncated: nextOffset + content.length < text.length,
    });
    remaining -= content.length;
    nextOffset += content.length;
    if (nextOffset < text.length) break;
    index += 1;
    nextOffset = 0;
  }
  return {
    conversation_id: conversation.id,
    title: conversation.title,
    url: `/app/${encodeURIComponent(conversation.id)}`,
    messages: result,
    previous_cursor:
      start > 0
        ? Buffer.from(
            JSON.stringify({
              conversation_id: input.conversation_id,
              message_id: input.message_id,
              index: Math.max(0, start - 5),
              offset: 0,
            }),
          ).toString('base64url')
        : null,
    next_cursor:
      index < readable.length
        ? Buffer.from(
            JSON.stringify({
              conversation_id: input.conversation_id,
              message_id: input.message_id,
              index,
              offset: nextOffset,
            }),
          ).toString('base64url')
        : null,
  };
};
