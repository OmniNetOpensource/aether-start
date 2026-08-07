# 流式期间可编辑/重试:多 run 并发 + 事件流单一事实源

## 目标

1. 流式输出期间可以编辑、重试任意 user 消息,新分支立即开始生成,旧分支不被打断。
2. 客户端内存中的消息树始终是服务端树的确定性副本:树结构变更不再走 RPC 响应旁路,统一走 SSE 事件流,按 eventId 全序 apply。

## 核心设计

- **run**:一次模型生成(接受请求 → chat_finished)。DO 内多 run 共存,各自持有 abortController 与固定的 assistantMessageId。
- **共享树**:DO 持有会话级 `activeTree`,所有 run 的事件写同一棵树;落库永远持久化它。
- **事件信封**:`PersistedChatEvent` 增加 `assistantMessageId`,内容事件定点写目标消息。
- **tree_operation 事件**:user 消息插入 + assistant 占位创建作为一种新事件进入事件流,eventId 成为整棵树唯一时间线。POST /chat 响应降级为纯回执。
- **currentPath 彻底归客户端**:服务端不再持久化、不再返回 currentPath。打开历史会话时,客户端以"最新的 assistant 消息"(id 最大的 assistant,无则 id 最大的消息)向上走 parentId 组装路径。服务端内部仅在单次 run 生命周期里使用 run 级路径(决定发给模型的分支上下文),不落库。

## 改动明细

### 1. src/shared/chat/chat-event-types.ts

新增事件类型:

```ts
| {
    type: 'tree_operation';
    userMessage: UserMessage | null;   // 服务端确认后的完整 user 消息(regenerate 时为 null)
    assistantMessageId: number;        // 本次 run 的占位 assistant id
    assistantCreatedAt: string;
    changedMessages: Message[];        // 兄弟指针等被修改的消息
  }
```

(不带 currentPath——路径彻底归客户端,客户端对自己发起的操作用 `selectMessage(assistantMessageId)` 切过去。)

### 2. src/shared/chat/chat-api.ts

- `PersistedChatEvent` 加 `assistantMessageId: number | null`(tree_operation/conversation_updated 为 null)。
- `ChatCommandResponse` 简化为回执:`{ conversationId, assistantMessageId, idempotencyKey }`。
- `chat_finished` payload 类型化:`{ assistantMessageId, status, assistantCompletedAt, remainingRuns }`。

### 3. src/backend/chat/agent/conversation-runner.ts(核心)

- `abortController: AbortController | null` → `runs: Map<number /* assistantMessageId */, { abortController: AbortController }>`。
- 新增 `activeTree: MessageTreeSnapshot | null`:第一个 run 启动时从 D1 初始化,`runs.size === 0` 且 finalize 完成后释放。
- `handleChat`:
  - 删除 409 busy。
  - `runs.size > 0` 时基于 `activeTree` 做 `applyChatOperation`(不读 D1),否则照旧读 D1。
  - 树操作成功后**立即追加 assistant 占位消息**(空 blocks),拿到 assistantMessageId。
  - 通过 `persistAndBroadcastEvent` 发出 `tree_operation` 事件(进 eventCache,可断线补拉)。
  - 落库 activeTree;响应只回回执。
- `emitEvent`(run 内):写 `this.activeTree`(processEventToTree 带 assistantMessageId 定点写);信封带 assistantMessageId。
- `eventCache`:不再在新请求时清空;最后一个 run finalize 后清空。
- `handleAbort`:body 可带 `assistantMessageId`,带则只 abort 对应 run,不带则 abort 全部。
- `finalize`:
  - 只 stamp 自己的 assistant 消息 completedAt;
  - `chat_finished` 带 `{ assistantMessageId, remainingRuns: runs.size - 1 }`;
  - 仅当自己是最后一个 run 时:closeAllWriters、清 eventCache、runtimeState 置终态、regenerateTitle。
- `runtimeState.status`:`runs.size > 0` ? 'running' : 终态。
- askuserquestions 的 `chat_paused`:仅当没有其他活跃 run 时才 closeAllWriters,否则连接保持。
- quota:不变,每 run 接受时扣一次。

### 4. src/backend/chat/agent/event-processor.ts

- 删除 `ensureAssistantTarget` 懒创建。
- `processEventToTree(state, event, assistantMessageId)`:内容类事件按 id 定点 append;`tree_operation` 事件直接把 userMessage/占位 assistant/changedMessages 合入树。

### 5. src/shared/conversations/chat-operation.ts

- `applyChatOperation` 增加返回占位 assistant 的变体(或新增 `appendAssistantPlaceholder` 纯函数),供服务端在同一次操作里建 user + assistant。
- 删除 `appendConfirmedUserMessage` 与 `mergeChatStartedPayload`(客户端不再重演树操作)。
- 新增 `buildPathToLatestAssistant(messages)` 纯函数:取 id 最大的 assistant 消息(无 assistant 则 id 最大的消息),沿 parentId 向上组装路径。前端打开会话、后端 run 上下文与分享兜底共用。

### 5b. currentPath 彻底移出服务端

- `migrations/0024_drop_current_path.sql`:`ALTER TABLE conversation_bodies DROP COLUMN current_path_json`。
- `src/backend/conversations/conversations-db.ts`:`upsertConversation` / `getConversationById` 移除 currentPath 字段;分支另存为(branchConversation)只写线性 messages,不写 path。
- `src/rpc/conversations.ts` / `getConversationFn`:返回值不含 currentPath。
- run 级路径:`handleChat` 中 `applyChatOperation` 算出的路径只存在 run 内存里,用于 `conversationHistory`(发给模型的分支上下文)与 finalize 时 stamp 自己的 assistant;不落库。
- 标题生成(`extractConversationTranscript`)改用当前 run 的路径(行为不变)。
- **分享**:`createShareFn` 请求体增加 `currentPath: number[]`,由客户端提交"我正在看的分支";服务端校验该路径在树中合法(逐级 parentId 校验)后构建快照。路径缺失或非法时回退 `buildPathToLatestAssistant`。分享页只读快照,不受影响。

### 6. src/frontend/chat/agent-runtime/chat-orchestrator.ts

- SSE 连接与请求解耦:`activeController` 语义收窄为"当前会话的 events 订阅"。
- `startChatRequest`:
  - 不再 `activeController?.abort()`;
  - POST /chat 成功后:若无活跃订阅则建立 /events 连接,否则复用(broadcast 覆盖所有 run);
  - accepted 回执不改树,只记录"我发起的 assistantMessageId",等对应 tree_operation 事件到达时跟随切 currentPath。
- `cancelAnswering(runtime, reason, assistantMessageId?)`:透传给 /abort;等待对应 run 的 chat_finished(不再是全局 stopFinished,改为按 assistantMessageId 的 pending map)。
- `resumeRunningConversation`:不变(sync_response 补拉天然含 tree_operation)。

### 7. src/frontend/chat/agent-runtime/event-handlers.ts

- `chat_event`:按信封 assistantMessageId 路由;`tree_operation` 合入树,若其 assistantMessageId 是本客户端刚发起的,`selectMessage(assistantMessageId)` 跟随切路径。
- 打字缓冲 `Segment` 加 `targetId`;不在 currentPath 上的 target 不入队、直接写树(不可见分支无动画,避免互相阻塞)。
- `chat_finished`:stamp 对应消息 completedAt;`remainingRuns === 0` 时 status 回 idle,否则维持 streaming。
- `sync_response`:status 按服务端 running 判定,事件按序 apply(逻辑不变)。

### 8. src/frontend/conversations/conversation-tree/message-tree-state.ts

- `appendToAssistant(targetId, addition)`:定点写,删除"末尾懒创建"分支。
- `stampAssistantCompletedAt(targetId, completedAt)` 同理。
- 新增 `applyTreeOperation(event)`:合入 userMessage/占位 assistant/changedMessages。
- 新增 `streamingAssistantIds` signal(Set<number>):tree_operation 加入,chat_finished 移除;供 UI 判断"这条消息在流式"。

### 9. src/routes/app/$conversationId.tsx

- loader 不再读 currentPath;`initializeMessageTree(messages, buildPathToLatestAssistant(messages))`——每次打开历史会话都定位到最新 assistant 所在分支。

### 10. src/frontend/chat/message-thread/MessageList.tsx + MessageItem.tsx

- `submitEdit` / `retryFromMessage`:删除 `cancelAnswering` 调用与 status 闸门,直接 startChatRequest。
- `MessageItem`:`isStreaming` 改为 `streamingAssistantIds().has(messageId)`;编辑/重试按钮不再 disabled;BranchNavigator 解禁(纯客户端切换)。

### 11. src/frontend/chat/composer/Composer.tsx + submit-chat.ts

- 停止按钮:`cancelAnswering` 不带 assistantMessageId = 停止全部 run(语义不变)。
- `submitMessage` 的 isBusy 排队逻辑保留(底部新消息仍是"追加到当前分支末尾",在流式时排队是合理语义;只有编辑/重试走并发分支)。
- `submitMessage` 中 `parentId = currentPath.at(-1)` 在流式期间指向未完成的 assistant——排队机制已避免此情况,不改。
- 新会话导航回调改为使用回执里的 conversationId(tree_operation 事件会补齐 user 消息)。

## 测试

- `chat-operation.test.ts`:补占位 assistant 的用例。
- 新增 `conversation-runner` 多 run 生命周期 vitest:两 run 交错 emit → activeTree 正确、eventCache 保序、finalize 收口顺序、abort 单 run。
- `event-processor`:定点写与 tree_operation 合入。

## 验收(按 CLAUDE.md 强制真实验收)

在用户已启动的本地服务上:

1. 发送消息,流式中途编辑该 user 消息 → 两条 assistant 并行生长,分支导航 2/2,切换互不干扰。
2. 流式中途重试 assistant → 同上。
3. 快速连续编辑同一条消息 3 次 → 树不乱,3 条流各写各的。
4. 流式中刷新页面 → resume 补拉后两条流状态正确。
5. 停止按钮 → 所有 run 收口,status 回 idle。
6. 打开历史多分支会话 → 定位到最新 assistant 所在分支;普通单流收发回归。
7. 分享一个多分支会话 → 快照内容是分享时正在看的分支。

## 明确不做

- run 数量上限/自动替换策略(纯策略层,基建落地后另行讨论)。
- Markdown 渲染层打字机重写(保留现有 rAF 缓冲,仅按 targetId 分队)。
- quota、attachment、provider 层:零改动。
