import fetch from "node-fetch";
import * as fs from "node:fs";
import * as path from "node:path";
import { URL } from "node:url";
import { load } from "cheerio";
import { pipeline } from "node:stream";
import { promisify } from "node:util";

const streamPipeline = promisify(pipeline);

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
  const res = await fetch(u);
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
}

/**
 * 抓取页面中的所有图片链接并并发下载到本地。
 * 解析范围：<img> 的 src 与 srcset（忽略 data: 内联图片）。
 * 并发：使用固定数量的“工作协程”拉取队列。
 * @param {string} baseUrl 页面 URL
 * @param {string} [outDir='images'] 输出目录
 * @returns {Promise<void>}
 */
async function crawlImages(baseUrl, outDir = "images") {
  ensureDir(outDir);
  const pageRes = await fetch(baseUrl);
  if (!pageRes.ok) throw new Error(`Fetch page failed: ${pageRes.status}`);
  const html = await pageRes.text();
  const $ = load(html);
  const urls = new Set();

  // 提取 <img> 的 src 属性并标准化为绝对 URL
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        const abs = new URL(src, baseUrl).href;
        if (!abs.startsWith("data:")) urls.add(abs);
      } catch {}
    }
    // 解析 srcset：可能包含多个 URL（以逗号分隔，后带密度说明如 2x）
    const srcset = $(el).attr("srcset");
    if (srcset) {
      srcset.split(",").forEach(part => {
        const urlPart = part.trim().split(" ")[0];
        if (urlPart) {
          try {
            const abs2 = new URL(urlPart, baseUrl).href;
            if (!abs2.startsWith("data:")) urls.add(abs2);
          } catch {}
        }
      });
    }
  });

  const list = [...urls];
  console.log(`Found ${list.length} image(s).`);
  const usedNames = new Set();

  // 简单的固定并发控制：启动 5 个“工作协程”
  const concurrency = 5;
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < list.length) {
      const i = index++;
      const u = list[i];
      try {
        await downloadImage(u, outDir, usedNames);
      } catch (e) {
        console.error(`Failed: ${u}`, e.message || e);
      }
    }
  });
  await Promise.all(workers);
  console.log("All done.");
}

// 支持通过命令行传入目标页面 URL；不传参数时使用默认示例站点
// 解析命令行：第一个非 -- 开头的是目标 URL，其余为参数
const argvArgs = process.argv.slice(2);
const targetArg = argvArgs.find(a => !a.startsWith("--")) || "http://www.shixian.xyz";
const opts = parseArgs(argvArgs.filter(a => a.startsWith("--")));
crawlImagesWithPagination(targetArg, opts);

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

async function resolvePages(baseUrl) {
  // 优先使用 --pagePattern，如 https://site.com/page/{page}
  if (opts.pagePattern) {
    const start = Number(opts.startPage || 1);
    const end = Number(opts.endPage || (start + Number(opts.maxPages || 10) - 1));
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
      const res = await fetch(current, { headers: defaultHeaders() });
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
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < list.length) {
      const i = index++;
      const u = list[i];
      try {
        await downloadImage(u, outDir, usedNames);
      } catch (e) {
        console.error(`Failed: ${u}`, e.message || e);
      }
    }
  });
  await Promise.all(workers);
}

async function crawlImagesWithPagination(baseUrl, opts) {
  const outDir = opts.outDir || "images";
  ensureDir(outDir);
  const urls = new Set();
  const pages = await resolvePages(baseUrl);
  console.log(`Planned to crawl ${pages.length} page(s).`);
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    console.log(`Fetching page ${i + 1}/${pages.length}: ${pageUrl}`);
    const pageRes = await fetch(pageUrl, { headers: defaultHeaders() });
    if (!pageRes.ok) {
      console.error(`Fetch page failed: ${pageRes.status} ${pageRes.statusText}`);
      continue;
    }
    const html = await pageRes.text();
    const $ = load(html);
    extractImages($, pageUrl, urls);
    await delay(opts.pageDelayMs || 500);
  }
  const list = [...urls];
  console.log(`Found ${list.length} image(s) across pages.`);
  await downloadAll(list, outDir, opts);
  console.log("All done.");
}
