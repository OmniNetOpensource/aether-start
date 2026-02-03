import { useChatRequestStore } from "./useChatRequestStore";
import { useComposerStore } from "./useComposerStore";
import { useEditingStore } from "./useEditingStore";
import { useMessageTreeStore } from "./useMessageTreeStore";

export { useMessageTreeStore, useIsNewChat } from "./useMessageTreeStore";
export { useComposerStore } from "./useComposerStore";
export { useEditingStore } from "./useEditingStore";
export { useChatRequestStore } from "./useChatRequestStore";

export const clearAllChatStores = () => {
  useChatRequestStore.getState().clear();
  useEditingStore.getState().clear();
  useComposerStore.getState().clear();
  useMessageTreeStore.getState().clear();
};
