# Image Crawling (图片抓取器)

一个基于现代 Web 技术栈构建的图片抓取工具，采用前后端分离架构。后端使用 NestJS 提供强大的抓取能力（支持静态页面解析和 Headless 浏览器渲染），前端使用 React + Ant Design 提供直观的用户界面。

## ✨ 功能特性

- **多模式抓取**：
  - 自动识别“下一页”（支持 `rel=next`、`.next` 等常见模式）。
  - 自定义分页模式（支持 `url?page={page}` 占位符）。
- **高性能下载**：
  - 支持并发下载，可配置并发数。
  - 支持 Base64 图片自动保存。
- **反爬虫应对**：
  - 内置 Puppeteer (Headless Chrome)，可处理动态渲染页面。
  - 支持自定义请求头（User-Agent, Cookie, Authorization）。
  - 可配置请求延迟和超时时间。
- **现代化 UI**：
  - 实时进度反馈（基于 SSE 技术）。
  - 图片预览网格与大图查看。
  - 已下载图片管理（分组浏览、删除）。
  - 深色/浅色主题切换。

## 🛠 技术栈

### Backend (后端)
- **Framework**: [NestJS](https://nestjs.com/)
- **Crawling**: [Puppeteer](https://pptr.dev/), [Cheerio](https://cheerio.js.org/)
- **Language**: TypeScript

### Frontend (前端)
- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **UI Library**: [Ant Design](https://ant.design/), [Tailwind CSS v4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)

## 🚀 快速开始

### 前置要求
- Node.js >= 18
- pnpm >= 9 (本项目使用 pnpm workspace)

### 安装依赖

在项目根目录下运行：

```bash
pnpm install
```

### 启动开发环境

你需要同时启动后端和前端服务。建议在两个终端窗口中分别运行：

**终端 1 (后端服务):**
```bash
pnpm --filter backend start:dev
```
后端服务默认运行在 `http://localhost:3000`。

**终端 2 (前端界面):**
```bash
pnpm --filter frontend dev
```
前端服务默认运行在 `http://localhost:5173`。

打开浏览器访问 `http://localhost:5173` 即可开始使用。

## 📂 项目结构

```
.
├── backend/                # 后端 NestJS 项目
│   ├── src/
│   │   ├── crawl/          # 抓取模块 (Controller, Service)
│   │   ├── images/         # 图片管理模块
│   │   └── common/         # 公共常量与工具
│   └── storage/            # 图片下载目录 (运行时生成)
├── frontend/               # 前端 React 项目
│   ├── src/
│   │   ├── api/            # API 请求封装
│   │   ├── components/     # UI 组件
│   │   ├── pages/          # 页面组件
│   │   └── store/          # 状态管理
│   └── vite.config.ts      # Vite 配置 (包含代理设置)
├── package.json            # Workspace 配置
└── pnpm-workspace.yaml     # Workspace 定义
```

## 📝 开发规范

本项目配置了 Husky + Commitlint 进行代码规范检查：
- **Pre-commit**: 提交前自动运行 ESLint 检查前后端代码。
- **Commit-msg**: 检查提交信息是否符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## 📄 许可证

UNLICENSED
