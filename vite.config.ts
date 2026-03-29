import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

const createManualChunk = (id: string) => {
  if (id.includes('node_modules/react-dom')) {
    return 'vendor-react';
  }

  if (id.includes('node_modules/react')) {
    return 'vendor-react';
  }

  if (id.includes('node_modules/streamdown') || id.includes('node_modules/@streamdown/cjk')) {
    return 'markdown';
  }

  return undefined;
};

const reactCompilerPlugin = [
  ['babel-plugin-react-compiler', { target: '19', compilationMode: 'infer' }],
];

export default defineConfig(({ command }) => {
  const enableBuildSourcemap = process.env.VITE_BUILD_SOURCEMAP === 'true';
  const enableReactCompiler = process.env.VITE_ENABLE_REACT_COMPILER === 'true';

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
      dedupe: ['react', 'react-dom'],
      alias: [{ find: '@', replacement: resolve(__dirname, 'src') }],
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
      }),
      viteReact(
        enableReactCompiler
          ? {
              babel: {
                plugins: reactCompilerPlugin,
              },
            }
          : undefined,
      ),
    ],
  };
});
