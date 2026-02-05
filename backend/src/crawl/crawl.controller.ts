import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CrawlService } from './crawl.service';
import { CreateCrawlDto } from './dto/create-crawl.dto';

@Controller('api/crawl')
export class CrawlController {
  constructor(private readonly crawlService: CrawlService) {}

  @Post()
  async create(@Body() createCrawlDto: CreateCrawlDto) {
    // Basic sync crawl for now.
    // Ideally this should be async/queued, but keeping it simple as per original implementation.
    return await this.crawlService.crawl(createCrawlDto.url, createCrawlDto);
  }

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
