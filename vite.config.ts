import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath, URL } from 'url';

const srcPath = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url)).replace(/\\/g, '/');

const config = defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    host: '::',
    port: 3000,
  },
  build: {
    sourcemap: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@/components/AetherLogo', replacement: srcPath('shared/components/AetherLogo.tsx') },
      {
        find: '@/components/ImagePreview',
        replacement: srcPath('shared/components/ImagePreview.tsx'),
      },
      { find: '@/components/Markdown', replacement: srcPath('shared/components/Markdown.tsx') },
      {
        find: '@/components/MarkdownImpl',
        replacement: srcPath('shared/components/MarkdownImpl.tsx'),
      },
      {
        find: '@/components/ResponsiveContext',
        replacement: srcPath('shared/providers/ResponsiveContext.tsx'),
      },
      {
        find: /^@\/components\/ai-elements\/(.*)$/,
        replacement: `${srcPath('shared/components/ai-elements/')}$1`,
      },
      {
        find: /^@\/components\/chat\/share\/(.*)$/,
        replacement: `${srcPath('features/share/components/')}$1`,
      },
      {
        find: /^@\/components\/chat\/(.*)$/,
        replacement: `${srcPath('features/chat/components/')}$1`,
      },
      {
        find: '@/components/sidebar/NotesButton',
        replacement: srcPath('features/notes/components/NotesButton.tsx'),
      },
      {
        find: '@/components/sidebar/Sidebar',
        replacement: srcPath('features/sidebar/components/Sidebar.tsx'),
      },
      {
        find: /^@\/components\/sidebar\/conversation\/(.*)$/,
        replacement: `${srcPath('features/sidebar/components/')}$1`,
      },
      {
        find: /^@\/components\/sidebar\/search\/(.*)$/,
        replacement: `${srcPath('features/sidebar/components/search/')}$1`,
      },
      {
        find: /^@\/components\/sidebar\/settings\/(.*)$/,
        replacement: `${srcPath('features/settings/components/')}$1`,
      },
      { find: /^@\/components\/ui\/(.*)$/, replacement: `${srcPath('shared/ui/')}$1` },
      {
        find: /^@\/components\/notes\/(.*)$/,
        replacement: `${srcPath('features/notes/components/')}$1`,
      },
      { find: '@/hooks/useTheme', replacement: srcPath('shared/useTheme.ts') },
      { find: '@/hooks/useToast', replacement: srcPath('shared/useToast.ts') },
      { find: '@/hooks/useViewportHeight', replacement: srcPath('shared/useViewportHeight.ts') },
      {
        find: '@/hooks/useConversationLoader',
        replacement: srcPath('features/sidebar/useConversationLoader.ts'),
      },
      { find: /^@\/lib\/auth\/(.*)$/, replacement: `${srcPath('features/auth/client/')}$1` },
      {
        find: /^@\/lib\/chat\/api\/chat-orchestrator$/,
        replacement: srcPath('features/chat/request/chat-orchestrator.ts'),
      },
      {
        find: /^@\/lib\/chat\/api\/event-handlers$/,
        replacement: srcPath('features/chat/request/event-handlers.ts'),
      },
      {
        find: /^@\/lib\/chat\/search-result-payload$/,
        replacement: srcPath('features/chat/research/search-result-payload.ts'),
      },
      { find: /^@\/lib\/conversation\/(.*)$/, replacement: `${srcPath('features/sidebar/')}$1` },
      { find: /^@\/lib\/(.*)$/, replacement: `${srcPath('shared/lib/')}$1` },
      {
        find: /^@\/server\/agents\/(.*)$/,
        replacement: `${srcPath('features/chat/server/agents/')}$1`,
      },
      { find: '@/server/base64', replacement: srcPath('shared/server/base64.ts') },
      {
        find: '@/server/db/conversation-shares-db',
        replacement: srcPath('features/share/server/conversation-shares-db.ts'),
      },
      {
        find: '@/server/db/conversations-db',
        replacement: srcPath('features/sidebar/server/conversations-db.ts'),
      },
      { find: '@/server/db/notes-db', replacement: srcPath('features/notes/server/notes-db.ts') },
      {
        find: '@/server/db/prompt-quota-db',
        replacement: srcPath('features/quota/server/prompt-quota-db.ts'),
      },
      { find: '@/server/env', replacement: srcPath('shared/server/env.ts') },
      {
        find: '@/server/functions/admin/redeem-codes',
        replacement: srcPath('features/quota/server/redeem-codes.ts'),
      },
      {
        find: /^@\/server\/functions\/auth\/(.*)$/,
        replacement: `${srcPath('features/auth/server/')}$1`,
      },
      {
        find: /^@\/server\/functions\/chat\/(.*)$/,
        replacement: `${srcPath('features/chat/server/functions/')}$1`,
      },
      {
        find: '@/server/functions/conversations',
        replacement: srcPath('features/sidebar/server/conversations.ts'),
      },
      { find: '@/server/functions/notes', replacement: srcPath('features/notes/server/notes.ts') },
      { find: '@/server/functions/quota', replacement: srcPath('features/quota/server/quota.ts') },
      {
        find: '@/server/functions/shares',
        replacement: srcPath('features/share/server/shares.ts'),
      },
      { find: '@/server/functions/theme', replacement: srcPath('shared/server/theme.ts') },
      {
        find: '@/server/functions/tts',
        replacement: srcPath('features/chat/server/functions/tts.ts'),
      },
      {
        find: '@/stores/zustand/useChatRequestStore',
        replacement: srcPath('features/chat/request/useChatRequestStore.ts'),
      },
      {
        find: '@/stores/zustand/useComposerStore',
        replacement: srcPath('features/chat/composer/useComposerStore.ts'),
      },
      {
        find: '@/stores/zustand/useChatSessionStore',
        replacement: srcPath('features/sidebar/useChatSessionStore.ts'),
      },
      {
        find: '@/stores/zustand/useEditingStore',
        replacement: srcPath('features/chat/editing/useEditingStore.ts'),
      },
      {
        find: '@/stores/zustand/useNotesStore',
        replacement: srcPath('features/notes/useNotesStore.ts'),
      },
      { find: '@/stores/zustand/toast', replacement: srcPath('shared/toastStore.ts') },
      { find: '@/types/chat-api', replacement: srcPath('features/chat/types/chat-api.ts') },
      {
        find: '@/types/chat-event-types',
        replacement: srcPath('features/chat/types/chat-event-types.ts'),
      },
      {
        find: '@/types/conversation',
        replacement: srcPath('features/sidebar/types/conversation.ts'),
      },
      { find: '@/types/message', replacement: srcPath('features/chat/types/message.ts') },
      { find: '@/types/share', replacement: srcPath('features/share/types/share.ts') },
      { find: '@', replacement: srcPath('') },
    ],
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),

    tanstackStart({
      srcDirectory: 'src',
      router: {
        routesDirectory: 'routes',
      },
    }),
    viteReact({
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '19', compilationMode: 'infer' }]],
      },
    }),
  ],
});

export default config;
