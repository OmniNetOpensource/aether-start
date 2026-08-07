import type { Message } from '@/shared/chat/message';

/** 快照经 JSON 存库和 RPC 传输，值必须是纯 JSON，不能是 unknown */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SharedResearchItem =
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool';
      data: {
        call: { tool: string; args: Record<string, JsonValue> };
        result?: { result: string };
      };
    };

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 校验存库 JSON 里的 research item，形状不合法的丢弃 */
export const toSharedResearchItem = (value: unknown): SharedResearchItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === 'thinking' && typeof value.text === 'string') {
    return { kind: 'thinking', text: value.text };
  }

  if (value.kind === 'tool' && isRecord(value.data)) {
    const call = value.data.call;
    if (!isRecord(call) || typeof call.tool !== 'string') {
      return null;
    }
    const args: Record<string, JsonValue> = {};
    if (isRecord(call.args)) {
      for (const [key, argValue] of Object.entries(call.args)) {
        if (isJsonValue(argValue)) {
          args[key] = argValue;
        }
      }
    }
    const result = value.data.result;
    return {
      kind: 'tool',
      data: {
        call: { tool: call.tool, args },
        ...(isRecord(result) && typeof result.result === 'string'
          ? { result: { result: result.result } }
          : {}),
      },
    };
  }

  return null;
};

export type SharedAttachmentSnapshot = {
  id: string;
  kind: 'image';
  name: string;
  size: number;
  mimeType: string;
  url: string;
  storageKey?: string;
};

export type SharedQuoteItem = { id: string; text: string };

export type SharedUserBlock =
  | { type: 'content'; content: string }
  | { type: 'quotes'; quotes: SharedQuoteItem[] }
  | { type: 'attachments'; attachments: SharedAttachmentSnapshot[] };

export type SharedAssistantBlock =
  | { type: 'content'; content: string }
  | { type: 'research'; items: SharedResearchItem[] }
  | { type: 'error'; message: string };

export type SharedMessageBlock = SharedUserBlock | SharedAssistantBlock;

export type SharedMessageSnapshot = {
  id: number;
  role: Message['role'];
  createdAt: string;
  completedAt: string | null;
  blocks: SharedMessageBlock[];
};

export type SharedConversationSnapshot = {
  version: 1;
  messages: SharedMessageSnapshot[];
};

export type PublicSharedAttachment = Omit<SharedAttachmentSnapshot, 'storageKey'>;

export type PublicSharedQuoteItem = { id: string; text: string };

export type PublicSharedMessageBlock =
  | { type: 'content'; content: string }
  | { type: 'quotes'; quotes: PublicSharedQuoteItem[] }
  | { type: 'attachments'; attachments: PublicSharedAttachment[] }
  | { type: 'research'; items: SharedResearchItem[] }
  | { type: 'error'; message: string };

export type PublicSharedMessage = {
  id: number;
  role: Message['role'];
  createdAt: string;
  completedAt: string | null;
  blocks: PublicSharedMessageBlock[];
};

export type PublicSharedConversationSnapshot = {
  version: 1;
  messages: PublicSharedMessage[];
};

export type PublicShareStatus = 'active' | 'revoked' | 'not_found';

export type PublicShareView =
  | {
      status: 'not_found';
    }
  | {
      status: 'revoked';
      token: string;
      title: string | null;
    }
  | {
      status: 'active';
      token: string;
      title: string | null;
      snapshot: PublicSharedConversationSnapshot;
    };

export type ConversationShareStatus = 'not_shared' | 'active' | 'revoked';
