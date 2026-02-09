# src/shared

## 作用
存放跨 feature 的可复用模块，避免业务代码散落。

## 子目录
- `ui/`：基础 UI 原子组件
- `components/`：通用组件
- `hooks/`：通用 hooks
- `lib/`：通用工具函数与存储层
- `stores/`：跨领域状态
- `types/`：跨领域通用类型

## 约束
- `shared` 不依赖具体 feature
- 若出现 feature 特有逻辑，应回迁到对应 `src/features/*`
