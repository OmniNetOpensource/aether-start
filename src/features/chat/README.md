# src/features/chat

## 作用
聊天核心领域模块，包含前端交互、状态管理、网络协议与服务端函数。

## 目录建议
- `components/`：聊天 UI 组件
- `hooks/`：聊天相关 hooks
- `store/`：聊天状态（zustand）
- `lib/`：纯逻辑与客户端网络适配
- `types/`：聊天领域类型
- `server/`：服务端能力
  - `functions/`：`createServerFn` 出口
  - `services/`：模型与业务服务
  - `tools/`：tool 定义/执行
  - `schemas/`：server 协议与类型

## 边界建议
- route 层通过 feature 暴露的 API 组装页面
- `server/functions` 尽量轻量，复杂逻辑下沉到 `services`
- 通用工具优先放 `src/shared`
