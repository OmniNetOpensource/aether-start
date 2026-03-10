import type {
  BranchInfo,
  ContentBlock,
  Message,
  ResearchItem,
} from "@/types/message";

export type LegacyMessageNode = {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  parentId: string | null;
  children: string[];
  createdAt: string;
};

export type LegacyMessageTree = {
  nodes: Record<string, LegacyMessageNode>;
  rootIds: string[];
  currentPath?: string[];
};

type MessageState = {
  messages: Message[];
  currentPath: number[];
  latestRootId: number | null;
  nextId: number;
};

type LinearMessageInput = {
  role: Message["role"];
  blocks: ContentBlock[];
  createdAt?: string;
};

export const cloneResearchItem = (item: ResearchItem): ResearchItem => {
  if (item.kind === "thinking") {
    return { ...item };
  }

  return {
    kind: "tool",
    data: {
      call: {
        tool: item.data.call.tool,
        args: { ...item.data.call.args },
      },
      progress: item.data.progress
        ? item.data.progress.map((entry) => ({ ...entry }))
        : undefined,
      result: item.data.result ? { ...item.data.result } : undefined,
    },
  };
};

export const cloneBlocks = (blocks: ContentBlock[]): ContentBlock[] =>
  blocks.map((block) => {
    if (block.type === "research") {
      return {
        ...block,
        items: block.items.map((item) => cloneResearchItem(item)),
      };
    }
    if (block.type === "attachments") {
      return {
        ...block,
        attachments: block.attachments.map((attachment) => ({ ...attachment })),
      };
    }
    return { ...block };
  });

export const createEmptyMessageState = (): MessageState => ({
  messages: [],
  currentPath: [],
  latestRootId: null,
  nextId: 1,
});

const updateMessage = (
  messages: Message[],
  messageId: number,
  updater: (message: Message) => Record<string, unknown>
) => {
  const index = messageId - 1;
  const current = messages[index];
  if (!current) {
    return;
  }
  messages[index] = updater(current) as Message;
};

export const buildCurrentPath = (
  messages: Message[],
  latestRootId: number | null
): number[] => {
  const path: number[] = [];
  let currentId = latestRootId;

  while (currentId !== null) {
    const current = messages[currentId - 1];
    if (!current) {
      break;
    }
    path.push(currentId);
    currentId = current.latestChild;
  }

  return path;
};

export const computeMessagesFromPath = (
  messages: Message[],
  currentPath: number[]
): Message[] =>
  currentPath
    .map((id) => messages[id - 1])
    .filter((message): message is Message => !!message);

export const addMessage = (
  state: MessageState,
  role: Message["role"],
  blocks: ContentBlock[],
  createdAt = new Date().toISOString()
): MessageState & { addedMessage: Message } => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const parentId = currentPath[currentPath.length - 1] ?? null;
  const id = nextId;

  const nextMessages = [...messages];

  const newMessage = {
    id,
    role,
    blocks,
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
    createdAt,
  } as Message;

  if (parentId !== null) {
    const parent = nextMessages[parentId - 1];
    if (parent) {
      if (parent.latestChild !== null) {
        const prevSibling = nextMessages[parent.latestChild - 1];
        if (prevSibling) {
          updateMessage(nextMessages, prevSibling.id, (message) => ({
            ...message,
            nextSibling: id,
          }));
          newMessage.prevSibling = prevSibling.id;
        }
      }
      updateMessage(nextMessages, parentId, (message) => ({
        ...message,
        latestChild: id,
      }));
    }
  } else {
    if (latestRootId !== null) {
      const prevSibling = nextMessages[latestRootId - 1];
      if (prevSibling) {
        updateMessage(nextMessages, prevSibling.id, (message) => ({
          ...message,
          nextSibling: id,
        }));
        newMessage.prevSibling = prevSibling.id;
      }
    }
  }

  nextMessages.push(newMessage);

  return {
    messages: nextMessages,
    currentPath: [...currentPath, id],
    latestRootId: parentId === null ? id : latestRootId,
    nextId: id + 1,
    addedMessage: newMessage,
  };
};

export const switchBranch = (
  state: MessageState,
  depth: number,
  newNodeId: number
): MessageState => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const target = messages[newNodeId - 1];
  if (!target) {
    return state;
  }

  const nextMessages = [...messages];
  const prefix = depth > 1 ? currentPath.slice(0, depth - 1) : [];
  const nextPath = [...prefix, newNodeId];

  let current = target;
  while (current.latestChild !== null) {
    nextPath.push(current.latestChild);
    const next = nextMessages[current.latestChild - 1];
    if (!next) {
      break;
    }
    current = next;
  }

  let nextLatestRootId = latestRootId;
  if (depth > 1) {
    const parentId = nextPath[depth - 2];
    if (parentId) {
      updateMessage(nextMessages, parentId, (message) => ({
        ...message,
        latestChild: newNodeId,
      }));
    }
  } else {
    nextLatestRootId = newNodeId;
  }

  return {
    messages: nextMessages,
    currentPath: nextPath,
    latestRootId: nextLatestRootId,
    nextId,
  };
};

export const getBranchInfo = (
  messages: Message[],
  messageId: number
): BranchInfo | null => {
  const msg = messages[messageId - 1];
  if (!msg) {
    return null;
  }

  const siblings: number[] = [];

  let leftId = msg.prevSibling;
  while (leftId !== null) {
    siblings.unshift(leftId);
    leftId = messages[leftId - 1]?.prevSibling ?? null;
  }

  siblings.push(messageId);

  let rightId = msg.nextSibling;
  while (rightId !== null) {
    siblings.push(rightId);
    rightId = messages[rightId - 1]?.nextSibling ?? null;
  }

  if (siblings.length <= 1) {
    return null;
  }

  return {
    currentIndex: siblings.indexOf(messageId),
    total: siblings.length,
    siblingIds: siblings,
  };
};

export const editMessage = (
  state: MessageState,
  depth: number,
  messageId: number,
  newBlocks: ContentBlock[]
): (MessageState & { addedMessage: Message }) | null => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const target = messages[messageId - 1];
  if (!target) {
    return null;
  }

  const id = nextId;
  const newMessage = {
    id,
    role: target.role,
    blocks: newBlocks,
    prevSibling: messageId,
    nextSibling: target.nextSibling,
    latestChild: null,
    createdAt: new Date().toISOString(),
  } as Message;

  const nextMessages = [...messages];

  if (target.nextSibling !== null) {
    updateMessage(nextMessages, target.nextSibling, (message) => ({
      ...message,
      prevSibling: id,
    }));
  }

  updateMessage(nextMessages, messageId, (message) => ({
    ...message,
    nextSibling: id,
  }));

  nextMessages.push(newMessage);

  const switched = switchBranch(
    {
      messages: nextMessages,
      currentPath,
      latestRootId,
      nextId: id + 1,
    },
    depth,
    id
  );

  return {
    ...switched,
    nextId: id + 1,
    addedMessage: newMessage,
  };
};

export const createLinearMessages = (
  items: LinearMessageInput[]
): MessageState => {
  if (items.length === 0) {
    return createEmptyMessageState();
  }

  const messages: Message[] = [];
  const currentPath: number[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const id = index + 1;
    const item = items[index];
    const createdAt = item.createdAt ?? new Date().toISOString();

    messages.push({
      id,
      role: item.role,
      blocks: cloneBlocks(item.blocks ?? []),
      prevSibling: null,
      nextSibling: null,
      latestChild: index < items.length - 1 ? id + 1 : null,
      createdAt,
    } as Message);
    currentPath.push(id);
  }

  return {
    messages,
    currentPath,
    latestRootId: messages.length > 0 ? messages[0].id : null,
    nextId: messages.length + 1,
  };
};

const parseTimestamp = (value: string | undefined) => {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const migrateFromOldTree = (tree: LegacyMessageTree): MessageState => {
  const nodes = Object.values(tree.nodes ?? {});
  if (nodes.length === 0) {
    return createEmptyMessageState();
  }

  const sortedNodes = [...nodes].sort(
    (a, b) => parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt)
  );

  const idMap = new Map<string, number>();
  let nextId = 1;

  for (const node of sortedNodes) {
    idMap.set(node.id, nextId);
    nextId += 1;
  }

  const messages: Message[] = [];

  for (const node of sortedNodes) {
    const newId = idMap.get(node.id);
    if (!newId) {
      continue;
    }

    const siblings = node.parentId
      ? tree.nodes?.[node.parentId]?.children ?? []
      : tree.rootIds ?? [];
    const siblingIndex = siblings.indexOf(node.id);

    messages.push({
      id: newId,
      role: node.role,
      blocks: cloneBlocks(node.blocks ?? []),
      prevSibling:
        siblingIndex > 0 ? idMap.get(siblings[siblingIndex - 1]) ?? null : null,
      nextSibling:
        siblingIndex < siblings.length - 1
          ? idMap.get(siblings[siblingIndex + 1]) ?? null
          : null,
      latestChild:
        node.children?.length > 0
          ? idMap.get(node.children[node.children.length - 1]) ?? null
          : null,
      createdAt: node.createdAt ?? new Date().toISOString(),
    } as Message);
  }

  messages.sort((a, b) => a.id - b.id);

  const legacyPath = tree.currentPath ?? [];
  const normalizedLegacyPath: string[] = [];

  for (const id of legacyPath) {
    const node = tree.nodes?.[id];
    if (!node) {
      break;
    }

    if (normalizedLegacyPath.length === 0) {
      const isRoot = node.parentId === null || tree.rootIds?.includes(id);
      if (!isRoot) {
        break;
      }
    } else {
      const prevId = normalizedLegacyPath[normalizedLegacyPath.length - 1];
      const prevNode = tree.nodes?.[prevId];
      if (!prevNode?.children?.includes(id)) {
        break;
      }
    }

    normalizedLegacyPath.push(id);
  }

  const mappedPath = normalizedLegacyPath
    .map((id) => idMap.get(id) ?? null)
    .filter((id): id is number => id !== null);
  const hasMappedPath = mappedPath.length > 0;

  const latestRootId = hasMappedPath
    ? mappedPath[0]
    : tree.rootIds?.length > 0
      ? idMap.get(tree.rootIds[tree.rootIds.length - 1]) ?? null
      : null;

  if (hasMappedPath) {
    for (let index = 0; index < mappedPath.length; index += 1) {
      const messageId = mappedPath[index];
      const nextId =
        index < mappedPath.length - 1 ? mappedPath[index + 1] : null;
      updateMessage(messages, messageId, (message) => ({
        ...message,
        latestChild: nextId,
      }));
    }
  }

  return {
    messages,
    currentPath: hasMappedPath
      ? mappedPath
      : buildCurrentPath(messages, latestRootId),
    latestRootId,
    nextId: messages.length + 1,
  };
};
