# src/shared/lib/tools

## 作用
内置工具的定义与实现。

## 职责
- 提供搜索与网页抓取等工具实现。
- 提供工具类型与统一入口定义。

## 环境变量
- `JINA_API_KEY`：`fetch_url` 工具必需，用于通过 Jina Reader API 抓取网页内容（不再直连原站）。

## 内容
- 子目录：无直接子目录
- 文件：serper-search.ts、tavily-search.ts、fetch.ts、types.ts
