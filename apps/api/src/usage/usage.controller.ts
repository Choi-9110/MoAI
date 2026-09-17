import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { UsageService } from './usage.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UpdateUsageDto } from './dto/update-usage.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Usage } from './entities/usage.entity';

@Controller('usage')
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Post()
  create(@Body() dto: CreateUsageDto) {
    return this.service.create(dto as DeepPartial<Usage>);
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
    @Body() dto: UpdateUsageDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Usage>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
