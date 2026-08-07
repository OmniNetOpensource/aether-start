import { createSignal, For, Show } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { startChatRequest } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
} from '@/frontend/chat/composer/composer-editor/composer-document';
import { getBranchInfo } from '@/shared/conversations';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import {
  currentPath,
  messages,
  streamingAssistantIds,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import { conversationId } from '@/frontend/conversations/session/conversation-meta';
import { branchConversationFn } from '@/rpc/conversations';
import { upsertConversationInCache } from '@/frontend/conversations/session';
import type { EditingState } from './editing-state';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './selection-toolbar';

export function MessageList() {
  let scrollElement: HTMLDivElement | undefined;
  const navigate = useNavigate();
  const [editing, setEditing] = createSignal<{
    conversationId: string | null;
    state: EditingState;
  } | null>(null);
  const editingState = () => {
    const current = editing();
    return current && current.conversationId === conversationId() ? current.state : null;
  };
  const setEditingState = (state: EditingState | null) =>
    setEditing(state ? { conversationId: conversationId(), state } : null);
  const widthClass = 'w-[90%] @[921px]:w-[60%]';

  const startEditing = (messageId: number) => {
    const target = messages()[messageId - 1];
    if (!target || target.role !== 'user') return;
    setEditingState({
      messageId,
      editedDocument: composerDocumentFromBlocks(target.blocks),
    });
  };

  const submitEdit = async () => {
    const editing = editingState();
    if (!editing) return;
    if (!chatState.getCurrentModelId()) {
      chatState.toast.warning('请先选择模型');
      return;
    }
    if (isComposerDocumentEmpty(editing.editedDocument)) {
      chatState.toast.warning('请输入内容或添加附件');
      return;
    }

    const target = messages()[editing.messageId - 1];
    if (!target || target.role !== 'user') {
      setEditingState(null);
      return;
    }

    await startChatRequest(
      chatState,
      {
        type: 'append',
        message: {
          role: 'user',
          blocks: composerDocumentToBlocks(editing.editedDocument),
        },
        parentId: target.parentId,
        previousSiblingId: target.id,
      },
      () => setEditingState(null),
    );
  };

  const retryFromMessage = async (messageId: number) => {
    if (!chatState.getCurrentModelId()) {
      chatState.toast.warning('请先选择模型');
      return;
    }

    const target = messages()[messageId - 1];
    if (!target) return;
    if (target.role === 'user') {
      await startChatRequest(
        chatState,
        {
          type: 'append',
          message: { role: 'user', blocks: target.blocks },
          parentId: target.parentId,
          previousSiblingId: target.id,
        },
        () => setEditingState(null),
      );
      return;
    }
    if (target.parentId === null) return;
    await startChatRequest(
      chatState,
      { type: 'regenerate', currentMessageId: target.parentId },
      () => setEditingState(null),
    );
  };

  const branchFromMessage = async (messageId: number) => {
    const sourceConversationId = conversationId();
    if (!sourceConversationId) return;

    const branched = await branchConversationFn({
      data: { id: sourceConversationId, messageId },
    });
    upsertConversationInCache({
      id: branched.conversationId,
      title: branched.title,
      model: branched.model,
      is_pinned: false,
      pinned_at: null,
      created_at: branched.created_at,
      updated_at: branched.created_at,
    });
    await navigate({
      to: '/app/$conversationId',
      params: { conversationId: branched.conversationId },
    });
  };

  return (
    <>
      {messages().length > 0 && (
        <div class='relative w-full h-full'>
          <div
            ref={(element) => {
              scrollElement = element;
            }}
            class='w-full h-full overflow-y-auto'
          >
            <div
              role='log'
              aria-live='polite'
              class={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-[80vh] font-serif ${widthClass}`}
            >
              <For each={currentPath()}>
                {(messageId, index) => {
                  const message = () => messages()[messageId - 1];
                  const isLastMessage = () => index() === currentPath().length - 1;

                  return (
                    <Show when={message()}>
                      {(currentMessage) => (
                        <MessageItem
                          message={currentMessage()}
                          depth={index() + 1}
                          isStreaming={streamingAssistantIds().has(messageId)}
                          isLastInPath={isLastMessage()}
                          branchInfo={getBranchInfo(messages(), messageId)}
                          editingState={editingState()}
                          onStartEditing={startEditing}
                          onEditDocumentChange={(document) => {
                            const current = editingState();
                            if (current) setEditingState({ ...current, editedDocument: document });
                          }}
                          onCancelEditing={() => setEditingState(null)}
                          onSubmitEdit={submitEdit}
                          onRetry={retryFromMessage}
                          onBranch={branchFromMessage}
                        />
                      )}
                    </Show>
                  );
                }}
              </For>
            </div>
          </div>

          <SelectionToolbar container={() => scrollElement} />
        </div>
      )}
    </>
  );
}
