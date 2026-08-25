let pendingMessageId: number | null = null;

export const markNewMessageAnimation = (messageId: number) => {
  pendingMessageId = messageId;
};

export const consumeNewMessageAnimation = (messageId: number) => {
  if (pendingMessageId !== messageId) return false;
  pendingMessageId = null;
  return true;
};
