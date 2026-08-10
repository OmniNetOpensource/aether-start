import { createFileRoute } from '@tanstack/solid-router';

/* SPA 模式的 shell 载体路由：构建时用它生成 _shell.html。
   组件为空，让 shell body 几乎没有 DOM，避免客户端水合失配。 */
export const Route = createFileRoute('/spa-shell')({
  component: () => null,
});
