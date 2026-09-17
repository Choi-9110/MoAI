import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Knowledge } from './entities/knowledge.entity';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Post()
  create(@Body() dto: CreateKnowledgeDto) {
    return this.service.create(dto as DeepPartial<Knowledge>);
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
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Knowledge>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
