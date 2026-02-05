# Image Crawling - Backend

基于 NestJS 构建的图片抓取服务，提供 RESTful API 和实时 SSE 流式进度反馈。

## 🛠 技术栈

- **Framework**: [NestJS](https://nestjs.com/) (Express platform)
- **Crawling**:
  - [Puppeteer](https://pptr.dev/): 用于动态页面渲染和复杂反爬场景。
  - [Cheerio](https://cheerio.js.org/): 用于静态 HTML 解析（速度更快）。
- **Utilities**:
  - `fs-extra`: 文件系统操作。
  - `node-fetch`: HTTP 请求。
  - `class-validator`: DTO 验证。

## 📦 脚本命令

在根目录下使用 `pnpm --filter backend <command>` 或进入 `backend` 目录运行：

- `pnpm start:dev`: 启动开发服务器（热重载）。
- `pnpm build`: 编译 TypeScript 代码到 `dist` 目录。
- `pnpm start:prod`: 运行编译后的生产代码。
- `pnpm lint`: 运行 ESLint 检查。
- `pnpm format`: 格式化代码。

## 🔌 API 文档

### 1. 创建抓取任务

**Endpoint**: `POST /api/crawl`

**Body (JSON)**:
```json
{
  "url": "https://example.com/gallery",
  "options": {
    "outDir": "my-gallery",      // 输出目录名
    "concurrency": 5,            // 并发下载数
    "maxPages": 10,              // 最大抓取页数
    "pageDelayMs": 1000,         // 翻页延迟
    "fetchTimeoutMs": 15000,     // 请求超时
    "pagePattern": "",           // 可选：分页模式 url?p={page}
    "startPage": 1,              // 起始页码
    "endPage": 10,               // 结束页码
    "useHeadless": true,         // 是否使用 Puppeteer
    "headers": {                 // 自定义请求头
      "User-Agent": "Mozilla/5.0..."
    }
  }
}
```

### 2. 实时抓取进度流 (SSE)

**Endpoint**: `GET /api/crawl/stream`

**Query Parameters**: 与 POST `/api/crawl` 的 Body 字段一致（作为 URL 参数传递）。

**Response**: `text/event-stream`
- 返回实时的 JSON 格式日志数据。
- 事件类型包括：`plan` (计划), `page` (页面), `page_done` (页面完成), `complete` (全部完成), `error` (错误)。

### 3. 获取图片列表

**Endpoint**: `GET /api/images`

**Response**:
返回按目录分组的图片文件列表。

### 4. 删除图片

**Endpoint**: `DELETE /api/images`

**Body (JSON)**:
```json
{
  "name": "directory/filename.jpg" // 相对 storage 的路径
}
```

## 📂 目录结构

```
src/
├── common/             # 公共模块
│   └── constants.ts    # 常量定义 (STORAGE_ROOT)
├── crawl/              # 抓取核心模块
│   ├── dto/            # 数据传输对象定义
│   ├── crawl.controller.ts # 控制器
│   └── crawl.service.ts    # 抓取逻辑实现 (Puppeteer/Cheerio)
├── images/             # 图片管理模块
│   ├── dto/
│   ├── images.controller.ts
│   └── images.service.ts
├── app.module.ts       # 根模块
└── main.ts             # 入口文件
```

## ⚙️ 配置

- **端口**: 默认为 `3000`，可通过环境变量 `PORT` 修改。
- **存储目录**: 图片下载至项目根目录下的 `storage` 文件夹。
