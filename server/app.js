import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { STORAGE_ROOT, ensureDir } from "./lib/config.js";
import { crawlImagesWithPagination } from "./lib/crawl.js";

// ============ Web 服务 ============
// 确保 storage 根目录存在
ensureDir(STORAGE_ROOT);
const app = express();
// 限制 JSON 请求体大小，避免异常大请求
app.use(express.json({ limit: "200kb" }));
// 为视图目录提供静态资源服务（CSS/JS）
app.use(express.static(path.resolve("views"), { maxAge: "1h", etag: true }));
// 静态资源：图片目录与视图页面
// 提供整个 storage 目录的静态访问，便于前端访问各子目录
app.use("/storage", express.static(STORAGE_ROOT, { maxAge: "1d", etag: true }));
app.get("/", (req, res) => {
  const filePath = path.join(process.cwd(), "views", "index.html");
  res.sendFile(filePath);
});

// API：触发抓取
app.post("/api/crawl", async (req, res) => {
  try {
    const { url, options = {} } = req.body || {};
    if (!url) return res.status(400).json({ error: "必须提供 url" });
    // 校验 URL，只允许 http/https
    let target;
    try {
      target = new URL(url);
    } catch {
      return res.status(400).json({ error: "URL 无效" });
    }
    if (!/^https?:$/.test(target.protocol)) {
      return res.status(400).json({ error: "URL 协议必须为 http/https" });
    }
    // 合并并约束参数范围
    const raw = Object.assign(
      {
        outDir: "images",
        concurrency: 5,
        maxPages: 10,
        pageDelayMs: 500,
        fetchTimeoutMs: 15000,
      },
      options
    );
    const opts = {
      outDir: path.isAbsolute(raw.outDir)
        ? path.basename(raw.outDir)
        : String(raw.outDir || "images"),
      concurrency: Math.max(1, Math.min(10, Number(raw.concurrency || 5))),
      maxPages: Math.max(1, Math.min(50, Number(raw.maxPages || 10))),
      pageDelayMs: Math.max(0, Math.min(2000, Number(raw.pageDelayMs || 500))),
      fetchTimeoutMs: Math.max(
        1000,
        Math.min(60000, Number(raw.fetchTimeoutMs || 15000))
      ),
      pagePattern: raw.pagePattern,
      startPage: raw.startPage,
      endPage: raw.endPage,
    };
    const result = await crawlImagesWithPagination(target.href, opts);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// API：列出已下载图片
app.get("/api/images", (req, res) => {
  try {
    const root = STORAGE_ROOT;
    ensureDir(root);
    const exts = new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
    ]);
    const groups = new Map();
    const pushFile = (relPath, relBase) => {
      const top = relBase ? relBase.split("/")[0] : "root";
      if (!groups.has(top)) groups.set(top, []);
      groups.get(top).push(relPath);
    };
    const walk = (dir, rel = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const abs = path.join(dir, ent.name);
        const relPath = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          walk(abs, relPath);
        } else {
          const ext = path.extname(ent.name).toLowerCase();
          if (exts.has(ext)) pushFile(relPath, rel);
        }
      }
    };
    walk(root);
    const result = Array.from(groups.entries()).map(([dir, files]) => ({
      dir,
      files: (files || []).sort((a, b) => a.localeCompare(b)),
    }));
    // 目录排序：root 优先，其余字典序
    result.sort((a, b) =>
      a.dir === "root" ? -1 : b.dir === "root" ? 1 : a.dir.localeCompare(b.dir)
    );
    const total = result.reduce((acc, g) => acc + g.files.length, 0);
    res.json({ groups: result, total });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// 404 与错误处理（应在所有路由之后）
app.use((req, res) => {
  res.status(404).json({ error: "未找到" });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || "服务器内部错误" });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器已启动：http://localhost:${PORT}`);
});
