import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CrawlModule } from './crawl/crawl.module';
import { ImagesModule } from './images/images.module';
import { STORAGE_ROOT } from './common/constants';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: STORAGE_ROOT,
      serveRoot: '/storage',
      serveStaticOptions: {
        maxAge: '1d',
        etag: true,
      },
    }),
    CrawlModule,
    ImagesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
