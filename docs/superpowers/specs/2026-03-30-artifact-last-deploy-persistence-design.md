# Artifact Last Deploy Persistence Design

**Goal**

Persist the last successful deploy result for each artifact so the deploy link and deploy time still exist after reload, conversation restore, or artifact switching.

**Scope**

This change only covers the latest successful deploy metadata for an existing artifact:

- persist the latest deploy URL
- persist the latest deploy timestamp
- load both fields with conversation artifacts
- show the persisted result in the artifact panel
- overwrite the previous result on the next successful deploy

This change does not add deploy history, retry tracking, deploy status history, or a new deploy table.

**Problem**

The current deploy result only lives in local UI state inside `src/features/chat/artifact/ArtifactPanel.tsx`. That means the URL disappears as soon as the selected artifact changes, the page reloads, or the conversation is loaded again from D1.

The persistent artifact record in `conversation_artifacts` only stores artifact content:

- `title`
- `language`
- `code`

So the reload path has nowhere to read deploy metadata from.

**Design**

The latest deploy result will live on the artifact row itself. `conversation_artifacts` gets two nullable columns:

- `deploy_url`
- `deployed_at`

Nullable is the correct shape because many artifacts will exist before any deploy happens.

The server deploy function in `src/features/chat/artifact/netlify-deploy.ts` will accept the artifact id together with the HTML payload. After Netlify returns a successful public URL, the same server function updates the matching artifact row with the new URL and timestamp. If deploy fails, no artifact row is changed.

The artifact types in `src/features/conversations/session/conversation.ts`, the D1 parsing code in `src/features/conversations/session/conversations-db.ts`, and the client session store in `src/features/conversations/session/useChatSessionStore.ts` will all carry these two persisted fields. Conversation loading already restores artifacts through `getConversationById`, so once the fields are part of the artifact record, page restore works without inventing a second persistence path.

The artifact panel will stop treating the deploy URL as durable local state. Local UI state should only represent the transient in-flight case, meaning "deploying". The durable display state comes from the selected artifact record:

- no persisted URL: show `Deploy`
- deploying: show spinner
- persisted URL: show `Open`

After a successful deploy, the client updates the selected artifact in the session store with the returned URL and timestamp so the UI reflects the new result immediately, without waiting for a reload.

**Why This Shape**

The user only wants the last deploy result, not a history. Putting the latest URL and time directly on `conversation_artifacts` matches that exactly.

This avoids an unnecessary `artifact_deploys` table, extra queries, and extra reconciliation logic between artifact content and deploy metadata. It also keeps the read path simple because loading a conversation already loads artifacts.

**Data Flow**

When the user clicks Deploy, the panel sends the current artifact id and generated HTML to the server function. The server performs the Netlify deploy. If Netlify returns success, the server writes `deploy_url` and `deployed_at` to the artifact row and returns them to the client. The client updates the selected artifact in the zustand store so the persisted result is visible immediately. On later page loads, `getConversationById` reads the same two fields from D1 and `setArtifacts` restores them into the panel.

**Schema Changes**

Add one migration that alters `conversation_artifacts`:

- `deploy_url TEXT`
- `deployed_at TEXT`

No backfill is needed. Existing rows remain valid with `NULL` deploy metadata.

**Risks**

- The deploy server function must verify ownership through the existing authenticated conversation artifact update path, otherwise one artifact id could update the wrong row.
- The client must not keep a separate stale URL cache after moving to persisted fields, or the UI can diverge from D1.
- The artifact panel should not flip back to `Deploy` after success just because the component rerendered. The durable source of truth needs to be the artifact record, not local state.

**Verification**

- migrate local D1 and confirm old artifacts still load with `deploy_url = null` and `deployed_at = null`
- deploy an artifact and confirm the panel shows `Open`
- reload the page and confirm the same artifact still shows the saved URL
- switch to another conversation and back, then confirm the saved URL and deploy time still restore
- run `pnpm type-check`
- run `pnpm lint`
