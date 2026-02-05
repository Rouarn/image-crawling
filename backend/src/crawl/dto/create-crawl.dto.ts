import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCrawlDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  outDir?: string = 'images';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => Number(value))
  maxPages?: number = 10;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @Transform(({ value }) => Number(value))
  concurrency?: number = 5;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  @Transform(({ value }) => Number(value))
  pageDelayMs?: number = 500;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  @Transform(({ value }) => Number(value))
  fetchTimeoutMs?: number = 15000;

  @IsOptional()
  @IsString()
  pagePattern?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  startPage?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  endPage?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  useHeadless?: boolean;

  @IsOptional()
  headers?: Record<string, string>;
}
