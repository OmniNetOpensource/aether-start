import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { cancelAnswering, startChatRequest } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
} from '@/frontend/chat/composer/composer-editor/composer-document';
import { getBranchInfo } from '@/shared/conversations';
import { chatRuntime, status } from '@/frontend/chat/agent-runtime/chat-runtime';
import {
  currentPath,
  messages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import { conversationId } from '@/frontend/conversations/session/conversation-meta';
import type { EditingState } from './editing-state';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './selection-toolbar';

export function MessageList() {
  let scrollElement: HTMLDivElement | undefined;
  const [editingState, setEditingState] = createSignal<EditingState | null>(null);
  const widthClass = 'w-[90%] @[921px]:w-[60%]';
  const isStreaming = () => status() === 'streaming';

  createEffect(conversationId, () => {
    queueMicrotask(() => setEditingState(null));
  });

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
    if (!chatRuntime.getCurrentModelId()) {
      chatRuntime.toast.warning('请先选择模型');
      return;
    }
    if (chatRuntime.getStatus() !== 'idle') {
      await cancelAnswering(chatRuntime, 'message/submitEdit');
    }
    if (isComposerDocumentEmpty(editing.editedDocument)) {
      chatRuntime.toast.warning('请输入内容或添加附件');
      return;
    }

    const target = messages()[editing.messageId - 1];
    if (!target || target.role !== 'user') {
      setEditingState(null);
      return;
    }

    await startChatRequest(
      chatRuntime,
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
    if (!chatRuntime.getCurrentModelId()) {
      chatRuntime.toast.warning('请先选择模型');
      return;
    }
    if (chatRuntime.getStatus() !== 'idle') {
      await cancelAnswering(chatRuntime, 'message/retry');
    }

    const target = messages()[messageId - 1];
    if (!target) return;
    if (target.role === 'user') {
      await startChatRequest(
        chatRuntime,
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
      chatRuntime,
      { type: 'regenerate', currentMessageId: target.parentId },
      () => setEditingState(null),
    );
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
                  const message = createMemo(() => messages()[messageId - 1]);
                  const isLastMessage = createMemo(() => index() === currentPath().length - 1);

                  return (
                    <Show when={message()}>
                      {(currentMessage) => (
                        <MessageItem
                          message={currentMessage()}
                          depth={index() + 1}
                          isStreaming={isLastMessage() && isStreaming()}
                          isLastInPath={isLastMessage()}
                          branchInfo={getBranchInfo(messages(), messageId)}
                          editingState={editingState()}
                          onStartEditing={startEditing}
                          onEditDocumentChange={(document) =>
                            setEditingState((current) =>
                              current ? { ...current, editedDocument: document } : current,
                            )
                          }
                          onCancelEditing={() => setEditingState(null)}
                          onSubmitEdit={submitEdit}
                          onRetry={retryFromMessage}
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
