import { isMessage, type Message } from '@/shared/chat/message';
import type {
  ConversationListCursor,
  ConversationSearchCursor,
} from '@/shared/conversations/conversation';

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

export type ConversationSearchMode = 'fts' | 'contains';

export type ConversationSearchItem = {
  user_id: string;
  id: string;
  title: string | null;
  model: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  matchedIn: 'title' | 'content';
  excerpt: string;
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

export const normalizeSearchQuery = (query: string) => query.trim().replace(/\s+/g, ' ');

export const containsCjk = (query: string) =>
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(query);

const tokenizeSearchTerms = (query: string) =>
  normalizeSearchQuery(query)
    .split(' ')
    .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase())
    .filter((part) => part.length > 0);

export const buildFtsQuery = (query: string) => {
  const terms = tokenizeSearchTerms(query);
  if (terms.length === 0) {
    return '';
  }

  return terms.map((term) => `${term}*`).join(' AND ');
};

export const extractSearchText = (messages: object[]) => {
  const chunks: string[] = [];

  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.blocks)) {
      continue;
    }

    for (const block of message.blocks) {
      if (!isRecord(block) || typeof block.type !== 'string') {
        continue;
      }

      if (block.type === 'content' && typeof block.content === 'string') {
        const content = block.content.trim();
        if (content) {
          chunks.push(content);
        }
        continue;
      }

      if (block.type === 'quotes' && Array.isArray(block.quotes)) {
        for (const q of block.quotes) {
          if (isRecord(q) && typeof q.text === 'string') {
            const text = (q.text as string).trim();
            if (text) {
              chunks.push(text);
            }
          }
        }
        continue;
      }

      if (block.type === 'error' && typeof block.message === 'string') {
        const messageText = block.message.trim();
        if (messageText) {
          chunks.push(messageText);
        }
      }
    }
  }

  return chunks.join('\n');
};

export const buildExcerpt = (text: string, query: string) => {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return '';
  }

  const minLength = 120;
  const maxLength = 136;
  const normalizedQuery = normalizeSearchQuery(query).toLowerCase();
  const lowerText = normalizedText.toLowerCase();

  let hitIndex = normalizedQuery ? lowerText.indexOf(normalizedQuery) : -1;

  if (hitIndex < 0) {
    const terms = normalizedQuery.split(' ').filter(Boolean);
    for (const term of terms) {
      const termIndex = lowerText.indexOf(term);
      if (termIndex >= 0) {
        hitIndex = termIndex;
        break;
      }
    }
  }

  if (hitIndex < 0) {
    return normalizedText.length > maxLength
      ? `${normalizedText.slice(0, maxLength).trimEnd()}...`
      : normalizedText;
  }

  let start = Math.max(0, hitIndex - 48);
  let end = Math.min(normalizedText.length, start + maxLength);

  if (end - start < minLength && start > 0) {
    start = Math.max(0, end - minLength);
  }

  if (end < normalizedText.length && end - start < minLength) {
    end = Math.min(normalizedText.length, start + minLength);
  }

  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedText.length ? '...' : '';

  return `${prefix}${normalizedText.slice(start, end).trim()}${suffix}`;
};

const isQueryMatchInTitle = (title: string | null, query: string) => {
  if (!title) {
    return false;
  }

  const normalizedQuery = normalizeSearchQuery(query).toLowerCase();
  if (!normalizedQuery) {
    return false;
  }

  const normalizedTitle = title.toLowerCase();

  if (containsCjk(normalizedQuery)) {
    return normalizedTitle.includes(normalizedQuery);
  }

  const terms = tokenizeSearchTerms(normalizedQuery);
  if (terms.length === 0) {
    return normalizedTitle.includes(normalizedQuery);
  }

  return terms.every((term) => normalizedTitle.includes(term));
};

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

const toConversationSearchItem = (row: unknown, query: string): ConversationSearchItem | null => {
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
  const bodyText = typeof row.body_text === 'string' ? row.body_text : '';

  const explicitMatch =
    row.matched_in === 'title' || row.matched_in === 'content' ? row.matched_in : null;
  const matchedIn = explicitMatch ?? (isQueryMatchInTitle(title, query) ? 'title' : 'content');
  const excerptBase = matchedIn === 'title' ? (title ?? '') : bodyText;
  const excerpt = buildExcerpt(excerptBase || title || bodyText, query);

  return {
    user_id: row.user_id,
    id: row.id,
    title,
    model,
    is_pinned: isPinned,
    pinned_at: pinnedAt,
    created_at: createdAt,
    updated_at: updatedAt,
    matchedIn,
    excerpt,
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

export const searchConversations = async (
  db: D1Database,
  input: {
    userId: string;
    query: string;
    limit: number;
    cursor: ConversationSearchCursor;
  },
) => {
  const normalizedQuery = normalizeSearchQuery(input.query);
  const mode: ConversationSearchMode = containsCjk(normalizedQuery) ? 'contains' : 'fts';

  if (!normalizedQuery) {
    return {
      items: [],
      nextCursor: null,
      mode,
    };
  }

  let rows: D1Result<Record<string, unknown>> | D1Result<unknown>;

  if (mode === 'fts') {
    const ftsQuery = buildFtsQuery(normalizedQuery);
    if (!ftsQuery) {
      return {
        items: [],
        nextCursor: null,
        mode,
      };
    }

    rows = input.cursor
      ? await db
          .prepare(
            `
            SELECT
              m.user_id,
              m.id,
              m.title,
              m.model,
              m.is_pinned,
              m.pinned_at,
              m.created_at,
              m.updated_at,
              COALESCE(conversation_search_fts.body, '') AS body_text
            FROM conversation_search_fts
            JOIN conversation_metas m
              ON m.user_id = conversation_search_fts.user_id
             AND m.id = conversation_search_fts.conversation_id
            WHERE conversation_search_fts.user_id = ?1
              AND conversation_search_fts MATCH ?2
              AND ((m.updated_at < ?3) OR (m.updated_at = ?3 AND m.id < ?4))
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT ?5
            `,
          )
          .bind(input.userId, ftsQuery, input.cursor.updated_at, input.cursor.id, input.limit)
          .all()
      : await db
          .prepare(
            `
            SELECT
              m.user_id,
              m.id,
              m.title,
              m.model,
              m.is_pinned,
              m.pinned_at,
              m.created_at,
              m.updated_at,
              COALESCE(conversation_search_fts.body, '') AS body_text
            FROM conversation_search_fts
            JOIN conversation_metas m
              ON m.user_id = conversation_search_fts.user_id
             AND m.id = conversation_search_fts.conversation_id
            WHERE conversation_search_fts.user_id = ?1
              AND conversation_search_fts MATCH ?2
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT ?3
            `,
          )
          .bind(input.userId, ftsQuery, input.limit)
          .all();
  } else {
    const containsQuery = normalizedQuery.toLowerCase();

    rows = input.cursor
      ? await db
          .prepare(
            `
            SELECT
              m.user_id,
              m.id,
              m.title,
              m.model,
              m.is_pinned,
              m.pinned_at,
              m.created_at,
              m.updated_at,
              COALESCE(s.body, '') AS body_text,
              CASE
                WHEN instr(lower(COALESCE(m.title, '')), ?2) > 0 THEN 'title'
                ELSE 'content'
              END AS matched_in
            FROM conversation_metas m
            LEFT JOIN conversation_search_fts s
              ON s.user_id = m.user_id
             AND s.conversation_id = m.id
            WHERE m.user_id = ?1
              AND (
                instr(lower(COALESCE(m.title, '')), ?2) > 0
                OR instr(lower(COALESCE(s.body, '')), ?2) > 0
              )
              AND ((m.updated_at < ?3) OR (m.updated_at = ?3 AND m.id < ?4))
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT ?5
            `,
          )
          .bind(input.userId, containsQuery, input.cursor.updated_at, input.cursor.id, input.limit)
          .all()
      : await db
          .prepare(
            `
            SELECT
              m.user_id,
              m.id,
              m.title,
              m.model,
              m.is_pinned,
              m.pinned_at,
              m.created_at,
              m.updated_at,
              COALESCE(s.body, '') AS body_text,
              CASE
                WHEN instr(lower(COALESCE(m.title, '')), ?2) > 0 THEN 'title'
                ELSE 'content'
              END AS matched_in
            FROM conversation_metas m
            LEFT JOIN conversation_search_fts s
              ON s.user_id = m.user_id
             AND s.conversation_id = m.id
            WHERE m.user_id = ?1
              AND (
                instr(lower(COALESCE(m.title, '')), ?2) > 0
                OR instr(lower(COALESCE(s.body, '')), ?2) > 0
              )
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT ?3
            `,
          )
          .bind(input.userId, containsQuery, input.limit)
          .all();
  }

  const mapped = Array.isArray(rows.results)
    ? rows.results
        .map((row) => toConversationSearchItem(row, normalizedQuery))
        .filter((row): row is ConversationSearchItem => !!row)
    : [];

  const last = mapped.at(-1);
  const nextCursor: ConversationSearchCursor =
    mapped.length === input.limit && last ? { updated_at: last.updated_at, id: last.id } : null;

  return {
    items: mapped,
    nextCursor,
    mode,
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
  const searchBody = extractSearchText(messages);

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

  const branchedMessages = chain.map((message, index) => ({
    ...message,
    id: index + 1,
    parentId: index === 0 ? null : index,
    prevSibling: null,
    nextSibling: null,
    latestChild: index === chain.length - 1 ? null : index + 2,
  }));

  const conversationId = crypto.randomUUID();
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
  const searchBody = extractSearchText(safeParseMessages(messagesJson));

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
