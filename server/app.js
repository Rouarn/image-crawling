import fetch from "node-fetch";
import * as fs from "node:fs";
import * as path from "node:path";
import { URL } from "node:url";
import { load } from "cheerio";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import express from "express";

const streamPipeline = promisify(pipeline);
// 统一存储父级目录
const STORAGE_ROOT = path.resolve("storage");

/**
 * 确保输出目录存在（递归创建）。
 * @param {string} dir 目录路径
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 根据 Content-Type 推断常见图片扩展名。
 * @param {string|null} ct 响应头的 Content-Type
 * @returns {string} 扩展名（不含点），无法推断返回空字符串
 */
function extFromContentType(ct) {
  if (!ct) return "";
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("bmp")) return "bmp";
  return "";
}

/**
 * 从 URL 推断文件名；若无路径或无法解析则返回 "image"。
 * @param {string} u 图片 URL
 * @returns {string} 文件名（可能不含扩展名）
 */
function filenameFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const base = path.basename(p);
    return base || "image";
  } catch {
    return "image";
  }
}

/**
 * 下载单张图片到指定目录，避免与已存在文件名冲突。
 * 逻辑：
 *   1) 请求图片 URL，校验响应状态与是否有 body；
 *   2) 基于 URL 路径推断文件名；无扩展名时根据 Content-Type 追加；
 *   3) 若重名则依次添加序号（-1、-2…），保证唯一；
 *   4) 使用 stream.pipeline 将响应体写入磁盘。
 * @param {string} u 图片 URL
 * @param {string} outDir 输出目录
 * @param {Set<string>} usedNames 已使用的文件名集合（用于去重）
 * @throws {Error} 当响应不正常或写入失败
 */
async function downloadImage(u, outDir, usedNames) {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(u, {
    headers: defaultHeaders(),
    signal: controller.signal,
  });
  clearTimeout(t);
  if (!res.ok || !res.body)
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  let name = filenameFromUrl(u);
  const hasExt = path.extname(name);
  const ct = res.headers.get("content-type");
  const guessedExt = extFromContentType(ct);
  if (!hasExt && guessedExt) {
    name = `${name}.${guessedExt}`;
  }
  // 处理重名：若已使用则在文件名后追加递增序号
  let final = name;
  let i = 1;
  while (usedNames.has(final)) {
    const parsed = path.parse(name);
    final = `${parsed.name}-${i}${parsed.ext}`;
    i++;
  }
  usedNames.add(final);
  const outPath = path.join(outDir, final);
  await streamPipeline(res.body, fs.createWriteStream(outPath));
  console.log(`Saved: ${final}`);
  return final;
}

// ============ Web Server ============
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
    if (!url) return res.status(400).json({ error: "url is required" });
    // 校验 URL，只允许 http/https
    let target;
    try {
      target = new URL(url);
    } catch {
      return res.status(400).json({ error: "invalid url" });
    }
    if (!/^https?:$/.test(target.protocol)) {
      return res.status(400).json({ error: "url protocol must be http/https" });
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
  res.status(404).json({ error: "Not Found" });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || "Internal Server Error" });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening: http://localhost:${PORT}`);
});

function defaultHeaders() {
  return {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36 image-crawler",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

function delay(ms = 0) {
  return new Promise(res => setTimeout(res, ms));
}

function parseArgs(argv = []) {
  const out = {};
  for (const a of argv) {
    if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.replace(/^--/, "").split("=");
      out[k] = v;
    }
  }
  // 默认值
  out.concurrency = Number(out.concurrency || 5);
  out.maxPages = Number(out.maxPages || 10);
  out.pageDelayMs = Number(out.pageDelayMs || 500);
  out.outDir = out.outDir || "images";
  return out;
}

async function resolvePages(baseUrl, opts = {}) {
  // 优先使用 --pagePattern，如 https://site.com/page/{page}
  if (opts.pagePattern) {
    const start = Number(opts.startPage || 1);
    const end = Number(opts.endPage || start + Number(opts.maxPages || 10) - 1);
    const list = [];
    for (let p = start; p <= end; p++) {
      list.push(opts.pagePattern.replace("{page}", String(p)));
    }
    return list;
  }
  // 否则自动跟随“下一页”
  const pages = [];
  let current = baseUrl;
  const origin = new URL(baseUrl).origin;
  for (let i = 0; i < (opts.maxPages || 10); i++) {
    pages.push(current);
    try {
      const controller = new AbortController();
      const t = setTimeout(
        () => controller.abort(),
        Number(opts.fetchTimeoutMs || 15000)
      );
      const res = await fetch(current, {
        headers: defaultHeaders(),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) break;
      const html = await res.text();
      const $ = load(html);
      const next = findNextUrl($, current);
      if (!next) break;
      const nextOrigin = new URL(next).origin;
      if (nextOrigin !== origin) break; // 限制为同源
      current = next;
      await delay(opts.pageDelayMs || 500);
    } catch {
      break;
    }
  }
  return pages;
}

function findNextUrl($, currentUrl) {
  // rel=next 优先
  const relNext = $("a[rel='next']").attr("href");
  if (relNext) return new URL(relNext, currentUrl).href;
  // 类名 next
  const classNext = $("a.next, .pagination a.next").attr("href");
  if (classNext) return new URL(classNext, currentUrl).href;
  // 文本匹配常见“下一页”
  let candidate = null;
  $("a").each((_, el) => {
    const text = ($(el).text() || "").trim().toLowerCase();
    if (/^(next|下一页|下一頁|›|»|>)$/.test(text)) {
      const href = $(el).attr("href");
      if (href && !candidate) candidate = new URL(href, currentUrl).href;
    }
  });
  return candidate;
}

function extractImages($, pageUrl, urlsSet) {
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        const abs = new URL(src, pageUrl).href;
        if (!abs.startsWith("data:")) urlsSet.add(abs);
      } catch {}
    }
    const srcset = $(el).attr("srcset");
    if (srcset) {
      srcset.split(",").forEach(part => {
        const urlPart = part.trim().split(" ")[0];
        if (urlPart) {
          try {
            const abs2 = new URL(urlPart, pageUrl).href;
            if (!abs2.startsWith("data:")) urlsSet.add(abs2);
          } catch {}
        }
      });
    }
  });
}

async function downloadAll(list, outDir, opts) {
  const usedNames = new Set();
  const concurrency = Number(opts.concurrency || 5);
  let index = 0;
  const saved = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < list.length) {
      const i = index++;
      const u = list[i];
      try {
        const name = await downloadImage(u, outDir, usedNames);
        saved.push({ url: u, file: name });
      } catch (e) {
        console.error(`Failed: ${u}`, e.message || e);
      }
    }
  });
  await Promise.all(workers);
  return saved;
}

async function crawlImagesWithPagination(baseUrl, opts) {
  // 将 outDir 解析到 storage 下（支持绝对路径透传）
  const outDirRel = opts.outDir || "images";
  const outDir = path.isAbsolute(outDirRel)
    ? outDirRel
    : path.join(STORAGE_ROOT, outDirRel);
  ensureDir(STORAGE_ROOT);
  ensureDir(outDir);
  const urls = new Set();
  const pages = await resolvePages(baseUrl, opts);
  console.log(`Planned to crawl ${pages.length} page(s).`);
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    console.log(`Fetching page ${i + 1}/${pages.length}: ${pageUrl}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Number(opts.fetchTimeoutMs || 15000));
    const pageRes = await fetch(pageUrl, { headers: defaultHeaders(), signal: controller.signal });
    clearTimeout(t);
    if (!pageRes.ok) {
      console.error(
        `Fetch page failed: ${pageRes.status} ${pageRes.statusText}`
      );
      continue;
    }
    const html = await pageRes.text();
    const $ = load(html);
    extractImages($, pageUrl, urls);
    await delay(opts.pageDelayMs || 500);
  }
  const list = [...urls];
  console.log(`Found ${list.length} image(s) across pages.`);
  const saved = await downloadAll(list, outDir, opts);
  console.log("All done.");
  return {
    count: list.length,
    saved,
    outDir: path.relative(process.cwd(), outDir),
  };
}
// 已在顶部导入 express，移除重复导入
