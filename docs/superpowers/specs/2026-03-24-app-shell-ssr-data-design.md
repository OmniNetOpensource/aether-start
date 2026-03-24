# App Shell SSR Data Design

**Goal**

Move the initial `/app` data fetch for models, prompts, and the first conversation page into the `/app` route loader so the first render is server-backed instead of hydration-triggered.

**Scope**

This change only covers:

- `getAvailableModelsFn`
- `getAvailablePromptsFn`
- `listConversationsPageFn` for the first page

Follow-up client behavior stays intact:

- conversation pagination still uses `loadMoreConversations`
- model/prompt changes still go through the existing store
- conversation detail loading stays where it is

**Design**

The `/app` parent route gets a `loader` that fetches:

- available models
- available prompts
- the first page of conversation list items

That loader data is passed through a lightweight React context owned by the `/app` route boundary.

Client components that currently fetch on mount switch to a loader-first flow:

- `ConversationList`
- `ModelSelector`
- `PromptSelector`

Each component renders from loader data immediately when the store is still empty, then hydrates the client store from the same loader payload. That avoids server-side mutation of the singleton Zustand store and prevents cross-request leakage.

**Why Not Hydrate the Store on the Server**

The current store is a singleton module store. Writing request-specific user data into it during SSR would risk leaking state across requests. Using route loader data for SSR output and hydrating the client store only in the browser keeps the boundary safe.

**Expected Result**

- those three server functions stop appearing as hydration-triggered client fetches on first `/app` render
- `/app` server render already contains conversation list items and initial model/prompt labels
- client-side navigation still uses the same route loader contract, so there is one data path instead of two
