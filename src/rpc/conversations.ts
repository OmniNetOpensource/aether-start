import { createServerFn } from '@tanstack/solid-start';
import {
  conversationIdSchema,
  conversationPayloadSchema,
  listConversationsPageSchema,
  searchConversationsSchema,
  setConversationPinnedSchema,
  updateConversationTitleSchema,
} from '@/schema/conversations';

export type ConversationListCursor = {
  is_pinned: 0 | 1;
  sort_at: string;
  updated_at: string;
  id: string;
} | null;

export type ConversationSearchCursor = {
  updated_at: string;
  id: string;
} | null;

export const listConversationsPageFn = createServerFn({ method: 'POST' })
  .validator(listConversationsPageSchema)
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
  .validator(searchConversationsSchema)
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
  .validator(conversationIdSchema)
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
  .validator(conversationPayloadSchema)
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

export const deleteConversationFn = createServerFn({ method: 'POST' })
  .validator(conversationIdSchema)
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
  .validator(updateConversationTitleSchema)
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
  .validator(setConversationPinnedSchema)
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
