import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Message } from "@/src/features/chat/types/chat";
import {
  buildCurrentPath,
  createLinearMessages,
  migrateFromOldTree,
} from "@/src/features/chat/lib/tree";
import type { LegacyMessageTree } from "@/src/features/chat/lib/tree";

const DB_NAME = "aether_local";
const DB_VERSION = 4;
const STORE_CONVERSATIONS = "conversations";

export type LocalConversation = {
  id: string;
  title: string | null;
  currentPath: number[];
  messages: Message[];
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  pinned_at?: string;
};

interface AetherDB extends DBSchema {
  conversations: {
    key: string;
    value: LocalConversation;
    indexes: { updated_at: string; pinned_at: string };
  };
  // Legacy store kept in typing so upgrade can safely delete it.
  messages: {
    key: string;
    value: unknown;
  };
}

const supportsIndexedDB =
  typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";

let dbPromise: Promise<IDBPDatabase<AetherDB>> | null = null;

const openDatabase = async (): Promise<IDBPDatabase<AetherDB>> => {
  if (!supportsIndexedDB) {
    throw new Error("IndexedDB is not available in this environment");
  }

  if (!dbPromise) {
    dbPromise = openDB<AetherDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains("messages")) {
            db.deleteObjectStore("messages");
          }
          if (db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
            db.deleteObjectStore(STORE_CONVERSATIONS);
          }
          const store = db.createObjectStore(STORE_CONVERSATIONS, {
            keyPath: "id",
          });
          store.createIndex("updated_at", "updated_at");
          store.createIndex("pinned_at", "pinned_at");
        }
        if (oldVersion < 3) {
          const store = transaction?.objectStore(STORE_CONVERSATIONS);
          if (store && !store.indexNames.contains("pinned_at")) {
            store.createIndex("pinned_at", "pinned_at");
          }
        }
      },
    });
  }

  return dbPromise;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLegacyTree = (value: unknown): value is LegacyMessageTree => {
  if (!isRecord(value)) {
    return false;
  }
  return isRecord(value.nodes) && Array.isArray(value.rootIds);
};

const isMessage = (value: unknown): value is Message => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "number" && typeof value.role === "string";
};

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

const areNumberArraysEqual = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

type LinearMessageInput = {
  role: "user" | "assistant";
  blocks: Message["blocks"];
  createdAt?: string;
};

const toLinearMessageInput = (value: unknown): LinearMessageInput | null => {
  if (!isRecord(value)) {
    return null;
  }
  const role = value.role;
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const blocks = Array.isArray(value.blocks) ? (value.blocks as Message["blocks"]) : [];
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : undefined;
  return { role, blocks, createdAt };
};

const normalizeConversation = async (
  db: IDBPDatabase<AetherDB>,
  conversation: LocalConversation | undefined
): Promise<LocalConversation | undefined> => {
  if (!conversation) {
    return undefined;
  }

  const legacyTree = (conversation as { messageTree?: unknown }).messageTree;
  if (legacyTree && isLegacyTree(legacyTree)) {
    const migrated = migrateFromOldTree(legacyTree);
    const nextConversation: LocalConversation = {
      id: conversation.id,
      title: conversation.title ?? null,
      currentPath: migrated.currentPath,
      messages: migrated.messages,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      pinned: conversation.pinned,
      pinned_at: conversation.pinned_at,
    };
    await db.put(STORE_CONVERSATIONS, nextConversation);
    return nextConversation;
  }

  const rawMessages = (conversation as { messages?: unknown }).messages;
  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    if (!rawMessages.every(isMessage)) {
      const linearInputs = rawMessages
        .map(toLinearMessageInput)
        .filter((item): item is LinearMessageInput => !!item);
      const linearState = createLinearMessages(linearInputs);
      const nextConversation: LocalConversation = {
        id: conversation.id,
        title: conversation.title ?? null,
        currentPath: linearState.currentPath,
        messages: linearState.messages,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        pinned: conversation.pinned,
        pinned_at: conversation.pinned_at,
      };
      await db.put(STORE_CONVERSATIONS, nextConversation);
      return nextConversation;
    }
  }

  const messages = Array.isArray(rawMessages) && rawMessages.every(isMessage)
    ? (rawMessages as Message[])
    : [];
  const rawCurrentPath = (conversation as { currentPath?: unknown }).currentPath;
  const hasCurrentPath = isNumberArray(rawCurrentPath);
  const storedCurrentPath = hasCurrentPath ? rawCurrentPath : [];
  let currentPath = storedCurrentPath;

  if (!hasCurrentPath) {
    const rawLatestRootId = (conversation as { latestRootId?: unknown })
      .latestRootId;
    const latestRootId =
      typeof rawLatestRootId === "number"
        ? rawLatestRootId
        : messages.length > 0
        ? messages[0].id
        : null;
    currentPath = buildCurrentPath(messages, latestRootId);
  }

  if (
    !hasCurrentPath ||
    !areNumberArraysEqual(currentPath, storedCurrentPath) ||
    messages !== conversation.messages
  ) {
    const nextConversation: LocalConversation = {
      id: conversation.id,
      title: conversation.title ?? null,
      currentPath,
      messages,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      pinned: conversation.pinned,
      pinned_at: conversation.pinned_at,
    };
    await db.put(STORE_CONVERSATIONS, nextConversation);
    return nextConversation;
  }

  return conversation;
};

export const localDB = {
  async getAll(): Promise<LocalConversation[]> {
    if (!supportsIndexedDB) {
      return [];
    }

    const db = await openDatabase();
    const all = await db.getAll(STORE_CONVERSATIONS);
    const migrated = await Promise.all(
      all.map((conversation) => normalizeConversation(db, conversation))
    );
    const resolved = migrated.filter(
      (conversation): conversation is LocalConversation => !!conversation
    );
    return resolved.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async get(id: string): Promise<LocalConversation | undefined> {
    if (!supportsIndexedDB) {
      return undefined;
    }

    const db = await openDatabase();
    const conversation = await db.get(STORE_CONVERSATIONS, id);
    return normalizeConversation(db, conversation);
  },

  async save(conversation: LocalConversation): Promise<void> {
    if (!supportsIndexedDB) {
      return;
    }

    const db = await openDatabase();
    await db.put(STORE_CONVERSATIONS, conversation);
  },

  async delete(id: string): Promise<void> {
    if (!supportsIndexedDB) {
      return;
    }

    const db = await openDatabase();
    await db.delete(STORE_CONVERSATIONS, id);
  },

  async clear(): Promise<void> {
    if (!supportsIndexedDB) {
      return;
    }

    const db = await openDatabase();
    await db.clear(STORE_CONVERSATIONS);
  },
};
