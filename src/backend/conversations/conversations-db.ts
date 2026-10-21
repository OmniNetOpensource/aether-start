import { isMessage, type Message } from '@/shared/chat/message';
import type { ConversationListCursor } from '@/shared/conversations/conversation';
import { getChatHistoryText } from '@/shared/chat/chat-history';

export type ConversationRecord = {
  user_id: string;
  id: string;
  title: string | null;
  model: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  messages: object[];
  created_at: string;
  updated_at: string;
};

export type ConversationPayload = {
  user_id: string;
  id: string;
  title: string | null;
  model?: string | null;
  messages: object[];
  created_at: string;
  updated_at: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const safeParseMessages = (value: string): object[] => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is object => typeof item === 'object' && item !== null);
  } catch {
    return [];
  }
};

const toPinnedBoolean = (value: unknown) => value === 1 || value === '1';

const toPinnedAt = (value: unknown) => (typeof value === 'string' ? value : null);

const toConversationRecord = (row: unknown): ConversationRecord | null => {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.user_id !== 'string') {
    return null;
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null;
  const model = typeof row.model === 'string' ? row.model : null;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt;
  const isPinned = toPinnedBoolean(row.is_pinned);
  const pinnedAtRaw = toPinnedAt(row.pinned_at);
  const pinnedAt = isPinned ? (pinnedAtRaw ?? updatedAt) : null;
  const messagesJson = typeof row.messages_json === 'string' ? row.messages_json : '[]';

  return {
    user_id: row.user_id,
    id: row.id,
    title,
    model,
    is_pinned: isPinned,
    pinned_at: pinnedAt,
    messages: safeParseMessages(messagesJson),
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const toConversationSummaryRecord = (row: unknown): ConversationRecord | null => {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.user_id !== 'string') {
    return null;
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null;
  const model = typeof row.model === 'string' ? row.model : null;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt;
  const isPinned = toPinnedBoolean(row.is_pinned);
  const pinnedAtRaw = toPinnedAt(row.pinned_at);
  const pinnedAt = isPinned ? (pinnedAtRaw ?? updatedAt) : null;

  return {
    user_id: row.user_id,
    id: row.id,
    title,
    model,
    is_pinned: isPinned,
    pinned_at: pinnedAt,
    messages: [],
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

export const listConversationsPage = async (
  db: D1Database,
  input: { userId: string; limit: number; cursor: ConversationListCursor },
) => {
  const rows = input.cursor
    ? await db
        .prepare(
          `
          SELECT m.user_id, m.id, m.title, m.model, m.is_pinned, m.pinned_at, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE m.user_id = ?1
            AND (
              m.is_pinned < ?2
              OR (
                m.is_pinned = ?2
                AND (
                  (CASE
                    WHEN m.is_pinned = 1 THEN COALESCE(m.pinned_at, m.updated_at)
                    ELSE m.updated_at
                  END) < ?3
                  OR (
                    (CASE
                      WHEN m.is_pinned = 1 THEN COALESCE(m.pinned_at, m.updated_at)
                      ELSE m.updated_at
                    END) = ?3
                    AND (
                      m.updated_at < ?4
                      OR (m.updated_at = ?4 AND m.id < ?5)
                    )
                  )
                )
              )
            )
          ORDER BY
            m.is_pinned DESC,
            CASE
              WHEN m.is_pinned = 1 THEN COALESCE(m.pinned_at, m.updated_at)
              ELSE m.updated_at
            END DESC,
            m.updated_at DESC,
            m.id DESC
          LIMIT ?6
          `,
        )
        .bind(
          input.userId,
          input.cursor.is_pinned,
          input.cursor.sort_at,
          input.cursor.updated_at,
          input.cursor.id,
          input.limit,
        )
        .all()
    : await db
        .prepare(
          `
          SELECT m.user_id, m.id, m.title, m.model, m.is_pinned, m.pinned_at, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE m.user_id = ?1
          ORDER BY
            m.is_pinned DESC,
            CASE
              WHEN m.is_pinned = 1 THEN COALESCE(m.pinned_at, m.updated_at)
              ELSE m.updated_at
            END DESC,
            m.updated_at DESC,
            m.id DESC
          LIMIT ?2
          `,
        )
        .bind(input.userId, input.limit)
        .all();

  const mapped = Array.isArray(rows.results)
    ? rows.results
        .map((row) => toConversationSummaryRecord(row))
        .filter((row): row is ConversationRecord => !!row)
    : [];

  const last = mapped.at(-1);
  const nextCursor: ConversationListCursor =
    mapped.length === input.limit && last
      ? {
          is_pinned: last.is_pinned ? 1 : 0,
          sort_at: last.is_pinned ? (last.pinned_at ?? last.updated_at) : last.updated_at,
          updated_at: last.updated_at,
          id: last.id,
        }
      : null;

  return {
    items: mapped,
    nextCursor,
  };
};

export const getConversationById = async (db: D1Database, id: string, userId: string) => {
  const row = await db
    .prepare(
      `
      SELECT m.user_id, m.id, m.title, m.model, m.is_pinned, m.pinned_at, m.created_at, m.updated_at, b.messages_json
      FROM conversation_metas m
      JOIN conversation_bodies b ON b.user_id = m.user_id AND b.id = m.id
      WHERE m.id = ?1 AND m.user_id = ?2
      LIMIT 1
      `,
    )
    .bind(id, userId)
    .first();

  return toConversationRecord(row);
};

export const upsertConversation = async (db: D1Database, payload: ConversationPayload) => {
  const messages = payload.messages ?? [];
  const searchBody = messages.filter(isMessage).map(getChatHistoryText).join('\n');

  await db.batch([
    db
      .prepare(
        `
      INSERT INTO conversation_metas(user_id, id, title, model, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(user_id, id) DO UPDATE SET
        title = excluded.title,
        model = excluded.model,
        updated_at = excluded.updated_at
      `,
      )
      .bind(
        payload.user_id,
        payload.id,
        payload.title,
        payload.model ?? null,
        payload.created_at,
        payload.updated_at,
      ),
    db
      .prepare(
        `
      INSERT INTO conversation_bodies(user_id, id, messages_json)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id, id) DO UPDATE SET
        messages_json = excluded.messages_json
      `,
      )
      .bind(payload.user_id, payload.id, JSON.stringify(messages)),
    db
      .prepare('DELETE FROM conversation_search_fts WHERE user_id = ?1 AND conversation_id = ?2')
      .bind(payload.user_id, payload.id),
    db
      .prepare(
        'INSERT INTO conversation_search_fts(user_id, conversation_id, title, body) VALUES (?1, ?2, ?3, ?4)',
      )
      .bind(payload.user_id, payload.id, payload.title ?? '', searchBody),
  ]);

  return { ok: true };
};

// 从指定消息沿 parentId 走到根，把这条链重建成线性新树，存为新会话。
export const branchConversation = async (
  db: D1Database,
  input: { userId: string; id: string; messageId: number },
) => {
  const row = await db
    .prepare(
      `
      SELECT m.title, m.model, b.messages_json
      FROM conversation_metas m
      JOIN conversation_bodies b ON b.user_id = m.user_id AND b.id = m.id
      WHERE m.id = ?1 AND m.user_id = ?2
      LIMIT 1
      `,
    )
    .bind(input.id, input.userId)
    .first();

  if (!isRecord(row) || typeof row.messages_json !== 'string') {
    throw new Error('Conversation not found');
  }

  const messages = safeParseMessages(row.messages_json).filter(isMessage);

  const chain: Message[] = [];
  let currentId: number | null = input.messageId;
  while (currentId !== null) {
    const message: Message | undefined = messages[currentId - 1];
    if (!message || message.id !== currentId || chain.length > messages.length) {
      throw new Error('Branch point message not found');
    }
    chain.unshift(message);
    currentId = message.parentId;
  }

  const conversationId = crypto.randomUUID();
  const messageIds = new Map(chain.map((message, index) => [message.id, index + 1]));
  const branchedMessages = chain.map((message, index): Message => {
    const fields = {
      id: index + 1,
      parentId: index === 0 ? null : index,
      prevSibling: null,
      nextSibling: null,
      latestChild: index === chain.length - 1 ? null : index + 2,
    };
    if (message.role === 'assistant') return { ...message, ...fields };
    return {
      ...message,
      ...fields,
      blocks: message.blocks.map((block) =>
        block.type === 'quotes'
          ? {
              type: 'quotes',
              quotes: block.quotes.map((quote) => {
                const source = quote.source;
                const messageId =
                  source?.conversationId === input.id
                    ? messageIds.get(source.messageId)
                    : undefined;
                return source && messageId !== undefined
                  ? { ...quote, source: { ...source, conversationId, messageId } }
                  : quote;
              }),
            }
          : block,
      ),
    };
  });
  const title = typeof row.title === 'string' ? row.title : null;
  const model = typeof row.model === 'string' ? row.model : null;
  const now = new Date().toISOString();
  await upsertConversation(db, {
    user_id: input.userId,
    id: conversationId,
    title,
    model,
    messages: branchedMessages,
    created_at: now,
    updated_at: now,
  });

  return { conversationId, title, model, created_at: now };
};

export const deleteConversationById = async (db: D1Database, id: string, userId: string) => {
  await db.batch([
    db
      .prepare('DELETE FROM conversation_search_fts WHERE user_id = ?1 AND conversation_id = ?2')
      .bind(userId, id),
    db.prepare('DELETE FROM conversation_bodies WHERE user_id = ?1 AND id = ?2').bind(userId, id),
    db.prepare('DELETE FROM conversation_metas WHERE user_id = ?1 AND id = ?2').bind(userId, id),
  ]);

  return { ok: true };
};

export const clearConversations = async (db: D1Database, userId: string) => {
  await db.batch([
    db.prepare('DELETE FROM conversation_search_fts WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM conversation_bodies WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM conversation_metas WHERE user_id = ?1').bind(userId),
  ]);

  return { ok: true };
};

export const setConversationPinned = async (
  db: D1Database,
  input: { userId: string; id: string; pinned: boolean },
) => {
  const pinnedAt = input.pinned ? new Date().toISOString() : null;

  await db
    .prepare(
      `
      UPDATE conversation_metas
      SET is_pinned = ?1, pinned_at = ?2
      WHERE user_id = ?3 AND id = ?4
      `,
    )
    .bind(input.pinned ? 1 : 0, pinnedAt, input.userId, input.id)
    .run();

  return { ok: true, pinned_at: pinnedAt };
};

export const updateConversationTitle = async (
  db: D1Database,
  input: { userId: string; id: string; title: string | null },
) => {
  const now = new Date().toISOString();

  const bodyRow = await db
    .prepare('SELECT messages_json FROM conversation_bodies WHERE user_id = ?1 AND id = ?2 LIMIT 1')
    .bind(input.userId, input.id)
    .first();

  const messagesJson =
    isRecord(bodyRow) && typeof bodyRow.messages_json === 'string' ? bodyRow.messages_json : '[]';
  const searchBody = safeParseMessages(messagesJson)
    .filter(isMessage)
    .map(getChatHistoryText)
    .join('\n');

  await db.batch([
    db
      .prepare(
        'UPDATE conversation_metas SET title = ?1, updated_at = ?2 WHERE user_id = ?3 AND id = ?4',
      )
      .bind(input.title, now, input.userId, input.id),
    db
      .prepare('DELETE FROM conversation_search_fts WHERE user_id = ?1 AND conversation_id = ?2')
      .bind(input.userId, input.id),
    db
      .prepare(
        `
        INSERT INTO conversation_search_fts(user_id, conversation_id, title, body)
        SELECT m.user_id, m.id, COALESCE(m.title, ''), ?3
        FROM conversation_metas m
        WHERE m.user_id = ?1 AND m.id = ?2
        `,
      )
      .bind(input.userId, input.id, searchBody),
  ]);

  return { ok: true, updated_at: now };
};
