# src/features/chat/store

## 作用
聊天状态管理（Zustand）。

## 职责
- 拆分维护聊天 UI 与请求状态。
- 提供发送、编辑、分支等动作的分区职责。

## 内容
- 子目录：无直接子目录
- 文件：
  - useMessageTreeStore.ts
  - useComposerStore.ts
  - useEditingStore.ts
  - useChatRequestStore.ts
  - index.ts
