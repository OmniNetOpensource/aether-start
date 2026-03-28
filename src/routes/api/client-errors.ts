import { createFileRoute } from '@tanstack/react-router';
import { getSessionFromRequest } from '@/features/auth/session';
import { getServerBindings } from '@/shared/worker/env';

const KINDS = new Set(['react-boundary', 'window-error', 'unhandledrejection']);

const MESSAGE_MAX = 4096;
const LONG_MAX = 65536;
const NAME_MAX = 256;
const PAGE_URL_MAX = 8192;
const SOURCE_MAX = 2048;

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : value.slice(0, max);

const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readOptionalString = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const t = truncate(value, LONG_MAX);
  return t.length > 0 ? t : null;
};

const readOptionalInt = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
};

const serializeDetailJson = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return truncate(JSON.stringify(value), LONG_MAX);
  } catch {
    return truncate(String(value), LONG_MAX);
  }
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const Route = createFileRoute('/api/client-errors')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: async ({ request }) => {
          let parsed: unknown;
          try {
            parsed = await request.json();
          } catch {
            return new Response(null, { status: 400 });
          }

          if (!isJsonObject(parsed)) {
            return new Response(null, { status: 400 });
          }

          const record = parsed;
          const kindRaw = record.kind;
          if (typeof kindRaw !== 'string' || !KINDS.has(kindRaw)) {
            return new Response(null, { status: 400 });
          }
          const kind = kindRaw;

          const messageRaw = readTrimmedString(record.message);
          if (!messageRaw) {
            return new Response(null, { status: 400 });
          }
          const message = truncate(messageRaw, MESSAGE_MAX);

          const pageUrlRaw = readTrimmedString(record.pageUrl);
          if (!pageUrlRaw) {
            return new Response(null, { status: 400 });
          }
          const pageUrl = truncate(pageUrlRaw, PAGE_URL_MAX);

          const errorName = readOptionalString(record.errorName);
          const stack = readOptionalString(record.stack);
          const componentStack = readOptionalString(record.componentStack);
          const sourceField = readOptionalString(record.source);
          const source = sourceField === null ? null : truncate(sourceField, SOURCE_MAX);
          const line = readOptionalInt(record.line);
          const column = readOptionalInt(record.column);

          let detailJson: string | null = null;
          if ('detail' in record) {
            detailJson = serializeDetailJson(record.detail);
          }

          const errorNameStored = errorName === null ? null : truncate(errorName, NAME_MAX);

          const session = await getSessionFromRequest(request);
          const sessionUserId = session?.user?.id;
          const userIdStored =
            typeof sessionUserId === 'string' && sessionUserId.trim().length > 0
              ? sessionUserId.trim()
              : null;

          const userAgent = request.headers.get('user-agent');
          const userAgentStored =
            userAgent && userAgent.trim().length > 0 ? truncate(userAgent.trim(), LONG_MAX) : null;

          const id = crypto.randomUUID();
          const createdAt = new Date().toISOString();

          const { DB } = getServerBindings();

          await DB.prepare(
            `INSERT INTO client_error_logs (
              id, user_id, kind, message, error_name, stack, component_stack,
              source, line, "column", page_url, user_agent, detail_json, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
          )
            .bind(
              id,
              userIdStored,
              kind,
              message,
              errorNameStored,
              stack,
              componentStack,
              source,
              line,
              column,
              pageUrl,
              userAgentStored,
              detailJson,
              createdAt,
            )
            .run();

          return new Response(null, { status: 204 });
        },
      }),
  },
});
