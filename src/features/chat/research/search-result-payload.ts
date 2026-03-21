export const SEARCH_TOOL_NAMES = new Set([
  'search',
  'serper_search',
  'tavily_search',
  'serp_search',
  'brave_search',
]);

export type SearchClientResult = {
  title: string;
  url: string;
};

export type SearchClientPayload = {
  results: SearchClientResult[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseSearchClientPayload = (raw: string): SearchClientPayload | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
      return null;
    }

    const results = parsed.results
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const url = typeof item.url === 'string' ? item.url : '';

        if (!title || !url) {
          return null;
        }

        return { title, url };
      })
      .filter((item): item is SearchClientResult => Boolean(item));

    return { results };
  } catch {
    return null;
  }
};

export const stringifySearchClientPayload = (payload: SearchClientPayload): string =>
  JSON.stringify({
    results: payload.results.map((item) => ({
      title: item.title,
      url: item.url,
    })),
  });

export const stringifyFetchClientPayload = (payload: { type: 'fetch_result' }): string =>
  JSON.stringify(payload);
