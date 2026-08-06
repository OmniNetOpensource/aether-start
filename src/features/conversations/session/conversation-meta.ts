import { createSignal } from 'solid-js';

const [conversationId, setConversationId] = createSignal<string | null>(null);
const [pageTitle, setPageTitle] = createSignal('Aether');

export { conversationId, pageTitle, setConversationId, setPageTitle };

export const clearConversationMeta = () => {
  setConversationId(null);
  setPageTitle('Aether');
};
