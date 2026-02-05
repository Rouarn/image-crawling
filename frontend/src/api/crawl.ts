import request from './request';

export interface CrawlOptions {
  /** 目标网站 URL */
  url: string;
  /** 输出目录，默认为 'images' */
  outDir?: string;
  /** 最大抓取页数 */
  maxPages?: number;
  /** 并发下载数 */
  concurrency?: number;
  /** 页面抓取延迟（毫秒） */
  pageDelayMs?: number;
  /** 页面 URL 模式，例如 'page-{page}.html' */
  pagePattern?: string;
  /** 起始页码 */
  startPage?: number;
  /** 结束页码 */
  endPage?: number;
  /** 是否使用无头浏览器模式 */
  useHeadless?: boolean;
  /** 自定义请求头 (JSON 字符串) */
  headers?: string;
}

/**
 * 启动抓取任务
 * @param data 抓取配置选项
 */
export const startCrawl = (data: CrawlOptions) => request.post('/crawl', data);

/**
 * 获取已抓取的图片列表
 * @param params 可选的查询参数
 */
export const getImages = (params?: { filter?: string; dir?: string }) => request.get<{ groups: { dir: string; files: string[] }[]; total: number; files?: string[] }>('/images', { params }) as unknown as Promise<{ groups: { dir: string; files: string[] }[]; total: number; files?: string[] }>;
