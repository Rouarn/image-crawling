import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { URL } from 'node:url';
import { load, CheerioAPI } from 'cheerio';
import { Element } from 'domhandler';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { STORAGE_ROOT, ensureDir } from '../common/constants';
import { CreateCrawlDto } from './dto/create-crawl.dto';
import * as puppeteer from 'puppeteer';

const streamPipeline = promisify(pipeline);

// Add global fetch type definition if missing in Node environment types
declare global {
  function fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response>;
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
    if (ct.includes('jpeg')) return 'jpg';
    if (ct.includes('png')) return 'png';
    if (ct.includes('gif')) return 'gif';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('svg')) return 'svg';
    if (ct.includes('bmp')) return 'bmp';
    return '';
  }

  private filenameFromUrl(u: string) {
    try {
      const p = new URL(u).pathname;
      const base = path.basename(p);
      return base || 'image';
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
    // 1. Handle Base64
    if (u.startsWith('data:image/')) {
      try {
        const matches = u.match(/^data:(image\/([a-zA-Z+]+));base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid base64 image format');
        }

        const extension = matches[2]
          .replace('jpeg', 'jpg')
          .replace('svg+xml', 'svg');
        const data = matches[3];
        const buffer = Buffer.from(data, 'base64');

        const timestamp = Date.now();
        const name = `base64_${timestamp}`;
        let final = `${name}.${extension}`;
        let i = 1;

        while (usedNames.has(final)) {
          final = `${name}_${i}.${extension}`;
          i++;
        }
        usedNames.add(final);

        const outPath = path.join(outDir, final);
        await fs.promises.writeFile(outPath, buffer);
        this.logger.log(`Saved Base64: ${final}`);
        return final;
      } catch (e) {
        this.logger.error(
          `Base64 save failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        throw e;
      }
    }

    // 2. Handle Normal URL
    const controller = new AbortController();
    const timeoutMs = Number(options?.fetchTimeoutMs || 60000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const referer = options?.headers?.referer || new URL(u).origin;
      const headers = this.defaultHeaders('image', referer);
      const finalHeaders = this.mergeHeaders(headers, options?.headers);

      // Native fetch is available in Node 18+
      const res = await fetch(u, {
        headers: finalHeaders,
        signal: controller.signal,
      });

      if (!res.ok || !res.body)
        throw new Error(`HTTP ${res.status} ${res.statusText}`);

      let name = this.filenameFromUrl(u);
      const hasExt = path.extname(name);
      const ct = res.headers.get('content-type');
      const guessedExt = this.extFromContentType(ct);
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
      // Node fetch body is a ReadableStream, streamPipeline expects Node streams.
      // We can convert web stream to node stream using Readable.fromWeb or similar,
      // but simpler to use @ts-expect-error if types mismatch slightly.
      // However, user banned @ts-ignore.
      // Let's cast res.body to any to avoid "ReadableStream not assignable to Readable"
      // or better: import { Readable } from 'stream'; Readable.fromWeb(res.body as any)
      // Since we can't use any...
      // Actually streamPipeline supports Web Streams in Node 18+.
      await streamPipeline(
        res.body as unknown as NodeJS.ReadableStream,
        fs.createWriteStream(outPath),
      );
      this.logger.log(`Saved: ${final}`);
      return final;
    } finally {
      clearTimeout(t);
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
        // Ignore parsing errors for noscript content
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
            onProgress(`Saved ${name} (${saved.length}/${list.length})`);
        } catch (e) {
          if (e instanceof Error) {
            this.logger.error(`Download failed: ${u} - ${e.message}`);
          } else {
            this.logger.error(`Download failed: ${u} - ${String(e)}`);
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
        headless: true, // New headless mode
        args: ['--disable-blink-features=AutomationControlled'],
      });
    } catch (e1) {
      if (e1 instanceof Error) {
        this.logger.error(`Failed to launch puppeteer: ${e1.message}`);
      }
      return [];
    }

    try {
      const page = await browser.newPage();
      const ua =
        (opts.headers &&
          (opts.headers['user-agent'] || opts.headers['User-Agent'])) ||
        this.defaultHeaders()['user-agent'];
      await page.setUserAgent(ua);
      const baseExtra = {
        referer: pageUrl,
        accept: this.defaultHeaders().accept,
        'accept-language': this.defaultHeaders()['accept-language'],
      };
      const extra = this.mergeHeaders(baseExtra, opts.headers);
      await page.setExtraHTTPHeaders({
        referer: extra['referer'],
        accept: extra['accept'],
        'accept-language': extra['accept-language'],
        ...(extra['cookie'] ? { cookie: extra['cookie'] } : {}),
        ...(extra['authorization']
          ? { authorization: extra['authorization'] }
          : {}),
      });

      try {
        await page.setViewport({
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        });
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
          });
          Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en'],
          });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
          (window as unknown as { chrome: unknown }).chrome = { runtime: {} };
        });
      } catch {
        // Ignore viewport setting errors
      }

      await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: Number(opts.fetchTimeoutMs || 30000),
      });

      const scrollWaitMs = Number(opts.pageDelayMs || 800);
      await page.evaluate(async (waitMs: number) => {
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const scrollStep = () => {
          const step = Math.floor(window.innerHeight * 0.8);
          window.scrollBy(0, step);
          return step;
        };

        let lastHeight = 0;
        let noChangeCount = 0;

        for (let i = 0; i < 50; i++) {
          scrollStep();
          await delay(waitMs);

          const currentHeight = document.documentElement.scrollHeight;
          const currentPos = window.scrollY + window.innerHeight;

          if (currentPos >= currentHeight || currentHeight === lastHeight) {
            noChangeCount++;
            if (noChangeCount >= 3) break;
          } else {
            noChangeCount = 0;
          }
          lastHeight = currentHeight;
        }
      }, scrollWaitMs);

      const urls = await page.evaluate(() => {
        const set = new Set<string>();
        const absUrl = (u: string | null) => {
          try {
            if (!u) return null;
            return new URL(u, location.href).href;
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
            const u = p.split(/\s+/)[0];
            let score = 0;
            const mW = p.match(/(\d+)w/i);
            const mX = p.match(/(\d+(?:\.\d+)?)x/i);
            if (mW) score = parseInt(mW[1]) || 0;
            else if (mX) score = Math.round(parseFloat(mX[1]) * 100) || 0;
            const abs = absUrl(u);
            if (abs && score >= best.score) best = { url: abs, score };
          }
          return best.url;
        };

        document.querySelectorAll('img').forEach((img) => {
          const candidates = [
            img.currentSrc,
            img.src,
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-lazy'),
            img.getAttribute('data-url'),
            img.getAttribute('data-actualsrc'),
            img.getAttribute('data-href'),
            img.getAttribute('data-lazy-src'),
          ];
          for (const c of candidates) {
            if (!c) continue;
            const abs = absUrl(c);
            if (abs) {
              set.add(abs);
              break;
            }
          }
          const best = pickFromSrcset(
            img.currentSrc
              ? ''
              : img.getAttribute('srcset') ||
                  img.getAttribute('data-srcset') ||
                  '',
          );
          if (best) set.add(best);
        });

        document.querySelectorAll('picture').forEach((pic) => {
          let best: string | null = null;
          pic.querySelectorAll('source').forEach((s) => {
            const u = pickFromSrcset(s.getAttribute('srcset') || '');
            if (u) best = u;
          });
          if (best) set.add(best);
          const img = pic.querySelector('img');
          const abs =
            img && img.getAttribute('src')
              ? absUrl(img.getAttribute('src'))
              : null;
          if (abs) set.add(abs);
        });

        document.querySelectorAll('noscript').forEach((ns) => {
          const html = ns.innerHTML || '';
          if (!html.trim()) return;
          const div = document.createElement('div');
          div.innerHTML = html;
          div.querySelectorAll('img').forEach((img) => {
            const abs = img.getAttribute('src')
              ? absUrl(img.getAttribute('src'))
              : null;
            if (abs) set.add(abs);
            const best = pickFromSrcset(img.getAttribute('srcset') || '');
            if (best) set.add(best);
          });
        });

        document.querySelectorAll('*').forEach((el) => {
          const bg = getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none') {
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
      if (e instanceof Error) {
        this.logger.error(`Headless extraction failed: ${e.message}`);
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
    this.logger.log(`Plan to crawl ${pages.length} pages.`);
    if (onProgress) onProgress(`Plan to crawl ${pages.length} pages.`);

    // Note: onProgress callback logic removed for simplicity in Service,
    // can be added back if using WebSockets or SSE in Controller.

    for (let i = 0; i < pages.length; i++) {
      const pageUrl = pages[i];
      this.logger.log(`Crawling page ${i + 1}/${pages.length}: ${pageUrl}`);
      if (onProgress)
        onProgress(`Crawling page ${i + 1}/${pages.length}: ${pageUrl}`);

      if (opts.useHeadless) {
        this.logger.log('Using Headless mode...');
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
          this.logger.error(`Page fetch error: ${e.message}`);
        }
        // Fallback to headless
        const more = await this.extractImagesHeadless(pageUrl, opts);
        more.forEach((u) => urls.add(u));
        await this.delay(opts.pageDelayMs || 500);
        continue;
      }
      clearTimeout(t);

      if (!pageRes.ok) {
        this.logger.error(`Page fetch failed: ${pageRes.status}`);
        // Fallback to headless
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
    this.logger.log(`Found ${list.length} images.`);
    if (onProgress) onProgress(`Found ${list.length} images.`);

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

    this.logger.log('All done.');
    return {
      count: list.length,
      saved,
      outDir: path.relative(process.cwd(), outDir),
    };
  }
}
