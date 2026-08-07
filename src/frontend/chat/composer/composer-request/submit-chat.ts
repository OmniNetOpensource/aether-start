import { startChatRequest } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import type { ChatState } from '@/frontend/chat/agent-runtime/chat-state';
import { upsertConversationInCache } from '@/frontend/conversations/session';
import {
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from '../composer-editor/composer-document';
import { setQueuedMessages } from './message-queue';

// 校验输入，发送成功后清空 composer，并在必要时创建新会话后发起聊天请求。
// 若当前正在流式输出，则将消息加入队列，等流结束后自动发送。
export async function submitMessage(
  runtime: ChatState,
  document: ComposerDocument,
  navigateToNewChat: (conversationId: string) => Promise<void> | void,
  clearComposer: () => void,
) {
  const currentModelId = runtime.getCurrentModelId();
  const tree = runtime.getMessageTree();
  const isBusy = runtime.getStatus() !== 'idle';

  const hasModel = !!currentModelId;
  const hasPendingUpload = isComposerDocumentUploading(document);

  if (isComposerDocumentEmpty(document)) {
    runtime.toast.warning('Type a message before sending.');
    return;
  }
  if (!hasModel) {
    runtime.toast.warning('Select a model before sending a message.');
    return;
  }
  if (hasPendingUpload) {
    runtime.toast.warning('Attachments are still uploading. Please wait.');
    return;
  }

  if (isBusy) {
    setQueuedMessages((queue) => [...queue, document]);
    clearComposer();
    return;
  }

  const blocks = composerDocumentToBlocks(document);
  const parentId = tree.currentPath.at(-1) ?? null;
  const previousSiblingId =
    parentId === null ? tree.latestRootId : (tree.messages[parentId - 1]?.latestChild ?? null);
  runtime.setStatus('sending');

  const isNewConversation = !runtime.getConversationId();

  await startChatRequest(
    runtime,
    {
      type: 'append',
      message: { role: 'user', blocks },
      parentId,
      previousSiblingId,
    },
    (response) => {
      clearComposer();
      if (!isNewConversation) {
        return;
      }

      const now = new Date().toISOString();
      upsertConversationInCache({
        id: response.conversationId,
        title: 'New Chat',
        model: runtime.getCurrentModelId(),
        is_pinned: false,
        pinned_at: null,
        created_at: now,
        updated_at: now,
      });
      void navigateToNewChat(response.conversationId);
    },
  );
}
