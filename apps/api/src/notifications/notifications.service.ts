import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProcurementService } from '../procurement/procurement.service';
import { Project } from '../projects/entities/project.entity';

/**
 * 다 됐다고 알려 주는 일.
 *
 * 요약 한 장도 사업계획서도 백그라운드로 돈다. 사용자는 요청만 걸어 두고
 * 다른 페이지로 가거나 창을 닫는데, 그러면 **끝난 줄 모른다.** 돌아와서
 * 새로고침해 봐야 "어 됐네" 하고 아는 게 지금이다.
 *
 * 그래서 화면이 주기적으로 물어보고, 끝난 것이 있으면 알린다. 서버는
 * 상태만 본다 — 알림을 밀어 넣는 것이 아니라 **물어보면 답한다.**
 * 로컬에서 도는 서비스라 푸시 인프라를 세울 이유가 없고, 브라우저가 켜져
 * 있을 때만 알려도 충분하다.
 *
 * 한 번 알린 것은 표시해 두어 다시 알리지 않는다. 표시가 없으면 폴링할
 * 때마다 같은 알림이 30초마다 뜬다.
 */

export type NotificationKind = 'poster' | 'plan' | 'bids';

export interface Notification {
  projectId: string;
  kind: NotificationKind;
  /** 성공인가 실패인가 — 실패도 알려야 한다 */
  ok: boolean;
  title: string;
  /** 화면에 그대로 띄울 한 줄 */
  message: string;
  finishedAt: string | null;
}

/** 8-4-4-4-12 — 사업 식별자인지 가려낼 때만 쓴다 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly procurement: ProcurementService,
  ) {}

  /**
   * 아직 안 알린 완료 건.
   *
   * `done` 과 `failed` 둘 다 본다. 실패를 안 알리면 사용자는 "아직 도는
   * 중"이라고 믿고 계속 기다린다.
   */
  async pending(tenantId?: string): Promise<Notification[]> {
    const out: Notification[] = [];

    /*
     * 입찰 조회는 30초를 넘기기도 해서 **다른 화면에 가 있는 동안** 끝난다.
     * 그때 알려 주지 않으면 사용자는 입찰 화면으로 돌아가 새로고침을 눌러야
     * 비로소 안다.
     */
    if (tenantId) {
      const bids = this.procurement.takeFinished(tenantId);
      if (bids) {
        out.push({
          projectId: `bids:${tenantId}`,
          kind: 'bids',
          ok: bids.ok,
          title: '공공 입찰',
          message: bids.ok
            ? `입찰 공고 ${bids.count}건을 찾았습니다.`
            : '입찰 공고를 가져오지 못했습니다.',
          finishedAt: new Date().toISOString(),
        });
      }
    }

    const rows = await this.projects.find({
      where: tenantId ? { tenantId } : {},
      order: { planUpdatedAt: 'DESC' },
      take: 100,
    });

    for (const p of rows) {
      if (
        p.posterStatus &&
        ['done', 'failed'].includes(p.posterStatus) &&
        !p.posterNotifiedAt
      ) {
        const ok = p.posterStatus === 'done';
        out.push({
          projectId: p.id,
          kind: 'poster',
          ok,
          title: p.title,
          message: ok
            ? '요약 한 장이 완성됐어요.'
            : '요약 한 장을 만들지 못했어요.',
          finishedAt: p.posterUpdatedAt?.toISOString() ?? null,
        });
      }

      if (
        p.planStatus &&
        ['done', 'failed'].includes(p.planStatus) &&
        !p.planNotifiedAt
      ) {
        const ok = p.planStatus === 'done';
        const sections = p.planDoc?.sections.length ?? 0;
        out.push({
          projectId: p.id,
          kind: 'plan',
          ok,
          title: p.title,
          message: ok
            ? `사업계획서 ${sections}개 절을 다 썼어요.`
            : '사업계획서를 쓰다 멈췄어요.',
          finishedAt: p.planUpdatedAt?.toISOString() ?? null,
        });
      }
    }

    return out;
  }

  /**
   * 알렸다고 표시한다.
   *
   * 화면이 알림을 띄운 **직후** 부른다. 띄우기 전에 표시하면, 그 사이에
   * 창이 닫혔을 때 알림이 통째로 사라진다.
   */
  async ack(
    items: { projectId: string; kind: NotificationKind }[],
    tenantId?: string,
  ): Promise<{ acked: number }> {
    if (items.length === 0) return { acked: 0 };

    /*
     * **사업이 아닌 알림도 섞여 온다.**
     *
     * 입찰 조회 알림은 `bids:<워크스페이스>` 를 식별자로 쓴다. 그걸 그대로
     * 사업 표에 넣고 찾으면 uuid 열에 다른 모양의 값을 넣는 셈이라 조회가
     * 터진다. 그런 것은 이미 한 번 가져가면 다시 오지 않으므로 여기서
     * 표시할 것도 없다 — 걸러 낸다.
     */
    const ids = [...new Set(items.map((i) => i.projectId))].filter((id) =>
      UUID.test(id),
    );
    if (ids.length === 0) return { acked: 0 };

    const rows = await this.projects.find({ where: { id: In(ids) } });
    const now = new Date();

    let acked = 0;

    for (const p of rows) {
      // 남의 사업을 확인 처리할 수는 없다.
      if (tenantId && p.tenantId !== tenantId) continue;

      const kinds = items.filter((i) => i.projectId === p.id).map((i) => i.kind);
      const patch: Partial<Project> = {};

      if (kinds.includes('poster') && !p.posterNotifiedAt) patch.posterNotifiedAt = now;
      if (kinds.includes('plan') && !p.planNotifiedAt) patch.planNotifiedAt = now;

      if (Object.keys(patch).length > 0) {
        await this.projects.update(p.id, patch);
        acked += 1;
      }
    }

    if (acked > 0) this.logger.log(`알림 확인 ${acked}건`);
    return { acked };
  }
}
