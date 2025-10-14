import fetch from "node-fetch";
import * as fs from "node:fs";
import * as path from "node:path";
import { URL } from "node:url";
import { load } from "cheerio";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { STORAGE_ROOT, ensureDir } from "./config.js";

const streamPipeline = promisify(pipeline);

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

function filenameFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const base = path.basename(p);
    return base || "image";
  } catch {
    return "image";
  }
}

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
  console.log(`已保存：${final}`);
  return final;
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

function findNextUrl($, currentUrl) {
  const relNext = $("a[rel='next']").attr("href");
  if (relNext) return new URL(relNext, currentUrl).href;
  const classNext = $("a.next, .pagination a.next").attr("href");
  if (classNext) return new URL(classNext, currentUrl).href;
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

async function resolvePages(baseUrl, opts = {}) {
  if (opts.pagePattern) {
    const start = Number(opts.startPage || 1);
    const end = Number(opts.endPage || start + Number(opts.maxPages || 10) - 1);
    const list = [];
    for (let p = start; p <= end; p++) {
      list.push(opts.pagePattern.replace("{page}", String(p)));
    }
    return list;
  }
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
      if (nextOrigin !== origin) break;
      current = next;
      await delay(opts.pageDelayMs || 500);
    } catch {
      break;
    }
  }
  return pages;
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
        console.error(`下载失败：${u}`, e.message || e);
      }
    }
  });
  await Promise.all(workers);
  return saved;
}

export async function crawlImagesWithPagination(baseUrl, opts) {
  const outDirRel = opts.outDir || "images";
  const outDir = path.isAbsolute(outDirRel)
    ? outDirRel
    : path.join(STORAGE_ROOT, outDirRel);
  ensureDir(STORAGE_ROOT);
  ensureDir(outDir);
  const urls = new Set();
  const pages = await resolvePages(baseUrl, opts);
  console.log(`计划抓取 ${pages.length} 页。`);
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    console.log(`抓取第 ${i + 1}/${pages.length} 页：${pageUrl}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Number(opts.fetchTimeoutMs || 15000));
    const pageRes = await fetch(pageUrl, { headers: defaultHeaders(), signal: controller.signal });
    clearTimeout(t);
    if (!pageRes.ok) {
      console.error(
        `抓取页面失败：${pageRes.status} ${pageRes.statusText}`
      );
      continue;
    }
    const html = await pageRes.text();
    const $ = load(html);
    extractImages($, pageUrl, urls);
    await delay(opts.pageDelayMs || 500);
  }
  const list = [...urls];
  console.log(`已发现 ${list.length} 张图片。`);
  const saved = await downloadAll(list, outDir, opts);
  console.log("全部完成。");
  return {
    count: list.length,
    saved,
    outDir: path.relative(process.cwd(), outDir),
  };
}