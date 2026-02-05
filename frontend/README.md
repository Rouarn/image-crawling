# Image Crawling - Frontend

基于 React 19 和 Vite 构建的现代化前端应用，为图片抓取工具提供直观的用户界面。

## 🛠 技术栈

- **Core**: React 19, TypeScript
- **Build**: Vite 6, SWC
- **UI Framework**: Ant Design 5 (CSS-in-JS)
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Routing**: React Router v7
- **Linting**: ESLint 9, Prettier

## 📦 脚本命令

在根目录下使用 `pnpm --filter frontend <command>` 或进入 `frontend` 目录运行：

- `pnpm dev`: 启动开发服务器 (默认端口 5173)。
- `pnpm build`: 构建生产环境代码。
- `pnpm preview`: 预览构建后的生产代码。
- `pnpm lint`: 运行 ESLint 检查。

## 🔧 配置说明

### 代理配置 (Proxy)
在 `vite.config.ts` 中配置了开发环境代理，将 API 请求转发至后端：
- `/api` -> `http://localhost:3000`
- `/storage` -> `http://localhost:3000`

### 别名配置 (Alias)
- `@/*` -> `src/*`

## 📂 目录结构

```
src/
├── api/            # API 请求函数封装 (Axios)
├── assets/         # 静态资源 (图片, SVG)
├── components/     # 组件
│   ├── business/   # 业务组件 (如抓取表单, 图片网格)
│   └── ui/         # 通用 UI 组件
├── layouts/        # 页面布局组件
├── pages/          # 路由页面 (Home)
├── router/         # 路由配置
├── store/          # Zustand 状态管理 (Theme, Images)
├── styles/         # 全局样式与 Tailwind 指令
├── utils/          # 工具函数
└── App.tsx         # 根组件
```

## ✨ 主要功能

- **抓取配置表单**：支持配置 URL、并发数、超时、分页模式等。
- **实时日志终端**：通过 Server-Sent Events (SSE) 实时展示后端抓取进度。
- **图片画廊**：
  - 瀑布流/网格展示已下载图片。
  - 支持按目录分组浏览。
  - 图片预览与大图查看。
  - 删除图片功能。
- **深色模式**：完整支持亮色/深色主题切换。
