# src/features

## 作用
按业务领域组织模块代码，承载页面外的大多数业务实现。

## 当前领域
- `chat`：对话主流程（UI、状态、网络、server）
- `sidebar`：侧边栏与会话列表
- `theme`：主题相关能力
- `responsive`：设备/响应式能力

## 约束
- 路由文件仍放在 `src/app`，feature 不直接承担路由定义
- 共享能力优先沉淀到 `src/shared`
- feature 内部可分 `components/hooks/store/lib/types/server`
