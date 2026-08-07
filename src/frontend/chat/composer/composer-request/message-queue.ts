import { createSignal } from 'solid-js';
import type { ComposerDocument } from '../composer-editor/composer-document';

/** 流式输出期间排队待发的消息，流结束后由 Composer 依次自动发送 */
export const [queuedMessages, setQueuedMessages] = createSignal<ComposerDocument[]>([]);
