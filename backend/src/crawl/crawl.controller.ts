import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CrawlService } from './crawl.service';
import { CreateCrawlDto } from './dto/create-crawl.dto';

@Controller('api/crawl')
export class CrawlController {
  constructor(private readonly crawlService: CrawlService) {}

  /**
   * 创建抓取任务（同步模式）
   * @param createCrawlDto 抓取配置
   * @returns 抓取结果
   */
  @Post()
  async create(@Body() createCrawlDto: CreateCrawlDto) {
    // 目前使用基本的同步抓取。
    // 理想情况下应该异步/排队，但为了保持与原始实现一致，保持简单。
    return await this.crawlService.crawl(createCrawlDto.url, createCrawlDto);
  }

  /**
   * 创建流式抓取任务（SSE）
   * 通过 Server-Sent Events 实时返回抓取进度
   * @param query 查询参数形式的抓取配置
   * @param res Express 响应对象
   */
  @Get('stream')
  async stream(@Query() query: CreateCrawlDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const result = await this.crawlService.crawl(query.url, query, (msg) => {
        res.write(`data: ${JSON.stringify({ message: msg })}\n\n`);
      });
      res.write(
        `data: ${JSON.stringify({
          type: 'complete',
          saved: result.count,
          outDir: result.outDir,
        })}\n\n`,
      );
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`,
      );
      res.end();
    }
  }
}
