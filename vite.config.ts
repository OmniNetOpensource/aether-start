import { defineConfig, type Plugin } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import viteSolid from 'vite-plugin-solid';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

const createManualChunk = (id: string) => {
  if (id.includes('node_modules/solid-js') || id.includes('node_modules/@solidjs/web')) {
    return 'vendor-solid';
  }

  if (
    id.includes('node_modules/unified') ||
    id.includes('node_modules/remark-') ||
    id.includes('node_modules/rehype-') ||
    id.includes('node_modules/hast-util-')
  ) {
    return 'markdown';
  }

  return undefined;
};

const skipUnusedReactStartOptimization = (): Plugin => ({
  name: 'skip-unused-react-start-optimization',
  enforce: 'post',
  configEnvironment(name) {
    if (name !== 'ssr') return;
    return {
      optimizeDeps: {
        exclude: ['@tanstack/react-start', '@tanstack/start-server-core'],
      },
    };
  },
});

export default defineConfig(({ command }) => {
  const enableBuildSourcemap = process.env.VITE_BUILD_SOURCEMAP === 'true';

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    server: {
      host: '::',
      port: 3000,
    },
    build: {
      sourcemap: enableBuildSourcemap,
      rollupOptions: {
        external: ['cloudflare:workers'],
        output: {
          manualChunks: createManualChunk,
        },
      },
    },
    resolve: {
      alias: [
        {
          find: /^shiki$/,
          replacement: resolve(__dirname, 'src/frontend/design-system/shiki-bundle.ts'),
        },
        { find: '@', replacement: resolve(__dirname, 'src') },
      ],
    },
    plugins: [
      ...(command === 'serve' ? [devtools()] : []),
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tailwindcss(),
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      tanstackStart({
        srcDirectory: 'src',
        router: {
          routesDirectory: 'routes',
        },
        spa: {
          enabled: true,
          maskPath: '/spa-shell',
        },
      }),
      viteSolid({ ssr: true }),
      skipUnusedReactStartOptimization(),
    ],
  };
});
