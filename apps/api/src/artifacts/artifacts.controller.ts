import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { ArtifactsService } from './artifacts.service';
import { CreateArtifactDto } from './dto/create-artifact.dto';
import { UpdateArtifactDto } from './dto/update-artifact.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Artifact } from './entities/artifact.entity';

@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly service: ArtifactsService) {}

  @Post()
  create(@Body() dto: CreateArtifactDto) {
    return this.service.create(dto as DeepPartial<Artifact>);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query.page, query.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArtifactDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Artifact>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
