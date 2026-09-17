import {
  ForbiddenException, Injectable, Logger, NotFoundException,
  OnApplicationBootstrap, ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODOO_NOTICE_DIGEST } from '@moai/shared';
import type {
  NoticeDigest, PosterCreateInput, PosterDoc, SlotChange, SlotNote,
} from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { AttachmentStoreService } from '../common/attachment-store.service';
import { LocalQueueService } from '../common/local-queue.service';
import { Grant } from '../grants/entities/grant.entity';
import { Project } from '../projects/entities/project.entity';
import { GrantLinkerService } from './grant-linker.service';

/** 모두의창업은 공고문을 올리지 않는다. 화면에 이 이름으로 보인다. */
const MODOO_NOTICE_LABEL = '모두의 창업 프로젝트 통합 모집공고 (2차)';

export interface ReviseResult {
  doc: PosterDoc;
  changes: SlotChange[];
  costUsd?: number;
}

/** 화면이 폴링하는 생성 상태 */
export interface PosterState {
  status: Project['posterStatus'];
  doc: PosterDoc | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  noticeFileName: string | null;
  /** 연결된 공고 — 원문을 보러 갈 수 있으면 채워진다 */
  grant: { id: string; title: string; sourceUrl: string | null } | null;
  /** 자동으로 찾아 묶은 경우, 어떤 근거로 묶였는지 */
  grantLink: { score: number; matchedBy: string } | null;
  /** 직전 재작성에서 바뀐 칸 */
  changes: SlotChange[] | null;
}

/**
 * 요약 한 장 — 로컬 실행기로 넘긴다.
 *
 * 모델 호출은 사용자 PC 에서 돈다. 서버는 중계하고 결과를 보관한다.
 */
/**
 * 실행기가 없어 멈췄을 때 스스로 다시 잡는 횟수와 간격.
 *
 * 실행기가 되살아나는 데 보통 10~20초가 걸린다. 세 번(총 1분 반쯤)이면
 * 웬만한 재시작은 지나간다. 그보다 오래 안 돌아오면 사람이 봐야 할 일이라,
 * 그때는 실패로 알린다.
 */
const MAX_SELF_RETRY = 3;
const SELF_RETRY_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Injectable()
export class PosterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PosterService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    private readonly linker: GrantLinkerService,
    private readonly queue: LocalQueueService,
    private readonly store: AttachmentStoreService,
  ) {}

  /**
   * 서버가 다시 뜰 때, 만들다 만 것을 다시 만든다.
   *
   * **왜 필요한가.** 요약 한 장은 1~2분 걸린다. 그 사이 서버가 다시 뜨면
   * 하던 일은 메모리와 함께 사라지는데, DB 에는 `running` 으로 남는다.
   * 아무도 이어받지 않으니 화면은 **영원히 로딩**이고, 사용자는 영문도
   * 모른 채 기다리다 결국 다시 누른다.
   *
   * 사업계획서와 달리 요약은 중간 저장이 없어 처음부터 다시 만든다.
   * 대신 공고문 파일을 맡겨 두었으므로 **같은 재료로** 다시 만든다.
   */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.projects.find({
      where: { posterStatus: 'running' },
      select: { id: true },
    });
    if (stuck.length === 0) return;

    this.logger.log(`만들다 만 요약 ${stuck.length}건을 다시 만듭니다.`);
    for (const p of stuck) {
      this.queue.enqueue(`poster:${p.id}`, () => this.run(p.id));
    }
  }

  /**
   * 실행기가 잠깐 없어도 기다렸다 다시 부른다.
   *
   * **연결이 안 되거나 5xx 일 때만** 다시 부른다. 4xx 는 우리가 잘못 보낸
   * 것이라 같은 요청을 또 보내도 같은 답이 온다.
   */
  private async withRetry(call: () => Promise<Response>): Promise<Response> {
    const waits = [3_000, 8_000, 20_000];
    let last: Error | null = null;

    for (let attempt = 0; attempt <= waits.length; attempt += 1) {
      try {
        const res = await call();
        if (res.ok || res.status < 500) return res;
        last = new Error(`실행기 응답 ${res.status}`);
      } catch (err) {
        last = err as Error;
      }

      const wait = waits[attempt];
      if (wait === undefined) break;

      this.logger.warn(
        `실행기 응답 없음 (${attempt + 1}/${waits.length + 1}) — ` +
          `${wait / 1000}초 뒤 다시 시도합니다.`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }

    throw new ServiceUnavailableException(
      `로컬 실행기에 연결할 수 없습니다 — ${last?.message ?? '알 수 없음'}`,
    );
  }

  private get agentUrl(): string {
    return process.env.AGENT_BASE_URL ?? 'http://localhost:4100';
  }

  private get agentToken(): string {
    return process.env.AGENT_TOKEN ?? '';
  }

  /** 현재 상태 — 화면이 주기적으로 물어본다 */
  async state(projectId: string, tenantId?: string): Promise<PosterState> {
    const project = await this.find(projectId, tenantId);

    const grant = project.grantId
      ? await this.grants.findOne({ where: { id: project.grantId } })
      : null;

    return {
      status: project.posterStatus,
      doc: project.posterDoc,
      error: project.posterError,
      startedAt: project.posterStartedAt?.toISOString() ?? null,
      updatedAt: project.posterUpdatedAt?.toISOString() ?? null,
      noticeFileName: project.noticeFileName,
      grant: grant
        ? { id: grant.id, title: grant.title, sourceUrl: grant.sourceUrl }
        : null,
      changes: project.posterChanges,
      grantLink:
        grant && project.grantLinkScore != null
          ? {
              score: Number(project.grantLinkScore),
              matchedBy: project.grantLinkedBy ?? '',
            }
          : null,
    };
  }

  /** 사용자가 직접 공고를 골라 묶는다 (자동으로 못 찾았을 때) */
  async linkGrant(
    projectId: string,
    grantId: string | null,
    tenantId?: string,
  ): Promise<PosterState> {
    const project = await this.find(projectId, tenantId);
    project.grantId = grantId;
    // 직접 고른 것은 추정이 아니다. 근거 표시를 지운다.
    project.grantLinkScore = null;
    project.grantLinkedBy = null;
    await this.projects.save(project);
    return this.state(projectId);
  }

  /** 공고 검색 — 사용자가 직접 고를 목록 */
  searchGrants(term: string) {
    return this.linker.search(term);
  }

  /**
   * 요약 생성을 시작한다.
   *
   * **기다리지 않고 곧바로 돌려준다.** 생성에 몇 분이 걸리는데 HTTP 요청을
   * 붙잡고 있으면 브라우저가 먼저 끊는다. 상태는 DB 에 적어 두고,
   * 화면은 그걸 물어본다.
   */
  async start(
    projectId: string,
    notice?: { fileName: string; content: Buffer },
    tenantId?: string,
  ): Promise<PosterState> {
    const project = await this.find(projectId, tenantId);

    if (project.posterStatus === 'running') {
      // 두 번 눌러도 두 번 돌지 않는다.
      return this.state(projectId);
    }

    project.posterStatus = 'running';
    project.posterNotifiedAt = null;
    project.posterError = null;
    project.posterStartedAt = new Date();
    project.posterUpdatedAt = null;
    project.noticeFileName =
      project.track === 'modoo'
        ? MODOO_NOTICE_LABEL
        : (notice?.fileName ?? null);
    project.status = 'generating';

    /*
     * 파일명이 곧 공고명인 경우가 많다.
     * ("1. 2026년 광주 IP창업존 62기 모집공고(K).pdf")
     * 캘린더에서 고르지 않았다면 여기서 한 번 찾아본다.
     */
    if (project.track !== 'modoo' && !project.grantId && notice?.fileName) {
      const match = await this.linker.find([notice.fileName]);
      if (match) {
        project.grantId = match.grantId;
        project.grantLinkScore = match.score;
        project.grantLinkedBy = match.matchedBy.slice(0, 200);
      }
    }

    await this.projects.save(project);

    /*
     * 공고문을 맡겨 둔다. 만드는 도중에 서버가 다시 뜨면 메모리에 있던
     * 것이 사라지는데, 그때 여기서 도로 꺼내 같은 재료로 다시 만든다.
     */
    if (notice) await this.store.put(project.id, 'notice', notice);

    /*
     * 응답을 막지 않는다. 결과는 DB 로 돌아온다.
     * 사업계획서와 같은 대기열을 쓴다 — 둘 다 같은 PC 의 Claude 한 대를 쓴다.
     */
    this.queue.enqueue(`poster:${project.id}`, () => this.run(project.id, notice));

    return this.state(projectId);
  }

  /**
   * 보완 요청을 반영해 다시 만든다.
   *
   * **기다리지 않고 곧바로 돌려준다.** 문서 전체를 다시 쓰는 작업이라
   * 2분 가까이 걸리는데, 그동안 HTTP 요청을 붙잡고 있으면 중간의 프록시가
   * 먼저 끊는다. 실제로 그렇게 500 이 났다. 결과는 DB 로 돌아온다.
   */
  async revise(
    projectId: string,
    notes: SlotNote[],
    tenantId?: string,
  ): Promise<PosterState> {
    const project = await this.find(projectId, tenantId);
    if (!project.posterDoc) {
      throw new NotFoundException('아직 만들어진 요약이 없습니다.');
    }
    if (project.posterStatus === 'running') return this.state(projectId);

    project.posterStatus = 'running';
    project.posterNotifiedAt = null;
    project.posterError = null;
    project.posterChanges = null;
    await this.projects.save(project);

    this.queue.enqueue(`poster-revise:${project.id}`, () =>
      this.runRevise(project.id, project.posterDoc!, notes),
    );
    return this.state(projectId);
  }

  /** 실제 재작성 — 백그라운드 */
  private async runRevise(
    projectId: string,
    doc: PosterDoc,
    notes: SlotNote[],
  ): Promise<void> {
    try {
      const result = await this.callAgent<ReviseResult>('/poster/revise', {
        doc,
        notes,
      });

      await this.projects.update(projectId, {
        posterDoc: result.doc,
        posterChanges: result.changes,
        posterStatus: 'done',
        posterError: null,
        posterUpdatedAt: new Date(),
      });
      this.logger.log(
        `요약 재작성 완료 — ${result.changes.length}칸 (${projectId})`,
      );
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`요약 재작성 실패 (${projectId}): ${message}`);
      await this.projects.update(projectId, {
        posterStatus: 'done',
        posterError: message,
        posterUpdatedAt: new Date(),
      });
    }
  }

  /* ────────────── 내부 ────────────── */

  /**
   * 사업을 찾는다.
   *
   * `tenantId` 를 주면 소유자까지 확인한다. 백그라운드 작업은 이미 확인을
   * 거친 뒤라 다시 보지 않는다 — 그때는 로그인 정보가 없기도 하다.
   */
  private async find(id: string, tenantId?: string): Promise<Project> {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException('사업을 찾을 수 없습니다.');
    if (tenantId && project.tenantId !== tenantId) {
      throw new ForbiddenException('이 사업에 접근할 권한이 없습니다.');
    }
    return project;
  }

  /** 실제 생성 — 백그라운드에서 돈다 */
  private async run(
    projectId: string,
    notice?: { fileName: string; content: Buffer },
    /** 스스로 다시 잡은 횟수 — 무한히 반복하지 않으려고 센다 */
    retry = 0,
  ): Promise<void> {
    try {
      const project = await this.find(projectId);

      /*
       * 서버가 다시 뜬 뒤라면 공고문이 손에 없다. 맡겨 둔 것을 꺼낸다.
       * 이게 없으면 공고를 못 읽은 채 만들어서, 사용자가 올린 공고와
       * 상관없는 요약이 나온다.
       */
      if (!notice && project.noticeFileName) {
        notice = (await this.store.get(projectId, 'notice')) ?? undefined;
      }
      const profile = await this.profiles.findOne({
        where: { tenantId: project.tenantId, isDefault: true },
      });

      const input: PosterCreateInput = {
        track: project.track,
        title: project.title,
        idea: project.idea,
        company: profile
          ? {
              name: profile.name,
              stage: profile.stage,
              industry: profile.industry,
              region: profile.region,
              foundedAt: profile.foundedAt,
              employees: profile.employees,
            }
          : null,
      };

      const form = new FormData();
      form.append('input', JSON.stringify(input));
      if (notice) {
        form.append(
          'notice',
          new Blob([new Uint8Array(notice.content)]),
          notice.fileName,
        );
      }

      /*
       * **한 번 끊겼다고 포기하지 않는다.**
       *
       * 실행기는 이따금 잠깐 자리를 비운다 — 코드를 고쳐 다시 뜨는 중이거나,
       * 감시기가 되살리는 중이거나. 그 몇 초 때문에 실패로 떨어뜨리면
       * 사용자는 영문도 모르고 다시 눌러야 한다.
       *
       * 되살아나는 데 보통 10~20초가 걸리므로 3초·8초·20초로 벌려 기다린다.
       */
      const res = await this.withRetry(() =>
        fetch(`${this.agentUrl}/poster/create`, {
          method: 'POST',
          headers: this.agentToken
            ? { authorization: `Bearer ${this.agentToken}` }
            : {},
          body: form,
          // 공고문을 읽고 문서 전체를 쓰는 작업이라 오래 걸린다.
          signal: AbortSignal.timeout(900_000),
        }),
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`실행기 응답 ${res.status} — ${body.slice(0, 200)}`);
      }

      const { doc } = (await res.json()) as {
        doc: PosterDoc & { notice?: NoticeDigest };
      };

      /*
       * 공고문에서 뽑은 핵심은 문서에서 떼어내 따로 보관한다.
       * 요약 한 장에 그릴 것은 아니지만, 사업계획서를 쓸 때 필요하다.
       * 공고문 파일은 여기서 지워지므로 지금 챙겨 두지 않으면 다시 못 얻는다.
       */
      const { notice: digest, ...posterDoc } = doc;

      /*
       * 모두의창업은 공고가 하나로 고정이다. 모델이 요약본을 읽고 다시
       * 추려 오게 두면 사람마다 조금씩 다른 공고 정보를 갖게 된다.
       * 미리 정리해 둔 것을 쓴다.
       */
      await this.finish(
        projectId,
        posterDoc as PosterDoc,
        project.track === 'modoo' ? MODOO_NOTICE_DIGEST : (digest ?? null),
      );
      /* 다 만들었으니 맡겨 둔 공고문은 치운다 */
      await this.store.drop(projectId, 'notice');
    } catch (err) {
      const message = (err as Error).message;

      /*
       * **실행기가 잠깐 없던 것이면 스스로 다시 잡는다.**
       *
       * 사용자가 뭘 잘못한 게 아니다. 실행기가 다시 뜨는 중이었거나
       * 감시기가 되살리는 중이었을 뿐이다. 그걸 "실패했으니 다시
       * 누르세요"로 넘기면, 사용자는 영문도 모른 채 몇 번이나 눌러야 한다.
       *
       * 화면에는 여전히 만드는 중으로 보인다 — 상태를 `failed` 로
       * 바꾸지 않기 때문이다. 사용자는 끊긴 줄도 모른다.
       */
      const connectionLost = /연결할 수 없습니다|fetch failed|ECONNREFUSED/.test(
        message,
      );
      const tries = retry + 1;

      if (connectionLost && tries <= MAX_SELF_RETRY) {
        this.logger.warn(
          `실행기가 없어 멈췄습니다 — ${SELF_RETRY_WAIT_MS / 1000}초 뒤 ` +
            `다시 만듭니다 (${tries}/${MAX_SELF_RETRY}) ${projectId}`,
        );
        await sleep(SELF_RETRY_WAIT_MS);
        return this.run(projectId, notice, tries);
      }

      this.logger.warn(`요약 생성 실패 (${projectId}): ${message}`);
      await this.fail(projectId, message);
    }
  }

  private async finish(
    projectId: string,
    doc: PosterDoc,
    notice: NoticeDigest | null = null,
  ): Promise<void> {
    const patch: Partial<Project> = {
      posterDoc: doc,
      ...(notice ? { noticeDigest: notice } : {}),
      posterStatus: 'done',
      posterError: null,
      posterUpdatedAt: new Date(),
      status: 'answering',
    };

    /*
     * 파일명으로 못 찾았다면 공고문 본문에서 읽어낸 사업명으로 다시 찾는다.
     * eyebrow 에는 모델이 읽은 "기관 + 사업명"이 들어 있다.
     */
    const project = await this.find(projectId);
    // 모두의창업은 공고가 이미 정해져 있다. 비슷한 이름을 찾아 붙일 이유가 없다.
    if (project.track !== 'modoo' && !project.grantId && doc.eyebrow) {
      const match = await this.linker.find([doc.eyebrow, doc.title]);
      if (match) {
        patch.grantId = match.grantId;
        patch.grantLinkScore = match.score;
        patch.grantLinkedBy = match.matchedBy.slice(0, 200);
      }
    }

    await this.projects.update(projectId, patch);
    this.logger.log(`요약 생성 완료 — ${projectId}`);
  }

  private async fail(projectId: string, message: string): Promise<void> {
    await this.projects.update(projectId, {
      posterStatus: 'failed',
      posterError: message,
      posterUpdatedAt: new Date(),
      status: 'draft',
    });
  }

  private async callAgent<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.agentUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.agentToken ? { authorization: `Bearer ${this.agentToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(600_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `로컬 실행기에 연결할 수 없습니다 (${this.agentUrl}). 실행 중인지 확인해 주세요. — ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`${path} 실패 ${res.status}: ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException(`요청에 실패했습니다 (${res.status}).`);
    }

    return (await res.json()) as T;
  }
}
