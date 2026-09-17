import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Section } from './entities/section.entity';

@Controller('sections')
export class SectionsController {
  constructor(private readonly service: SectionsService) {}

  @Post()
  create(@Body() dto: CreateSectionDto) {
    return this.service.create(dto as DeepPartial<Section>);
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
    @Body() dto: UpdateSectionDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Section>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
