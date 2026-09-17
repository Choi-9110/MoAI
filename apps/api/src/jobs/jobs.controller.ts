import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Job } from './entities/job.entity';

@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.service.create(dto as DeepPartial<Job>);
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
    @Body() dto: UpdateJobDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Job>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
