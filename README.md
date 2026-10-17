# ✨ Aether Start

> 又一个 AI 聊天应用 但是这次是认真的（大概）

就是说 我寻思着市面上的 AI 聊天界面要么丑得离谱要么就是套壳 GPT wrapper 对吧
然后我就想 不如自己搓一个 于是就有了这玩意儿

## 🤔 这是啥

一个全栈 AI 对话应用 基于 TanStack Start + Cloudflare Workers 部署
接的是 Anthropic + OpenAI 兼容 API（DMX）支持工具调用 能搜网页能抓链接
消息渲染支持 Markdown / 代码高亮 / LaTeX / Mermaid 图表
对话历史持久化在 D1 数据库里 不会聊着聊着就没了

说白了就是一个**能用的** Claude 前端 但是比官方好看（我说的）

## 🏗️ 技术栈

| 层     | 用了啥                                       |
| ------ | -------------------------------------------- |
| 框架   | TanStack Start (React 19 + 文件路由)         |
| 样式   | Tailwind CSS v4 + Radix UI + NES.css         |
| 状态   | Zustand                                      |
| 部署   | Cloudflare Workers                           |
| 数据库 | Cloudflare D1 (SQLite)                       |
| 存储   | Cloudflare R2                                |
| AI     | Anthropic Claude API + OpenAI-compatible API |

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
ANTHROPIC_API_KEY_IKUNCODE=可选 ikun 线路 key
OPENAI_API_KEY_IKUNCODE=可选 OpenAI Responses+ikun 线路 key
GEMINI_API_KEY_IKUNCODE=可选 Gemini+ikun 线路 key
GEMINI_BASE_URL_IKUNCODE=可选 Gemini+ikun 线路 baseURL
OPENROUTER_API_KEY=可选 OpenRouter 线路 key
MOONSHOT_API_KEY=可选 Moonshot 官方 Kimi API key（如 kimi-k2.6）
SERP_API_KEY=Google 搜索使用 Serper API
EVERYINFRA_API_KEY=小红书和微信公众号搜索及正文抓取使用 EveryInfra API
PARALLEL_API_KEY=普通网页和 Reddit 正文抓取使用 Parallel Extract API
SUPADATA_API_KEY=read_youtube_transcript 使用 Supadata
LLM_STREAM_LOGGING=可选，默认关闭；true/all 打开全部，或填 anthropic,openai,openai-responses,gemini 精确开启
LLM_STREAM_LOGGING_MAX_CHARS=可选，单条日志最大字符数，超过则不记录；默认 10000；设为 0 表示不限制
```

`fetch_url({ url })` 只读取文字：普通网页和 Reddit 帖子使用 Parallel Extract API，微信和小红书使用各自的 EveryInfra 接口。图片独立使用 `read_image({ url })`，服务端下载 JPEG、PNG、GIF 或 WebP 并交给模型读取；YouTube 字幕独立使用 `read_youtube_transcript({ url })`，调用 Supadata 并轮询异步任务。历史会话保存的图片和字幕结果继续正常展示。本地在 `.env` 中配置 `PARALLEL_API_KEY`，线上在实际部署的 Worker 中配置同名 Secret。GitHub Actions 使用默认环境部署，本地 `cf:deploy` 使用 `production` 环境，设置 Secret 时须与部署目标一致。密钥只由服务端读取，不使用 `VITE_` 前缀。

小红书和微信公众号的 `search` 使用 EveryInfra 的 `POST /api/v1/social`，分别调用 `xiaohongshu.search` 和 `wechat_oa.article_search`。本地在 `.env` 配置 `EVERYINFRA_API_KEY`，线上在实际部署的 Worker 中设置同名 Secret（默认环境和 `production` 环境分别配置）。现有 `cf:sync-secrets` 读取 `.env.local` 并写入默认环境，不能替代上述目标环境配置。`fetch_url` 的公众号文章和小红书笔记正文分别调用 `wechat_oa.article_detail` 和 `xiaohongshu.note`，完整保留链接参数（包括小红书的 `xsec_token`）。小红书分享短链先在平台域名内解析跳转，再读取笔记。搜索和正文抓取都不自动重试或切换供应商；Reddit 标准链接、`redd.it` 和 gallery 链接先规范化为 `https://www.reddit.com/comments/<id>/`，分享短链仅在 Reddit 域名内解析跳转；不再使用 Just One API。

说明：应用在 `/app` SSR 时并发读取已配置的 ikun、Moonshot、OpenRouter 模型资源，不再维护固定模型目录。`claudeOpus46Ikun` 始终排在第一位；尚未保存模型偏好的账户使用它作为默认模型。用户手动选择模型后，偏好按账户保存到 D1 的 `user_preferences` 表，新会话会重新读取，刷新或换设备后仍然生效。历史会话继续使用自身保存的模型，打开历史和断线恢复不会修改账户偏好。模型不可用时保留其 ID 并明确提示，不自动切换。开发和生产均须应用 `0025_user_preferences.sql` 迁移。`backend=ikun` 根据模型 ID 选择协议：`claude-*` 使用 Anthropic，`gemini-*` 使用 Gemini，`gpt-*` 使用 OpenAI Responses。

---

_built with mass amounts of caffeine and mass amounts of claude_
