import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { startChatRequest } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
} from '@/frontend/chat/composer/composer-editor/composer-document';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import {
  messages,
  useCurrentPath,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import { useConversationId } from '@/frontend/conversations/session/conversation-meta';
import { branchConversationFn } from '@/rpc/conversations';
import { upsertConversationInCache } from '@/frontend/conversations/session';
import type { EditingState } from './editing-state';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './selection-toolbar';

export function MessageList() {
  const scrollElement = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentPath = useCurrentPath();
  const currentConversationId = useConversationId();
  const [editing, setEditing] = useState<{
    conversationId: string | null;
    state: EditingState;
  } | null>(null);
  const editingState =
    editing && editing.conversationId === currentConversationId ? editing.state : null;
  const setEditingState = (state: EditingState | null) =>
    setEditing(state ? { conversationId: currentConversationId, state } : null);
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
    if (!editingState) return;
    if (!chatState.getCurrentModelId()) {
      chatState.toast.warning('请先选择模型');
      return;
    }
    if (isComposerDocumentEmpty(editingState.editedDocument)) {
      chatState.toast.warning('请输入内容或添加附件');
      return;
    }

    const target = messages()[editingState.messageId - 1];
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
          blocks: composerDocumentToBlocks(editingState.editedDocument),
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
    if (!currentConversationId) return;

    const branched = await branchConversationFn({
      data: { id: currentConversationId, messageId },
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
      {currentPath.length > 0 && (
        <div className='relative w-full h-full'>
          <div
            ref={scrollElement}
            data-testid='message-scroll'
            style={{ overflowAnchor: 'none' }}
            className='w-full h-full overflow-y-auto'
          >
            <div
              role='log'
              aria-live='polite'
              className={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-[80vh] font-serif ${widthClass}`}
            >
              {currentPath.map((messageId, index) => (
                <MessageItem
                  key={messageId}
                  messageId={messageId}
                  depth={index + 1}
                  isLastInPath={index === currentPath.length - 1}
                  editingState={editingState}
                  onStartEditing={startEditing}
                  onEditDocumentChange={(document) => {
                    if (editingState) {
                      setEditingState({ ...editingState, editedDocument: document });
                    }
                  }}
                  onCancelEditing={() => setEditingState(null)}
                  onSubmitEdit={submitEdit}
                  onRetry={retryFromMessage}
                  onBranch={branchFromMessage}
                />
              ))}
            </div>
          </div>

          <SelectionToolbar container={() => scrollElement.current} />
        </div>
      )}
    </>
  );
}
