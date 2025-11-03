/**
 * 抓取与下载核心逻辑模块
 * 职责：分页解析、图片 URL 提取、并发下载与抓取协调。
 * 所有日志与错误信息均为中文，便于国内用户理解。
 */
import fetch from "node-fetch";
import * as fs from "node:fs";
import * as path from "node:path";
import { URL } from "node:url";
import { load } from "cheerio";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { STORAGE_ROOT, ensureDir } from "./config.js";

const streamPipeline = promisify(pipeline);

/**
 * 统一请求头（模拟常见浏览器 UA）。
 * @param {string} type 请求类型，'image' 或 'html'
 * @param {string} referer 来源URL
 */
function defaultHeaders(type = "html", referer = "") {
  const common = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36 image-crawler",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  // 根据请求类型返回不同的请求头
  if (type === "image") {
    return {
      ...common,
      accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "sec-fetch-dest": "image",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "same-origin",
      referer: referer || "",
    };
  }

  // 默认为HTML请求头
  return {
    ...common,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

/**
 * 合并默认头与用户自定义头（用户优先）。
 * @param {object} base 默认头
 * @param {object|undefined} extra 用户提供头
 */
function mergeHeaders(base, extra) {
  const merged = { ...(base || {}) };
  if (extra && typeof extra === "object") {
    for (const [k, v] of Object.entries(extra)) {
      if (v == null) continue;
      merged[String(k).toLowerCase()] = String(v);
    }
  }
  return merged;
}

/**
 * 延时 Promise。
 * @param {number} ms 毫秒
 */
function delay(ms = 0) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * 根据 Content-Type 推断图片扩展名。
 * @param {string|null} ct Content-Type
 * @returns {string} 扩展名（不含点）
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
 * 从 URL 推断文件名（可能不含扩展名）。
 * @param {string} u 图片 URL
 * @returns {string} 文件名
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
 * 下载单张图片并避免文件名冲突。
 * @param {string} u 图片 URL
 * @param {string} outDir 输出目录
 * @param {Set<string>} usedNames 已使用文件名集合
 * @param {object} options 下载选项
 * @returns {Promise<string>} 保存的文件名
 */
async function downloadImage(u, outDir, usedNames, options) {
  const controller = new AbortController();
  const timeoutMs = options?.fetchTimeoutMs || 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  // 优先使用外部传入的页面 Referer，未提供则回退为图片源站
  const referer = options?.referer || new URL(u).origin;
  const headers = defaultHeaders("image", referer);

  // 合并用户自定义头
  const finalHeaders = mergeHeaders(headers, options?.headers);

  const res = await fetch(u, {
    headers: finalHeaders,
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

/**
 * 从页面中提取图片 URL（包含 img/src 与 srcset）。
 * @param {*} $ cheerio 实例
 * @param {string} pageUrl 页面 URL（用于补全相对地址）
 * @param {Set<string>} urlsSet 去重集合
 */
function extractImages($, pageUrl, urlsSet) {
  const toAbs = u => {
    try {
      return new URL(u, pageUrl).href;
    } catch {
      return null;
    }
  };
  const pickFromSrcset = srcset => {
    // 选择最大尺寸候选（按 w/x 值）
    const parts = String(srcset || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    let best = { url: null, score: -1 };
    for (const p of parts) {
      const [u, size] = p.split(/\s+/);
      let score = 0;
      if (/\d+w/i.test(p))
        score = parseInt((p.match(/(\d+)w/i) || [0, 0])[1]) || 0;
      else if (/\d+(\.\d+)?x/i.test(p))
        score =
          Math.round(
            parseFloat((p.match(/(\d+(?:\.\d+)?)x/i) || [0, 0])[1]) * 100
          ) || 0;
      const abs = toAbs(u);
      if (abs && !abs.startsWith("data:") && score >= best.score)
        best = { url: abs, score };
    }
    return best.url;
  };

  // img: 支持 src 与常见懒加载属性
  $("img").each((_, el) => {
    const $el = $(el);
    const candidates = [
      $el.attr("src"),
      $el.attr("data-src"),
      $el.attr("data-original"),
      $el.attr("data-lazy"),
      $el.attr("data-url"),
      $el.attr("data-actualsrc"),
    ];
    for (const c of candidates) {
      if (!c) continue;
      const abs = toAbs(c);
      if (abs && !abs.startsWith("data:")) {
        urlsSet.add(abs);
        break;
      }
    }
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    const best = srcset ? pickFromSrcset(srcset) : null;
    if (best) urlsSet.add(best);
  });

  // picture/source: 选择最佳 srcset
  $("picture").each((_, pic) => {
    const $pic = $(pic);
    let bestUrl = null;
    $pic.find("source").each((_, s) => {
      const u = pickFromSrcset($(s).attr("srcset") || "");
      if (u) bestUrl = u;
    });
    if (bestUrl) urlsSet.add(bestUrl);
    const img = $pic.find("img").attr("src");
    const abs = img ? toAbs(img) : null;
    if (abs && !abs.startsWith("data:")) urlsSet.add(abs);
  });

  // noscript 中的图片（部分站点把原图放在 noscript）
  $("noscript").each((_, ns) => {
    const html = $(ns).html() || "";
    if (!html.trim()) return;
    try {
      const $x = load(html);
      $x("img").each((__, el) => {
        const src = $x(el).attr("src");
        const abs = src ? toAbs(src) : null;
        if (abs && !abs.startsWith("data:")) urlsSet.add(abs);
        const ss = $x(el).attr("srcset");
        const best = ss ? pickFromSrcset(ss) : null;
        if (best) urlsSet.add(best);
      });
    } catch {}
  });

  // 内联样式背景图（仅限 style 属性）
  $("*[style]").each((_, el) => {
    const style = String($(el).attr("style") || "");
    const m = style.match(/background-image\s*:\s*url\((['"]?)([^)'"]+)\1\)/i);
    if (m && m[2]) {
      const abs = toAbs(m[2]);
      if (abs) urlsSet.add(abs);
    }
  });

  // 非 img 元素上的 data-src / data-original（例如容器节点）
  $('[data-src], [data-original]').each((_, el) => {
    const $el = $(el);
    const candidates = [$el.attr('data-src'), $el.attr('data-original')];
    for (const c of candidates) {
      if (!c) continue;
      const abs = toAbs(c);
      if (abs && !abs.startsWith('data:')) { urlsSet.add(abs); break; }
    }
  });
}

/**
 * 解析下一页 URL（rel=next / 类名 next / 文本匹配）。
 */
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

/**
 * 解析分页列表：优先使用 pagePattern，否则跟随“下一页”。
 * @param {string} baseUrl 起始页面
 * @param {*} opts 抓取选项
 * @returns {Promise<string[]>} 页面列表
 */
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
        headers: mergeHeaders(defaultHeaders("html", current), opts.headers),
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

/**
 * 并发下载图片列表。
 * @param {string[]} list 图片 URL 列表
 * @param {string} outDir 输出目录
 * @param {*} opts 包含并发数
 * @returns {Promise<Array<{url:string,file:string}>>}
 */
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
        const name = await downloadImage(u, outDir, usedNames, opts);
        saved.push({ url: u, file: name });
      } catch (e) {
        console.error(`下载失败：${u}`, e.message || e);
      }
    }
  });
  await Promise.all(workers);
  return saved;
}

/**
 * 协调抓取流程（分页解析 → 图片提取 → 并发下载）。
 * @param {string} baseUrl 目标页面 URL
 * @param {*} opts 抓取选项
 */
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
  if (typeof opts.onProgress === "function") {
    try {
      opts.onProgress({ type: "plan", pages: pages.length });
    } catch {}
  }
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    console.log(`抓取第 ${i + 1}/${pages.length} 页：${pageUrl}`);
    if (typeof opts.onProgress === "function") {
      try {
        opts.onProgress({
          type: "page",
          index: i + 1,
          total: pages.length,
          url: pageUrl,
        });
      } catch {}
    }
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      Number(opts.fetchTimeoutMs || 15000)
    );
    let pageRes;
    try {
      pageRes = await fetch(pageUrl, {
        headers: mergeHeaders(defaultHeaders("html", pageUrl), opts.headers),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(t);
      console.error("抓取页面异常：", e.message || e);
      if (opts.useHeadless) {
        console.log("页面抓取异常，使用 headless 渲染尝试提取图片……");
        if (typeof opts.onProgress === "function") {
          try {
            opts.onProgress({
              type: "fallback",
              reason: "fetch_error",
              url: pageUrl,
            });
          } catch {}
        }
        try {
          const more = await extractImagesHeadless(pageUrl, opts);
          for (const u of more) urls.add(u);
          if (typeof opts.onProgress === "function") {
            try {
              opts.onProgress({
                type: "page_done",
                index: i + 1,
                total: pages.length,
                added: more.length,
              });
            } catch {}
          }
        } catch (e2) {
          console.error("headless 渲染提取失败：", e2.message || e2);
        }
      }
      await delay(opts.pageDelayMs || 500);
      continue;
    }
    clearTimeout(t);
    if (!pageRes.ok) {
      console.error(`抓取页面失败：${pageRes.status} ${pageRes.statusText}`);
      if (opts.useHeadless) {
        console.log("抓取失败，使用 headless 渲染尝试提取图片……");
        if (typeof opts.onProgress === "function") {
          try {
            opts.onProgress({
              type: "fallback",
              reason: `http_${pageRes.status}`,
              url: pageUrl,
            });
          } catch {}
        }
        try {
          const more = await extractImagesHeadless(pageUrl, opts);
          for (const u of more) urls.add(u);
          if (typeof opts.onProgress === "function") {
            try {
              opts.onProgress({
                type: "page_done",
                index: i + 1,
                total: pages.length,
                added: more.length,
              });
            } catch {}
          }
        } catch (e2) {
          console.error("headless 渲染提取失败：", e2.message || e2);
        }
      }
      await delay(opts.pageDelayMs || 500);
      continue;
    }
    const html = await pageRes.text();
    const $ = load(html);
    const before = urls.size;
    extractImages($, pageUrl, urls);
    if (typeof opts.onProgress === "function") {
      const after = urls.size;
      try {
        opts.onProgress({
          type: "page_done",
          index: i + 1,
          total: pages.length,
          added: after - before,
        });
      } catch {}
    }
    await delay(opts.pageDelayMs || 500);
  }
  const list = [...urls];
  console.log(`已发现 ${list.length} 张图片。`);
  if (typeof opts.onProgress === "function") {
    try {
      opts.onProgress({ type: "discover", count: list.length });
    } catch {}
  }
  const saved = await downloadAll(list, outDir, { ...opts, referer: baseUrl });
  console.log("全部完成。");
  if (typeof opts.onProgress === "function") {
    try {
      opts.onProgress({
        type: "complete",
        saved: saved.length,
        outDir: path.relative(process.cwd(), outDir),
      });
    } catch {}
  }
  return {
    count: list.length,
    saved,
    outDir: path.relative(process.cwd(), outDir),
  };
}

/**
 * 使用 headless 浏览器渲染页面并提取图片（适合动态页面与风控场景）。
 */
async function extractImagesHeadless(pageUrl, opts = {}) {
  let puppeteer;
  try {
    const mod = await import("puppeteer");
    puppeteer = mod.default || mod;
  } catch (e) {
    console.error(
      "未安装 puppeteer，无法进行 headless 渲染。请安装依赖后重试。",
      e.message || e
    );
    return [];
  }
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (e1) {
    try {
      browser = await puppeteer.launch({
        headless: "new",
        channel: "chrome",
        args: ["--disable-blink-features=AutomationControlled"],
      });
    } catch (e2) {
      try {
        browser = await puppeteer.launch({
          headless: "new",
          channel: "msedge",
          args: ["--disable-blink-features=AutomationControlled"],
        });
      } catch (e3) {
        console.error("无法启动浏览器：", e3.message || e3);
        return [];
      }
    }
  }
  try {
    const page = await browser.newPage();
    const ua =
      (opts.headers &&
        (opts.headers["user-agent"] || opts.headers["User-Agent"])) ||
      defaultHeaders()["user-agent"];
    await page.setUserAgent(ua);
    const baseExtra = {
      referer: pageUrl,
      accept: defaultHeaders().accept,
      "accept-language": defaultHeaders()["accept-language"],
    };
    const extra = mergeHeaders(baseExtra, opts.headers);
    // puppeteer 的 setExtraHTTPHeaders 需要原始大小写键名，简单映射即可
    await page.setExtraHTTPHeaders({
      referer: extra["referer"],
      accept: extra["accept"],
      "accept-language": extra["accept-language"],
      ...(extra["cookie"] ? { cookie: extra["cookie"] } : {}),
      ...(extra["authorization"]
        ? { authorization: extra["authorization"] }
        : {}),
    });
    try {
      await page.setViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        Object.defineProperty(navigator, "languages", {
          get: () => ["zh-CN", "zh", "en"],
        });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
        window.chrome = { runtime: {} };
      });
    } catch {}
    await page.goto(pageUrl, {
      waitUntil: "networkidle2",
      timeout: Number(opts.fetchTimeoutMs || 30000),
    });
    // 滚动触发懒加载
    const steps = Number(opts.scrollSteps || 12);
    const waitMs = Number(opts.scrollWaitMs || 500);
    for (let i = 0; i < steps; i++) {
      await page.evaluate(ratio => {
        const h = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const y = Math.round(ratio * h);
        window.scrollTo({ top: y, behavior: "instant" });
      }, (i + 1) / steps);
      if (typeof opts.onProgress === "function") {
        try {
          opts.onProgress({ type: "scroll", step: i + 1, total: steps });
        } catch {}
      }
      await delay(waitMs);
    }

    const urls = await page.evaluate(() => {
      const set = new Set();
      const absUrl = u => {
        try {
          return new URL(u, location.href).href;
        } catch {
          return null;
        }
      };
      const pickFromSrcset = srcset => {
        const parts = String(srcset || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
        let best = { url: null, score: -1 };
        for (const p of parts) {
          const u = p.split(/\s+/)[0];
          let score = 0;
          const mW = p.match(/(\d+)w/i);
          const mX = p.match(/(\d+(?:\.\d+)?)x/i);
          if (mW) score = parseInt(mW[1]) || 0;
          else if (mX) score = Math.round(parseFloat(mX[1]) * 100) || 0;
          const abs = absUrl(u);
          if (abs && !abs.startsWith("data:") && score >= best.score)
            best = { url: abs, score };
        }
        return best.url;
      };
      // img 懒加载属性
      document.querySelectorAll("img").forEach(img => {
        const candidates = [
          img.getAttribute("src"),
          img.getAttribute("data-src"),
          img.getAttribute("data-original"),
          img.getAttribute("data-lazy"),
          img.getAttribute("data-url"),
          img.getAttribute("data-actualsrc"),
        ];
        for (const c of candidates) {
          if (!c) continue;
          const abs = absUrl(c);
          if (abs && !abs.startsWith("data:")) {
            set.add(abs);
            break;
          }
        }
        const best = pickFromSrcset(
          img.getAttribute("srcset") || img.getAttribute("data-srcset") || ""
        );
        if (best) set.add(best);
      });
      // picture/source
      document.querySelectorAll("picture").forEach(pic => {
        let best = null;
        pic.querySelectorAll("source").forEach(s => {
          const u = pickFromSrcset(s.getAttribute("srcset") || "");
          if (u) best = u;
        });
        if (best) set.add(best);
        const img = pic.querySelector("img");
        const abs =
          img && img.getAttribute("src")
            ? absUrl(img.getAttribute("src"))
            : null;
        if (abs && !abs.startsWith("data:")) set.add(abs);
      });
      // noscript
      document.querySelectorAll("noscript").forEach(ns => {
        const html = ns.innerHTML || "";
        if (!html.trim()) return;
        const div = document.createElement("div");
        div.innerHTML = html;
        div.querySelectorAll("img").forEach(img => {
          const abs = img.getAttribute("src")
            ? absUrl(img.getAttribute("src"))
            : null;
          if (abs && !abs.startsWith("data:")) set.add(abs);
          const best = pickFromSrcset(img.getAttribute("srcset") || "");
          if (best) set.add(best);
        });
      });
      document.querySelectorAll("*").forEach(el => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const m = bg.match(/url\((['"]?)([^)"']+)\1\)/i);
          if (m && m[2]) {
            const abs = absUrl(m[2]);
            if (abs) set.add(abs);
          }
        }
      });
      return Array.from(set);
    });
    return urls;
  } catch (e) {
    console.error("headless 渲染提取失败：", e.message || e);
    return [];
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}
