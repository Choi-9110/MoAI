import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import type { DeepPartial } from 'typeorm';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/pagination.dto';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto as DeepPartial<User>);
  }

  /**
   * 전체 회원 목록.
   *
   * **관리자만 볼 수 있다.** 로그인만 하면 누구나 부를 수 있게 열려 있었는데,
   * 그러면 가입한 사람 아무나 전체 회원의 이메일을 긁어 갈 수 있다.
   * 화면에서는 이 주소를 안 쓰지만(로그인은 `/auth/me` 로 한다), 주소를
   * 아는 사람은 그냥 부를 수 있으므로 여기서 막는다.
   */
  @Get()
  @UseGuards(AdminGuard)
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query.page, query.limit);
  }

  /** 남의 계정도 열리므로 관리자만 본다 */
  @Get(':id')
  @UseGuards(AdminGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(id, dto as DeepPartial<User>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
