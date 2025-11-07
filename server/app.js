/**
 * 应用入口（Web 服务）
 * 职责：
 *  - 初始化 Express 与通用中间件（JSON 解析、静态资源）；
 *  - 挂载路由模块与统一错误处理中间件；
 *  - 启动 HTTP 服务并输出中文日志。
 */
import express from "express";
import * as path from "node:path";
import {STORAGE_ROOT, ensureDir} from "./lib/config.js";
import indexRouter from "./routes/index.js";
import crawlRouter from "./routes/crawl.js";
import imagesRouter from "./routes/images.js";
import {notFound, errorHandler} from "./middlewares/errors.js";
import open from "open";

// ============ Web 服务 ============
// 确保 storage 根目录存在（供下载与列表使用）
ensureDir(STORAGE_ROOT);
const app = express();
// 限制 JSON 请求体大小（避免异常大请求）
app.use(express.json({limit: "200kb"}));
// 为视图目录提供静态资源服务（CSS/JS）
app.use(express.static(path.resolve("views"), {maxAge: "1h", etag: true}));
// 静态资源：图片目录与视图页面
// 提供整个 storage 目录的静态访问，便于前端访问各子目录
app.use("/storage", express.static(STORAGE_ROOT, {maxAge: "1d", etag: true}));
// 路由：首页 + API
app.use("/", indexRouter);
app.use(crawlRouter);
app.use(imagesRouter);

// 路由逻辑已拆分至 ./routes

// 404 与错误处理（应在所有路由之后）
app.use(notFound);
app.use(errorHandler);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`服务器已启动：${url}`);
    // 启动后，自动打开浏览器
    const openOpts = {wait: false};
    void open(url, {...openOpts, app: {name: "chrome"}});
});
