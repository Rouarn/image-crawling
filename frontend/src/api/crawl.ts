import request from './request';

export interface CrawlOptions {
  url: string;
  outDir?: string;
  maxPages?: number;
  concurrency?: number;
  pageDelayMs?: number;
  pagePattern?: string;
  startPage?: number;
  endPage?: number;
  useHeadless?: boolean;
  headers?: string;
}

export const startCrawl = (data: CrawlOptions) => request.post('/crawl', data);

export const getImages = (params?: { filter?: string; dir?: string }) => request.get<{ groups: { dir: string; files: string[] }[]; total: number; files?: string[] }>('/images', { params }) as unknown as Promise<{ groups: { dir: string; files: string[] }[]; total: number; files?: string[] }>;
