import type { Message } from './message';

export const isChatHistoryTool = (name: string) =>
  name === 'search_chat_history' || name === 'read_chat_history';

export const getChatHistoryText = (message: Message) =>
  message.blocks
    .flatMap((block) => {
      if (block.type === 'content') return [block.content];
      if (message.role === 'user' && block.type === 'quotes') {
        return block.quotes.map((quote) => quote.text);
      }
      return [];
    })
    .filter((text) => text.trim().length > 0)
    .join('\n');
