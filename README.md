# Aether Start

基于 TanStack Start 的对话应用，采用 **route 壳层 + feature 领域分层 + shared 公共层** 架构。

## 快速开始

```bash
pnpm install
pnpm dev
```

## 常用命令

- `pnpm type-check`：TypeScript 类型检查
- `pnpm lint`：ESLint 检查
- `pnpm build`：生产构建
- `pnpm check`：`type-check + lint + build`

## 目录结构

```txt
src/
  app/                     # TanStack Start file-based routes（仅路由壳与页面组装）
  features/                # 业务领域模块（chat/sidebar/theme/responsive）
  shared/                  # 跨领域共享代码
    ui/                    # shadcn/ui 基础组件
    components/            # 通用复用组件
    hooks/                 # 通用 hooks
    lib/                   # 通用工具与存储
    stores/                # 通用状态
    types/                 # 通用类型
  router.tsx               # Router 创建与配置
  routeTree.gen.ts         # 自动生成，禁止手改
```

## 路由约定（TanStack Start）

- 路由文件位于 `src/app`
- 根路由：`src/app/__root.tsx`
- 应用布局：`src/app/app/route.tsx`
- 会话路由：`src/app/app/c/$conversationId.tsx`
- `src/routeTree.gen.ts` 为自动生成文件，不要手动修改

## 分层约束

- `src/app` 只做路由定义与页面级组装，不承载复杂业务逻辑
- 业务逻辑放在 `src/features/*`
- 跨领域复用放在 `src/shared/*`
- feature 之间尽量避免循环依赖
- 导入统一使用 `@/` 指向 `src`

## Server 代码组织

以 chat 为例：

- `src/features/chat/server/functions`：`createServerFn` 入口
- `src/features/chat/server/services`：服务编排与第三方客户端
- `src/features/chat/server/tools`：工具定义与执行
- `src/features/chat/server/schemas`：服务端类型/协议模型

## 注意事项

- 本项目使用 `pnpm`
- 不要手改 `src/routeTree.gen.ts`
- 涉及结构变更后，请至少执行一次 `pnpm check`
