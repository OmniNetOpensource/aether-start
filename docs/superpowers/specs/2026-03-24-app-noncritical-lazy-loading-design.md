# App Non-Critical Lazy Loading Design

**Goal**

Reduce `/app` initial client payload by moving obviously non-critical UI behind interaction-driven lazy boundaries, without changing auth gating, sidebar visibility, or chat-page first paint behavior.

**Scope**

This change only targets two interaction-only surfaces:

- `ShareDialog`
- `SettingsModal`

Everything needed to render `/app` and `/app/c/$conversationId` stays eager:

- auth/session gate in `src/routes/app/route.tsx`
- sidebar shell
- conversation list
- chat page layout
- composer and message list

**Problem**

`/app` currently imports UI that is not needed for first paint:

- `ShareButton` eagerly imports `ShareDialog`
- `ProfileMenu` eagerly imports `SettingsModal`

Those imports pull in share server-function wrappers, settings quota/admin code logic, and notes-related state earlier than necessary. The result is a heavier route shell chunk and more initial requests.

**Design**

`ShareButton` keeps its button, open state, and disabled logic eager. The modal body becomes a lazy component loaded only when the user opens the share UI. A small Suspense fallback is shown in the dialog area during the first load. The button may also trigger background preload on hover/focus so the first open feels immediate.

`ProfileMenu` keeps user identity, theme toggle, and menu shell eager. `SettingsModal` becomes a lazy component loaded only when the user chooses Settings. The current settings feature logic stays in the same file; the chunk boundary moves to the import site instead of refactoring that logic across files.

**Why This Boundary**

This is the cleanest split because both targets are modal surfaces that do not affect initial layout correctness. The user must take an explicit action before either one is needed.

This design avoids over-splitting the sidebar or route shell. That matters because the conversation list and auth checks are part of the perceived first-load path; deferring them would trade smaller bundles for slower useful paint.

**Expected Outcome**

- `shares-*` should no longer be required by the `/app` route shell chunk
- `useNotesStore-*`, quota, and admin settings dependencies should no longer be pulled into `/app` before settings opens
- first open of share/settings may incur one async chunk fetch unless preload already happened

**Risks**

- first interaction can feel slower if there is no preload and network is slow
- Suspense fallback placement must avoid layout jump or focus confusion
- lazy import must not change button disabled rules or modal open/close behavior

**Verification**

- build output no longer shows share/settings-related chunks as direct `/app` route-shell imports
- opening Share still works from an existing conversation
- opening Settings still loads quota/account/admin sections correctly
