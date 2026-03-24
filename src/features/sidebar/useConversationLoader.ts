/**
 * useConversationLoader
 *
 * 对话加载器 Hook：负责从服务端拉取对话详情，并同步到各 Zustand store。
 *
 * 职责：
 * 1. 根据 loadingConversationId 拉取对话（消息树、artifacts、currentPath 等）
 * 2. 若当前 store 已是该对话，则尝试恢复断点续传（resume streaming）
 * 3. 切换/离开对话时执行清理（abort 请求、清空 composer/editing 等）
 * 4. 根据对话标题更新 document.title
 *
 * 使用场景：/app/c/$conversationId 路由下的 ConversationPage
 */
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  resetLastEventId,
  cancelStreamSubscription,
  resumeRunningConversation,
} from '@/features/chat/request/chat-orchestrator';
import { useEditingStore } from '@/features/chat/editing/useEditingStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { getConversationFn } from '@/server/functions/conversations';
import { buildCurrentPath } from './tree/message-tree';
import type { Message } from '@/types/message';

/**
 * @param loadingConversationId - 当前路由参数中的对话 ID（来自 /app/c/$conversationId）
 * @returns { isLoading } - 是否处于加载中（拉取对话详情时为 true）
 */
export function useConversationLoader(loadingConversationId: string) {
  const navigate = useNavigate();
  const currentConversationId = useChatSessionStore((state) => state.conversationId);
  const initializeTree = useChatSessionStore((state) => state.initializeTree);
  const setConversationId = useChatSessionStore((state) => state.setConversationId);
  const setArtifacts = useChatSessionStore((state) => state.setArtifacts);

  const [isLoading, setIsLoading] = useState(currentConversationId !== loadingConversationId);

  /**
   * 主 effect：加载对话或恢复流式续传
   * - 若 store 中已是该对话：尝试 resume（页面刷新后重新进入时）
   * - 否则：拉取对话详情，hydrate 消息树，写入 store
   * - cleanup：abort 进行中的 resume 请求，标记 cancelled 避免竞态
   */
  useEffect(() => {
    if (currentConversationId === loadingConversationId) {
      void resumeRunningConversation(loadingConversationId);
      return;
    }

    let cancelled = false;

    /* 拉取新对话：getConversationFn 返回 messages、currentPath、artifacts、role 等 */
    void getConversationFn({ data: { id: loadingConversationId } })
      .then((conversation) => {
        if (cancelled) return;

        if (!conversation) {
          navigate({ to: '/404', replace: true });
          return;
        }

        const messages = (conversation.messages ?? []) as Message[];
        let currentPath = conversation.currentPath ?? [];
        if (currentPath.length === 0 && messages.length > 0) {
          currentPath = buildCurrentPath(messages, messages[0].id);
        }

        setConversationId(loadingConversationId);
        initializeTree(messages, currentPath);
        setArtifacts(conversation.artifacts ?? []);
        const store = useChatSessionStore.getState();
        const roleId = conversation.role ?? '';
        store.setCurrentRole(roleId);
        setIsLoading(false);
        void resumeRunningConversation(loadingConversationId);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load conversation:', error);
        navigate({ to: '/404', replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [
    loadingConversationId,
    currentConversationId,
    navigate,
    setConversationId,
    initializeTree,
    setArtifacts,
  ]);

  const title = useChatSessionStore(
    (state) => state.conversations.find((c) => c.id === loadingConversationId)?.title,
  );

  const defaultTitle = 'Aether';
  // 同步更新 document.title，离开时由下方 effect cleanup 恢复
  // eslint-disable-next-line -- intentionally sync
  document.title = title
    ? `${title.length > 50 ? `${title.slice(0, 50)}...` : title} - Aether`
    : defaultTitle;

  /**
   * 切换/离开对话时的清理 effect
   * 当 loadingConversationId 变化（切换对话）或组件卸载（离开页面）时执行
   */
  useEffect(() => {
    return () => {
      document.title = defaultTitle;
      resetLastEventId();
      cancelStreamSubscription();
      useEditingStore.getState().clear();
    };
  }, [loadingConversationId]);

  return { isLoading };
}
