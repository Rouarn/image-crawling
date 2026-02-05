import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { STORAGE_ROOT, ensureDir } from './common/constants';
import * as express from 'express';

async function bootstrap() {
  // 在静态服务启动前确保存储目录存在
  ensureDir(STORAGE_ROOT);

  const app = await NestFactory.create(AppModule);

  // 启用前端跨域支持
  app.enableCors();

  // 增加请求体大小限制
  app.use(express.json({ limit: '200kb' }));

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);
  console.log(`后端服务已启动: http://localhost:${PORT}`);
}
void bootstrap();
