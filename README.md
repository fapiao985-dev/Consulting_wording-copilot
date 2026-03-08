# Market Wording Copilot

A Bain-style slide wording generation tool for commercial due diligence (CDD) and market analysis projects. Upload a market chart, and the AI generates structured, insight-driven wording following Bain's analytical frameworks.

## Features

- **Chart-based inference**: Upload a market chart (PNG/JPG) and the AI extracts the chart title, detects the industry, and generates wording automatically
- **Bain-style frameworks**: Supports time-based (Pre-COVID / COVID / Post-COVID), driver-based, and segment-based analytical frameworks
- **Web search integration**: Searches analyst reports and 3rd-party sources to validate and enrich generated wording
- **Case Materials**: Supports LT comments, PDF uploads, expert call notes, and other supplementary materials
- **Structured output**: Generates L1 bullets with supporting sub-bullets, following Bain slide wording conventions

## Tech Stack

- **Frontend**: React 19 + Tailwind CSS 4 + shadcn/ui
- **Backend**: Express 4 + tRPC 11
- **Database**: MySQL / TiDB (via Drizzle ORM)
- **Auth**: Manus OAuth
- **LLM**: Manus Built-in Forge API (LLM inference)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- MySQL or TiDB database

### Installation

```bash
pnpm install
```

### Database Setup

```bash
pnpm db:push
```

### Development

```bash
pnpm dev
```

## 环境变量说明

本项目运行依赖以下环境变量，需自行在部署平台配置：

| 变量名 | 用途 | 是否必填 |
|--------|------|----------|
| `DATABASE_URL` | MySQL/TiDB 数据库连接字符串 | 必填 |
| `JWT_SECRET` | Session Cookie 签名密钥 | 必填 |
| `VITE_APP_ID` | Manus OAuth 应用 ID | 必填（使用 Manus Auth） |
| `OAUTH_SERVER_URL` | Manus OAuth 后端地址 | 必填（使用 Manus Auth） |
| `VITE_OAUTH_PORTAL_URL` | Manus 登录门户地址（前端） | 必填（使用 Manus Auth） |
| `BUILT_IN_FORGE_API_URL` | Manus 内置 API 地址（LLM、存储等） | 必填 |
| `BUILT_IN_FORGE_API_KEY` | Manus 内置 API 鉴权 Key（服务端） | 必填 |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus 内置 API 鉴权 Key（前端） | 必填 |
| `VITE_FRONTEND_FORGE_API_URL` | Manus 内置 API 地址（前端） | 必填 |
| `OWNER_OPEN_ID` | 项目所有者 Open ID（用于通知） | 可选 |
| `OWNER_NAME` | 项目所有者姓名 | 可选 |

> **注意：** 本项目基于 [Manus](https://manus.im) 平台构建，上述 `BUILT_IN_FORGE_API_*` 和 OAuth 相关变量由 Manus 平台自动注入。如需在其他平台独立部署，需替换对应的 LLM 服务（如 OpenAI API）和 OAuth 服务。

## Project Structure

```
client/
  src/
    pages/Home.tsx        ← Main UI (input + output)
    components/           ← Reusable UI components
server/
  routers.ts              ← tRPC procedures
  prompts.ts              ← LLM prompt templates
  db.ts                   ← Database query helpers
drizzle/
  schema.ts               ← Database schema
```

## License

Internal use only. Built for Bain & Company commercial due diligence workflows.
