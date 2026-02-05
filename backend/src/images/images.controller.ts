import { Controller, Get, Delete, Body } from '@nestjs/common';
import { ImagesService } from './images.service';
import { DeleteImageDto } from './dto/delete-image.dto';

@Controller('api/images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  /**
   * 获取所有已抓取的图片列表
   */
  @Get()
  findAll() {
    return this.imagesService.findAll();
  }

  /**
   * 删除指定的图片
   * @param deleteImageDto 包含要删除的文件名
   */
  @Delete()
  remove(@Body() deleteImageDto: DeleteImageDto) {
    return this.imagesService.remove([deleteImageDto.name]);
  }
}
