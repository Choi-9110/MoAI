import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Tenant } from './entities/tenant.entity';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.service.create(dto as DeepPartial<Tenant>);
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
    @Body() dto: UpdateTenantDto,
  ) {
    return this.service.update(id, dto as DeepPartial<Tenant>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
