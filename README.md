# ✨ Aether Start

> 又一个 AI 聊天应用 但是这次是认真的（大概）

就是说 我寻思着市面上的 AI 聊天界面要么丑得离谱要么就是套壳 GPT wrapper 对吧
然后我就想 不如自己搓一个 于是就有了这玩意儿

## 🤔 这是啥

一个全栈 AI 对话应用 基于 TanStack Start + Cloudflare Workers 部署
接的是 Anthropic Claude API 支持工具调用 能搜网页能抓链接
消息渲染支持 Markdown / 代码高亮 / LaTeX / Mermaid 图表
对话历史持久化在 D1 数据库里 不会聊着聊着就没了

说白了就是一个**能用的** Claude 前端 但是比官方好看（我说的）

## 🏗️ 技术栈

| 层 | 用了啥 |
|---|---|
| 框架 | TanStack Start (React 19 + 文件路由) |
| 样式 | Tailwind CSS v4 + Radix UI + NES.css |
| 状态 | Zustand |
| 部署 | Cloudflare Workers |
| 数据库 | Cloudflare D1 (SQLite) |
| 存储 | Cloudflare R2 |
| AI | Anthropic Claude API |

## 🚀 跑起来

```bash
pnpm install
cp .env.example .env.local  # 填你的 API keys
pnpm dev                     # localhost:3000 启动！
```

## 📦 部署到 Cloudflare

```bash
pnpm cf:migrate:remote  # 跑数据库迁移
pnpm cf:deploy           # 构建 + 部署 一条龙
```

push 到 `master` 也会自动触发 GitHub Actions 部署 很方便的

## 🛠️ 常用命令

- `pnpm dev` — 本地开发
- `pnpm check` — 类型检查 + lint + 构建 一把梭
- `pnpm cf:deploy` — 部署到 Cloudflare
- `pnpm cf:migrate:local` — 本地 D1 迁移
- `pnpm cf:migrate:remote` — 远程 D1 迁移

## 🧠 功能

- 💬 流式对话 打字机效果 很丝滑
- 🔍 联网搜索 不再是信息孤岛
- 🌐 URL 抓取 丢个链接就能总结
- 🌲 消息树 支持分支对话 选择困难症福音
- 📎 附件上传 图片直接贴
- 🎨 代码高亮 + LaTeX + Mermaid 该有的都有
- 🌙 暗色模式 保护你的眼睛
- 💾 对话持久化 关了浏览器也不会丢

## 📁 项目结构

```
src/
  routes/          # 文件路由 页面入口
  features/        # 业务模块
    chat/          # 聊天核心 (消息/编辑器/API/工具)
    conversation/  # 对话模型 + 持久化
    sidebar/       # 侧边栏 历史记录
    theme/         # 主题切换
  shared/          # 公共组件和工具
  server/          # 服务端环境配置
```

## 📝 环境变量

```env
ANTHROPIC_API_KEY_RIGHTCODE=必填 basic线路key
ANTHROPIC_BASE_URL_RIGHTCODE=必填 basic线路baseURL
ANTHROPIC_API_KEY_IKUNCODE=必填 pro线路key
ANTHROPIC_BASE_URL_IKUNCODE=必填 pro线路baseURL
SERP_API_KEY=可选 搜索功能要用
JINA_API_KEY=可选 URL 抓取要用
```

---

*built with mass amounts of caffeine and mass amounts of claude*
