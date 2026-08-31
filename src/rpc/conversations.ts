import { createServerFn } from '@tanstack/react-start';
import {
  branchConversationSchema,
  conversationIdSchema,
  conversationPayloadSchema,
  listConversationsPageSchema,
  searchConversationsSchema,
  setConversationPinnedSchema,
  updateConversationTitleSchema,
} from '@/schema/conversations';

export type {
  ConversationListCursor,
  ConversationSearchCursor,
} from '@/shared/conversations/conversation';

export const listConversationsPageFn = createServerFn({ method: 'POST' })
  .inputValidator(listConversationsPageSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { listConversationsPage }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/request'),
        import('@/backend/conversations/conversations-db'),
      ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return listConversationsPage(DB, {
      userId: session.user.id,
      limit: data.limit,
      cursor: data.cursor,
    });
  });

export const searchConversationsFn = createServerFn({ method: 'POST' })
  .inputValidator(searchConversationsSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { searchConversations }] = await Promise.all([
      import('@/backend/platform/cloudflare/env'),
      import('@/backend/auth/request'),
      import('@/backend/conversations/conversations-db'),
    ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return searchConversations(DB, {
      userId: session.user.id,
      query: data.query,
      limit: data.limit,
      cursor: data.cursor,
    });
  });

export const getConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationIdSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { getConversationById }] = await Promise.all([
      import('@/backend/platform/cloudflare/env'),
      import('@/backend/auth/request'),
      import('@/backend/conversations/conversations-db'),
    ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return getConversationById(DB, data.id, session.user.id);
  });

export const upsertConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationPayloadSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { upsertConversation }] = await Promise.all([
      import('@/backend/platform/cloudflare/env'),
      import('@/backend/auth/request'),
      import('@/backend/conversations/conversations-db'),
    ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return upsertConversation(DB, {
      ...data,
      user_id: session.user.id,
    });
  });

export const branchConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(branchConversationSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { branchConversation }] = await Promise.all([
      import('@/backend/platform/cloudflare/env'),
      import('@/backend/auth/request'),
      import('@/backend/conversations/conversations-db'),
    ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return branchConversation(DB, {
      userId: session.user.id,
      id: data.id,
      messageId: data.messageId,
    });
  });

export const deleteConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationIdSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { deleteConversationById }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/request'),
        import('@/backend/conversations/conversations-db'),
      ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return deleteConversationById(DB, data.id, session.user.id);
  });

export const clearConversationsFn = createServerFn({ method: 'POST' }).handler(async () => {
  const [{ getServerBindings }, { requireSession }, { clearConversations }] = await Promise.all([
    import('@/backend/platform/cloudflare/env'),
    import('@/backend/auth/request'),
    import('@/backend/conversations/conversations-db'),
  ]);
  const { DB } = getServerBindings();
  const session = await requireSession();

  return clearConversations(DB, session.user.id);
});

export const updateConversationTitleFn = createServerFn({ method: 'POST' })
  .inputValidator(updateConversationTitleSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { updateConversationTitle }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/request'),
        import('@/backend/conversations/conversations-db'),
      ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return updateConversationTitle(DB, {
      userId: session.user.id,
      id: data.id,
      title: data.title,
    });
  });

export const setConversationPinnedFn = createServerFn({ method: 'POST' })
  .inputValidator(setConversationPinnedSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { setConversationPinned }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/request'),
        import('@/backend/conversations/conversations-db'),
      ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    return setConversationPinned(DB, {
      userId: session.user.id,
      id: data.id,
      pinned: data.pinned,
    });
  });
