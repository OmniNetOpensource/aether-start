import { createServerFn } from '@tanstack/react-start';

export const getForYouSuggestionsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ getServerBindings }, { requireSession }] = await Promise.all([
    import('@/shared/worker/env.server'),
    import('@/features/auth/session/request.server'),
  ]);
  const { DB } = getServerBindings();
  const session = await requireSession();

  const row = await DB.prepare(
    'SELECT suggestions_json FROM for_you_suggestions WHERE user_id = ?1 LIMIT 1',
  )
    .bind(session.user.id)
    .first();

  if (
    !row ||
    typeof row !== 'object' ||
    !('suggestions_json' in row) ||
    typeof row.suggestions_json !== 'string'
  ) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(row.suggestions_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
});
