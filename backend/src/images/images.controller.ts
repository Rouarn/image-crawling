import { Controller, Get, Delete, Body } from '@nestjs/common';
import { ImagesService } from './images.service';
import { DeleteImageDto } from './dto/delete-image.dto';

@Controller('api/images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get()
  findAll() {
    return this.imagesService.findAll();
  }

  @Delete()
  remove(@Body() deleteImageDto: DeleteImageDto) {
    return this.imagesService.remove([deleteImageDto.name]);
  }
}
