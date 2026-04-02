import { createServerFn } from '@tanstack/react-start';
import { getModelConfig, TITLE_GENERATION_MODEL_ID } from '@/features/chat/model-catalog';
import { getBackendConfig, log } from '@/features/chat/agent-runtime';

const FOR_YOU_TIMEOUT_MS = 60_000;
const RECENT_TITLE_LIMIT = 20;

const FOR_YOU_PROMPT = `You are a brilliant research assistant. Given the user's recent chat topics, suggest exactly 5 conversation starters they'd genuinely want to explore next.

Rules:
- Each suggestion must be a specific, concrete question or deep-dive topic — not a broad category.
- Reference particular techniques, concepts, trade-offs, or real-world scenarios related to the topics.
- Surprise the user: connect ideas across topics, surface non-obvious angles, or suggest something they haven't tried yet.
- Each line must be one suggestion only, no numbering, no quotes, max 50 characters.
- Use the same language as the topics.

Topics:
`;

function parseSuggestionLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
}

async function callLlmForSuggestions(titles: string[]): Promise<string[]> {
  const modelConfig = getModelConfig(TITLE_GENERATION_MODEL_ID);
  if (!modelConfig) return [];

  let backendConfig: ReturnType<typeof getBackendConfig>;
  try {
    backendConfig = getBackendConfig(modelConfig.backend);
  } catch {
    return [];
  }

  const prompt = `${FOR_YOU_PROMPT}${titles.map((title) => `- ${title}`).join('\n')}`;
  const signal = AbortSignal.timeout(FOR_YOU_TIMEOUT_MS);

  const requestLog = {
    modelId: modelConfig.id,
    model: modelConfig.model,
    backend: modelConfig.backend,
    prompt,
  };

  try {
    if (modelConfig.format === 'anthropic') {
      log('FOR_YOU', 'Sending for-you suggestion request', requestLog);

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({
        apiKey: backendConfig.apiKey,
        baseURL: backendConfig.baseURL,
        defaultHeaders: backendConfig.defaultHeaders,
      });

      const message = await client.messages.create(
        {
          model: modelConfig.model,
          max_tokens: 256,
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal },
      );

      const textBlock = message.content.find((block) => block.type === 'text');
      const raw = textBlock && 'text' in textBlock ? String(textBlock.text).trim() : '';
      const lines = parseSuggestionLines(raw);

      log('FOR_YOU', 'Received for-you suggestion response', { ...requestLog, lines });
      return lines;
    }

    log('FOR_YOU', 'Sending for-you suggestion request', requestLog);

    const { getOpenAIClient } = await import('@/features/chat/agent-runtime/backends/openai');
    const client = getOpenAIClient(backendConfig);
    const openrouterExtra =
      modelConfig.backend === 'openrouter' ? { reasoning: { effort: 'none' } } : {};
    const response = await client.chat.completions.create(
      {
        model: modelConfig.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
        temperature: 0.7,
        ...openrouterExtra,
      },
      { signal },
    );

    const raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    const lines = parseSuggestionLines(raw);

    log('FOR_YOU', 'Received for-you suggestion response', { ...requestLog, lines });
    return lines;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('FOR_YOU', 'For-you suggestion generation failed', { error: message });
    return [];
  }
}

export async function generateAndPersistForYouSuggestions(
  db: D1Database,
  userId: string,
): Promise<void> {
  const rows = await db
    .prepare(
      `
      SELECT title
      FROM conversation_metas
      WHERE user_id = ?1
        AND title IS NOT NULL
        AND title != ''
        AND title != 'New Chat'
      ORDER BY updated_at DESC
      LIMIT ?2
      `,
    )
    .bind(userId, RECENT_TITLE_LIMIT)
    .all();

  const titles: string[] = [];
  if (Array.isArray(rows.results)) {
    for (const row of rows.results) {
      if (row && typeof row === 'object' && 'title' in row && typeof row.title === 'string') {
        const trimmed = row.title.trim();
        if (trimmed) {
          titles.push(trimmed);
        }
      }
    }
  }

  if (titles.length === 0) {
    return;
  }

  const lines = await callLlmForSuggestions(titles);
  if (lines.length === 0) {
    return;
  }

  await db
    .prepare(
      `
      INSERT INTO for_you_suggestions (user_id, suggestions_json, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id) DO UPDATE SET
        suggestions_json = excluded.suggestions_json,
        updated_at = excluded.updated_at
      `,
    )
    .bind(userId, JSON.stringify(lines), new Date().toISOString())
    .run();
}

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
