import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { URL } from 'node:url';
import { load, CheerioAPI } from 'cheerio';
import { Element } from 'domhandler';
import { STORAGE_ROOT, ensureDir } from '../common/constants';
import { CreateCrawlDto } from './dto/create-crawl.dto';
import * as puppeteer from 'puppeteer';

// 如果 Node 环境类型中缺少全局 fetch 类型定义，则在此添加
declare global {
  function fetch(url: RequestInfo, init?: RequestInit): Promise<Response>;
}

@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);

  private defaultHeaders(type = 'html', referer = '') {
    const common = {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36 image-crawler',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    if (type === 'image') {
      return {
        ...common,
        accept:
          'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin',
        referer: referer || '',
      };
    }

    return {
      ...common,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  }

  private mergeHeaders(
    base: Record<string, string> | undefined,
    extra: Record<string, string> | undefined,
  ) {
    const merged: Record<string, string> = { ...(base || {}) };
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v == null) continue;
        merged[String(k).toLowerCase()] = String(v);
      }
    }
    return merged;
  }

  private delay(ms = 0) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private extFromContentType(ct: string | null) {
    if (!ct) return '';
    const type = ct.toLowerCase();
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
    if (type.includes('png')) return 'png';
    if (type.includes('gif')) return 'gif';
    if (type.includes('webp')) return 'webp';
    if (type.includes('svg')) return 'svg';
    if (type.includes('bmp')) return 'bmp';
    if (type.includes('avif')) return 'avif';
    if (type.includes('heic')) return 'heic';
    if (type.includes('tiff')) return 'tiff';
    if (type.includes('x-icon') || type.includes('vnd.microsoft.icon'))
      return 'ico';
    return '';
  }

  private filenameFromUrl(u: string) {
    try {
      if (u.startsWith('data:')) return 'base64_image';
      const p = new URL(u).pathname;
      const base = path.basename(p);
      // 移除 URL 参数等杂质
      const cleanBase = base.split(/[?#]/)[0];
      return cleanBase || 'image';
    } catch {
      return 'image';
    }
  }

  private async downloadImage(
    u: string,
    outDir: string,
    usedNames: Set<string>,
    options: CreateCrawlDto,
  ) {
    // 1. Handle Data URL (Base64 or Plain text)
    if (u.startsWith('data:')) {
      return this.saveDataUrl(u, outDir, usedNames);
    }

    // 2. 处理普通 URL
    const controller = new AbortController();
    const timeoutMs = Number(options?.fetchTimeoutMs || 60000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const referer = options?.headers?.referer || new URL(u).origin;
      const headers = this.defaultHeaders('image', referer);
      const finalHeaders = this.mergeHeaders(headers, options?.headers);

      // Node 18+ 原生支持 fetch
      const res = await fetch(u, {
        headers: finalHeaders,
        signal: controller.signal,
      });

      if (!res.ok)
        throw new Error(`HTTP 请求失败: ${res.status} ${res.statusText}`);

      // 先读取为 Buffer，这样我们可以检查内容并避免 Web Stream 兼容性问题
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 检查内容是否意外地是 Data URL 字符串 (某些反爬虫或特殊接口会返回这个)
      const possibleDataUrl = buffer.toString('utf8', 0, 100).trim();
      if (possibleDataUrl.startsWith('data:')) {
        const fullContent = buffer.toString('utf8');
        this.logger.warn(
          `检测到 URL ${u} 返回了 Data URL 字符串而非二进制数据，尝试解析...`,
        );
        return this.saveDataUrl(fullContent, outDir, usedNames);
      }

      const ct = res.headers.get('content-type');
      const guessedExt = this.extFromContentType(ct);

      let name = this.filenameFromUrl(u);
      const extInUrl = path.extname(name).toLowerCase();

      if (
        guessedExt &&
        (!extInUrl || !ct?.toLowerCase().includes(extInUrl.replace('.', '')))
      ) {
        if (
          extInUrl &&
          [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.webp',
            '.svg',
            '.avif',
            '.ico',
          ].includes(extInUrl)
        ) {
          name = name.replace(extInUrl, `.${guessedExt}`);
        } else if (!extInUrl) {
          name = `${name}.${guessedExt}`;
        }
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

      await fs.promises.writeFile(outPath, buffer);
      this.logger.log(`已保存: ${final}`);
      return final;
    } finally {
      clearTimeout(t);
    }
  }

  private async saveDataUrl(u: string, outDir: string, usedNames: Set<string>) {
    try {
      // 更加健壮的 Data URL 解析，支持多个参数
      const commaIndex = u.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('无效的 Data URL 格式: 缺少逗号');
      }

      const meta = u.substring(0, commaIndex);
      const rawData = u.substring(commaIndex + 1);
      const parts = meta.split(';');

      const contentType = parts[0].replace('data:', '') || 'image/png';
      const isBase64 = parts.includes('base64');

      let extension = this.extFromContentType(contentType);
      if (!extension) {
        extension = contentType.split('/')[1]?.split(/[+.]/)[0] || 'bin';
      }

      const buffer = isBase64
        ? Buffer.from(rawData, 'base64')
        : Buffer.from(decodeURIComponent(rawData));

      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const name = `data_${timestamp}_${random}`;
      let final = `${name}.${extension}`;
      let i = 1;

      while (usedNames.has(final)) {
        final = `${name}_${i}.${extension}`;
        i++;
      }
      usedNames.add(final);

      const outPath = path.join(outDir, final);
      await fs.promises.writeFile(outPath, buffer);
      this.logger.log(`已保存 DataURL: ${final} (${contentType})`);
      return final;
    } catch (e) {
      this.logger.error(
        `DataURL 保存失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }

  private extractImages($: CheerioAPI, pageUrl: string, urlsSet: Set<string>) {
    const toAbs = (u: string) => {
      try {
        return new URL(u, pageUrl).href;
      } catch {
        return null;
      }
    };
    const pickFromSrcset = (srcset: string) => {
      const parts = String(srcset || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      let best: { url: string | null; score: number } = {
        url: null,
        score: -1,
      };
      for (const p of parts) {
        const [u] = p.split(/\s+/);
        let score = 0;
        if (/\d+w/i.test(p))
          score = parseInt(String((p.match(/(\d+)w/i) || [0, 0])[1])) || 0;
        else if (/\d+(\.\d+)?x/i.test(p))
          score =
            Math.round(
              parseFloat(String((p.match(/(\d+(?:\.\d+)?)x/i) || [0, 0])[1])) *
                100,
            ) || 0;
        const abs = toAbs(u);
        if (abs && score >= best.score) best = { url: abs, score };
      }
      return best.url;
    };

    $('img').each((_: number, el: Element) => {
      const $el = $(el);
      const candidates = [
        $el.attr('data-original'),
        $el.attr('data-src'),
        $el.attr('data-lazy'),
        $el.attr('data-url'),
        $el.attr('data-actualsrc'),
        $el.attr('data-href'),
        $el.attr('data-lazy-src'),
        $el.attr('data-source'),
        $el.attr('original-src'),
        $el.attr('data-pic-base64'),
        $el.attr('data-lazy-load-src'),
        $el.attr('data-actual-src'),
        $el.attr('data-thumb'),
        $el.attr('data-full'),
        $el.attr('file'),
        $el.attr('zoomfile'),
        $el.attr('src'),
      ];
      for (const c of candidates) {
        if (!c) continue;
        const abs = toAbs(c);
        if (abs) {
          urlsSet.add(abs);
          break;
        }
      }
      const srcset = $el.attr('srcset') || $el.attr('data-srcset');
      const best = srcset ? pickFromSrcset(srcset) : null;
      if (best) urlsSet.add(best);
    });

    $('a').each((_: number, el: Element) => {
      const href = $(el).attr('href');
      if (
        href &&
        href.match(
          /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i,
        )
      ) {
        const abs = toAbs(href);
        if (abs) urlsSet.add(abs);
      }
    });

    $('picture').each((_: number, pic: Element) => {
      const $pic = $(pic);
      let bestUrl: string | null = null;
      $pic.find('source').each((_: number, s: Element) => {
        const u = pickFromSrcset($(s).attr('srcset') || '');
        if (u) bestUrl = u;
      });
      if (bestUrl) urlsSet.add(bestUrl);
      const img = $pic.find('img').attr('src');
      const abs = img ? toAbs(img) : null;
      if (abs) urlsSet.add(abs);
    });

    $('noscript').each((_: number, ns: Element) => {
      const html = $(ns).html() || '';
      if (!html.trim()) return;
      try {
        const $x = load(html);
        $x('img').each((__: number, el: Element) => {
          const src = $x(el).attr('src');
          const abs = src ? toAbs(src) : null;
          if (abs) urlsSet.add(abs);
          const ss = $x(el).attr('srcset');
          const best = ss ? pickFromSrcset(ss) : null;
          if (best) urlsSet.add(best);
        });
      } catch {
        // 忽略 noscript 内容的解析错误
      }
    });

    $('*[style]').each((_: number, el: Element) => {
      const style = String($(el).attr('style') || '');
      const m = style.match(
        /background-image\s*:\s*url\((['"]?)([^)'"]+)\1\)/i,
      );
      if (m && m[2]) {
        const abs = toAbs(m[2]);
        if (abs) urlsSet.add(abs);
      }
    });

    $('[data-src], [data-original]').each((_: number, el: Element) => {
      const $el = $(el);
      const candidates = [$el.attr('data-src'), $el.attr('data-original')];
      for (const c of candidates) {
        if (!c) continue;
        const abs = toAbs(c);
        if (abs) {
          urlsSet.add(abs);
          break;
        }
      }
    });
  }

  private findNextUrl($: CheerioAPI, currentUrl: string) {
    const relNext = $("a[rel='next']").attr('href');
    if (relNext) return new URL(relNext, currentUrl).href;
    const classNext = $('a.next, .pagination a.next').attr('href');
    if (classNext) return new URL(classNext, currentUrl).href;
    let candidate: string | null = null;
    $('a').each((_: number, el: Element) => {
      const text = ($(el).text() || '').trim().toLowerCase();
      if (/^(next|下一页|下一頁|›|»|>)$/.test(text)) {
        const href = $(el).attr('href');
        if (href && !candidate) candidate = new URL(href, currentUrl).href;
      }
    });
    return candidate;
  }

  private async resolvePages(
    baseUrl: string,
    opts: Partial<CreateCrawlDto> = {},
  ) {
    if (opts.pagePattern) {
      const start = Number(opts.startPage || 1);
      const end = Number(
        opts.endPage || start + Number(opts.maxPages || 10) - 1,
      );
      const list: string[] = [];
      for (let p = start; p <= end; p++) {
        list.push(opts.pagePattern.replace('{page}', String(p)));
      }
      return list;
    }
    const pages: string[] = [];
    let current = baseUrl;
    const origin = new URL(baseUrl).origin;
    for (let i = 0; i < (opts.maxPages || 10); i++) {
      pages.push(current);
      try {
        const controller = new AbortController();
        const t = setTimeout(
          () => controller.abort(),
          Number(opts.fetchTimeoutMs || 15000),
        );
        const res = await fetch(current, {
          headers: this.mergeHeaders(
            this.defaultHeaders('html', current),
            opts.headers,
          ),
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) break;
        const html = await res.text();
        const $ = load(html);
        const next = this.findNextUrl($, current);
        if (!next) break;
        const nextOrigin = new URL(next).origin;
        if (nextOrigin !== origin) break;
        current = next;
        await this.delay(opts.pageDelayMs || 500);
      } catch {
        break;
      }
    }
    return pages;
  }

  private async downloadAll(
    list: string[],
    outDir: string,
    opts: CreateCrawlDto,
    onProgress?: (msg: string) => void,
  ) {
    const usedNames = new Set<string>();
    const concurrency = Number(opts.concurrency || 5);
    let index = 0;
    const saved: { url: string; file: string }[] = [];
    const workers = Array.from({ length: concurrency }, async () => {
      while (index < list.length) {
        const i = index++;
        const u = list[i];
        try {
          const name = await this.downloadImage(u, outDir, usedNames, opts);
          saved.push({ url: u, file: name });
          if (onProgress)
            onProgress(`已保存 ${name} (${saved.length}/${list.length})`);
        } catch (e) {
          if (e instanceof Error) {
            this.logger.error(`下载失败: ${u} - ${e.message}`);
          } else {
            this.logger.error(`下载失败: ${u} - ${String(e)}`);
          }
        }
      }
    });
    await Promise.all(workers);
    return saved;
  }

  private async extractImagesHeadless(
    pageUrl: string,
    opts: Partial<CreateCrawlDto> = {},
  ) {
    let browser: puppeteer.Browser | undefined;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certifcate-errors',
          '--ignore-certifcate-errors-spki-list',
        ],
      });
    } catch (e1) {
      if (e1 instanceof Error) {
        this.logger.error(`启动 Puppeteer 失败: ${e1.message}`);
      }
      return [];
    }

    try {
      const page = await browser.newPage();

      // 随机化 User-Agent 以减少被识别概率
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ];
      const randomUA =
        userAgents[Math.floor(Math.random() * userAgents.length)];

      const ua =
        (opts.headers &&
          (opts.headers['user-agent'] || opts.headers['User-Agent'])) ||
        randomUA;
      await page.setUserAgent(ua);

      // 设置更真实的请求头
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        ...(opts.headers || {}),
      });

      // 注入脚本以绕过部分检测
      await page.evaluateOnNewDocument(() => {
        // 覆盖 navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // 模拟 chrome 对象
        const win = window as unknown as Record<string, unknown>;
        win.chrome = { runtime: {} };
        // 覆盖语言
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en'],
        });
        // 覆盖插件
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });

      await page.setViewport({ width: 1920, height: 1080 });

      const interceptedUrls = new Set<string>();

      // 监听网络请求以捕获所有加载的图片
      page.on('response', (response) => {
        const url = response.url();
        const ct = response.headers()['content-type'] || '';
        if (
          ct.startsWith('image/') ||
          url.match(
            /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i,
          )
        ) {
          interceptedUrls.add(url);
        }
      });

      this.logger.log(`正在访问: ${pageUrl}`);
      const response = await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: Number(opts.fetchTimeoutMs || 30000),
      });

      if (!response) {
        this.logger.warn(`未能获得响应: ${pageUrl}`);
        return [];
      }

      const status = response.status();
      const title = await page.title();
      this.logger.log(`页面加载完成 [${status}]: ${title}`);

      if (status >= 400) {
        this.logger.warn(`页面加载异常: HTTP ${status}`);
        return [];
      }

      // 增强的滚动逻辑
      const scrollWaitMs = Number(opts.pageDelayMs || 1000);
      await page.evaluate(async (waitMs: number) => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
        // 滚动到底部后再等待一下
        await new Promise((r) => setTimeout(r, waitMs));
      }, scrollWaitMs);

      // 提取图片
      const domUrls = await page.evaluate(() => {
        const set = new Set<string>();
        const absUrl = (u: string | null) => {
          try {
            if (!u || u.startsWith('data:')) return u; // 保留 base64
            if (u.startsWith('blob:')) return u; // 记录 blob URL
            return new URL(u, location.href).href;
          } catch {
            return null;
          }
        };

        const pickFromSrcset = (srcset: string) => {
          if (!srcset) return null;
          const parts = srcset
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          let bestUrl = null;
          let maxScore = -1;

          for (const part of parts) {
            const segments = part.split(/\s+/);
            const url = segments[0];
            let score = 0;
            const spec = segments[1] || '';
            if (spec.endsWith('w')) {
              score = parseInt(spec) || 0;
            } else if (spec.endsWith('x')) {
              score = parseFloat(spec) * 100 || 0;
            }
            const abs = absUrl(url);
            if (abs && score >= maxScore) {
              maxScore = score;
              bestUrl = abs;
            }
          }
          return bestUrl;
        };

        // 1. 扫描所有 img 标签
        document.querySelectorAll('img').forEach((img: HTMLImageElement) => {
          // 优先使用 currentSrc (浏览器已解析的当前显示地址)
          if (img.currentSrc) {
            const abs = absUrl(img.currentSrc);
            if (abs) set.add(abs);
          }

          // 扫描各种可能的属性
          const attrs = [
            'src',
            'data-src',
            'data-original',
            'data-lazy',
            'data-url',
            'data-actualsrc',
            'data-href',
            'data-lazy-src',
            'data-source',
            'original-src',
            'data-pic-base64',
            'file',
            'zoomfile',
            'data-lazy-load-src',
            'data-actual-src',
            'data-thumb',
            'data-full',
          ];

          for (const attr of attrs) {
            const val = img.getAttribute(attr);
            if (val) {
              const abs = absUrl(val);
              if (abs) set.add(abs);
            }
          }

          // 处理 srcset
          const srcset =
            img.getAttribute('srcset') || img.getAttribute('data-srcset');
          if (srcset) {
            const best = pickFromSrcset(srcset);
            if (best) set.add(best);
          }
        });

        // 2. 扫描背景图片
        document.querySelectorAll('*').forEach((el) => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundImage;
          if (bg && bg !== 'none') {
            const m = bg.match(/url\((['"]?)([^)"']+)\1\)/i);
            if (m && m[2]) {
              const abs = absUrl(m[2]);
              if (abs) set.add(abs);
            }
          }
          // 检查 content 属性 (有时用于伪元素显示图片)
          const content = style.content;
          if (content && content !== 'none') {
            const m = content.match(/url\((['"]?)([^)"']+)\1\)/i);
            if (m && m[2]) {
              const abs = absUrl(m[2]);
              if (abs) set.add(abs);
            }
          }
          // 顺便检查一些自定义背景属性
          const dataBg =
            el.getAttribute('data-bg') ||
            el.getAttribute('data-background') ||
            el.getAttribute('data-src');
          if (
            dataBg &&
            (dataBg.startsWith('http') ||
              dataBg.startsWith('/') ||
              dataBg.startsWith('data:'))
          ) {
            const abs = absUrl(dataBg);
            if (abs) set.add(abs);
          }
        });

        // 3. 扫描 video poster
        document.querySelectorAll('video').forEach((v: HTMLVideoElement) => {
          const poster = v.getAttribute('poster');
          if (poster) {
            const abs = absUrl(poster);
            if (abs) set.add(abs);
          }
        });

        // 4. 扫描 source 标签 (在 picture 之外也可能有)
        document.querySelectorAll('source').forEach((s: HTMLSourceElement) => {
          const srcset =
            s.getAttribute('srcset') || s.getAttribute('data-srcset');
          if (srcset) {
            const best = pickFromSrcset(srcset);
            if (best) set.add(best);
          }
          const src = s.getAttribute('src');
          if (src) {
            const abs = absUrl(src);
            if (abs) set.add(abs);
          }
        });

        // 5. 扫描 a 标签指向的图片 (有些图库页面 a 标签直接链接到原图)
        document.querySelectorAll('a').forEach((a: HTMLAnchorElement) => {
          const href = a.getAttribute('href');
          if (
            href &&
            href.match(
              /\.(jpg|jpeg|png|gif|webp|svg|avif|heic|ico|bmp|tiff)(\?.*)?$/i,
            )
          ) {
            const abs = absUrl(href);
            if (abs) set.add(abs);
          }
        });

        return Array.from(set).filter(
          (u) =>
            u &&
            (u.startsWith('http') ||
              u.startsWith('data:') ||
              u.startsWith('blob:')),
        );
      });

      // 合并拦截到的 URL 和 DOM 中的 URL
      const finalUrls = new Set([...interceptedUrls, ...domUrls]);

      // 处理 blob: URL (需要转换为 Data URL 或下载 buffer)
      // 为简化，这里暂不深度处理 blob，仅保留 http 和 data
      const result = Array.from(finalUrls).filter(
        (u) => u && (u.startsWith('http') || u.startsWith('data:')),
      );

      this.logger.log(
        `无头模式抓取到 ${result.length} 个候选 URL (拦截: ${interceptedUrls.size}, DOM: ${domUrls.length})`,
      );
      return result;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(`无头模式提取失败: ${e.message}`);
      }
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  async crawl(
    baseUrl: string,
    opts: CreateCrawlDto,
    onProgress?: (msg: string) => void,
  ) {
    const outDirRel = opts.outDir || 'images';
    const outDir = path.isAbsolute(outDirRel)
      ? outDirRel
      : path.join(STORAGE_ROOT, outDirRel);
    ensureDir(STORAGE_ROOT);
    ensureDir(outDir);

    const urls = new Set<string>();
    const pages = await this.resolvePages(baseUrl, opts);
    this.logger.log(`计划抓取 ${pages.length} 页。`);
    if (onProgress) onProgress(`计划抓取 ${pages.length} 页。`);

    // 注意：为了简化，Service 中移除了 onProgress 回调逻辑，
    // 如果使用 WebSockets 或 SSE 可以加回来。

    for (let i = 0; i < pages.length; i++) {
      const pageUrl = pages[i];
      this.logger.log(`正在抓取第 ${i + 1}/${pages.length} 页: ${pageUrl}`);
      if (onProgress)
        onProgress(`正在抓取第 ${i + 1}/${pages.length} 页: ${pageUrl}`);

      if (opts.useHeadless) {
        this.logger.log('使用无头模式...');
        const more = await this.extractImagesHeadless(pageUrl, opts);
        more.forEach((u) => urls.add(u));
        await this.delay(opts.pageDelayMs || 500);
        continue;
      }

      const controller = new AbortController();
      const t = setTimeout(
        () => controller.abort(),
        Number(opts.fetchTimeoutMs || 15000),
      );
      let pageRes: Response;
      try {
        pageRes = await fetch(pageUrl, {
          headers: this.mergeHeaders(
            this.defaultHeaders('html', pageUrl),
            opts.headers,
          ),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(t);
        if (e instanceof Error) {
          this.logger.error(`页面获取错误: ${e.message}`);
        }
        // 回退到无头模式
        const more = await this.extractImagesHeadless(pageUrl, opts);
        more.forEach((u) => urls.add(u));
        await this.delay(opts.pageDelayMs || 500);
        continue;
      }
      clearTimeout(t);

      if (!pageRes.ok) {
        this.logger.error(`页面获取失败: ${pageRes.status}`);
        // 回退到无头模式
        const more = await this.extractImagesHeadless(pageUrl, opts);
        more.forEach((u) => urls.add(u));
        await this.delay(opts.pageDelayMs || 500);
        continue;
      }

      const html = await pageRes.text();
      const $ = load(html);
      this.extractImages($, pageUrl, urls);
      await this.delay(opts.pageDelayMs || 500);
    }

    const list = [...urls];
    this.logger.log(`发现 ${list.length} 张图片。`);
    if (onProgress) onProgress(`发现 ${list.length} 张图片。`);

    // We pass referer as baseUrl to downloadAll
    const saved = await this.downloadAll(
      list,
      outDir,
      {
        ...opts,
        headers: { ...opts.headers, referer: baseUrl },
      },
      onProgress,
    );

    this.logger.log('全部完成。');
    return {
      count: list.length,
      saved,
      outDir: path.relative(process.cwd(), outDir),
    };
  }
}
