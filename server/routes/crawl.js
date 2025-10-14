import { Router } from "express";
import * as path from "node:path";
import { crawlImagesWithPagination } from "../lib/crawl.js";

/**
 * 抓取路由模块
 * 提供 POST /api/crawl 接口：校验目标 URL 与选项后，触发分页抓取与下载。
 */
const router = Router();

/**
 * POST /api/crawl
 * 请求体：{ url: string, options?: { outDir, concurrency, maxPages, pageDelayMs, fetchTimeoutMs, pagePattern, startPage, endPage } }
 * 行为：
 *  - 校验并规范 URL（仅 http/https）；
 *  - 约束抓取选项范围以保护服务；
 *  - 调用抓取核心逻辑并返回结果（计数、保存列表、输出目录）。
 */
router.post("/api/crawl", async (req, res) => {
  try {
    const { url, options = {} } = req.body || {};
    if (!url) return res.status(400).json({ error: "必须提供 url" });

    // 只允许 http/https，且确保 URL 可解析
    let target;
    try {
      target = new URL(url);
    } catch {
      return res.status(400).json({ error: "URL 无效" });
    }
    if (!/^https?:$/.test(target.protocol)) {
      return res.status(400).json({ error: "URL 协议必须为 http/https" });
    }

    // 合并并约束参数范围（防止过载）
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

export default router;
