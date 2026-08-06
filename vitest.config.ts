import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import viteSolid from 'vite-plugin-solid';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths(), viteSolid()],
  resolve: {
    conditions: ['browser'],
    alias: [
      {
        find: 'cloudflare:workers',
        replacement: fileURLToPath(
          new URL('./src/test/cloudflare-workers-stub.ts', import.meta.url),
        ),
      },
      {
        find: /^@tanstack\/solid-router$/,
        replacement: fileURLToPath(
          new URL('./node_modules/@tanstack/solid-router/dist/esm/index.js', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    server: {
      deps: {
        inline: ['@tanstack/solid-router', '@tanstack/solid-start'],
      },
    },
  },
});
