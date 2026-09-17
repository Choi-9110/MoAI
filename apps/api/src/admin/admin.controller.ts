import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards,
} from '@nestjs/common';
import { Auth } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/**
 * 관리자 화면이 쓰는 것.
 *
 * `@UseGuards(AdminGuard)` 를 **클래스에 건다.** 메서드마다 붙이면 나중에
 * 하나 추가할 때 빠뜨리기 쉽고, 빠뜨린 그 하나가 전부를 여는 구멍이 된다.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** 회원 목록 */
  @Get('members')
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.admin.list(
      Number(page) || 1,
      Number(limit) || 50,
      q,
    );
  }

  /** 회원 상세 */
  @Get('members/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }

  /**
   * 회원 지우기 — 되돌릴 수 없다.
   *
   * 누가 눌렀는지 함께 넘긴다. 자기 자신은 지우지 못하게 하기 위해서다.
   */
  @Delete('members/:id')
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.removeMember(id, auth.userId);
  }

  /** 등급 바꾸기 — 바꾼 뒤의 상세를 그대로 돌려준다 */
  @Patch('members/:id/grade')
  setGrade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('grade') grade: string,
  ) {
    return this.admin.setGrade(id, grade);
  }
}
