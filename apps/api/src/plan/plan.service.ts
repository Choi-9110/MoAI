import {
  ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MODOO_NOTICE_DIGEST, PLAN_CONTEXT_CHARS, PLAN_FORMAT_SPECS, PLAN_KIND_LABELS,
  RESEARCH_TOPICS, outlineFor,
} from '@moai/shared';
import type {
  PlanDoc, PlanFinding, PlanFormat, PlanKind, PlanKindInput, PlanProgress,
  PlanSection, PlanSectionInput, ResearchNote,
} from '@moai/shared';
import { AttachmentStoreService } from '../common/attachment-store.service';
import { LocalQueueService } from '../common/local-queue.service';
import { Grant } from '../grants/entities/grant.entity';
import { Project } from '../projects/entities/project.entity';

/** 화면이 폴링하는 작성 상태 */
export interface PlanState {
  status: Project['planStatus'];
  doc: PlanDoc | null;
  progress: PlanProgress | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  templateName: string | null;
  /** 어떤 틀로 썼는가 */
  format: PlanFormat | null;
  /** 요약 한 장이 있어야 사업계획서를 쓸 수 있다 */
  hasPoster: boolean;
}

type OutlineEntry = Pick<PlanSection, 'id' | 'title' | 'brief' | 'frame'>;

/**
 * 사업계획서 작성 — 로컬 실행기로 넘긴다.
 *
 * 절을 하나씩 쓰고 **그때그때 저장한다.** 절마다 1분 가까이 걸려서
 * 통으로 만들면 십수 분을 아무것도 못 보고 기다려야 하고, 중간에 끊기면
 * 처음부터 다시다. 절 단위로 하면 다 된 것부터 읽을 수 있다.
 */
/**
 * 실행기가 없어 멈췄을 때 스스로 다시 잡는 간격.
 *
 * **얼마나 버텨야 하는가는 되살아나는 방식이 정한다.**
 *
 *   PM2 가 살릴 때      프로세스가 죽은 즉시 → 10~20초
 *   감시기가 살릴 때    떠 있는데 답을 안 하는 경우다. 60초마다 묻고
 *                       **두 번 연속** 실패해야 손을 대므로 최대 2분,
 *                       거기에 다시 뜨는 시간까지 2분 반쯤
 *
 * 예전에는 30초씩 세 번(1분 반)만 기다렸다. PM2 쪽은 넘겼지만 감시기
 * 쪽은 못 넘겼다 — **되살아나기 직전에 포기하고** 실패로 적었다.
 * 사용자에게는 "다시 눌러 주세요"가 뜨는데, 그 무렵이면 이미 멀쩡하다.
 *
 * 그래서 간격을 벌리며 다섯 번까지 기다린다(총 11분 반). 처음엔 촘촘히
 * 물어 빨리 이어 가고, 오래 걸리는 경우에는 뜸하게 물어 헛걸음을 줄인다.
 *
 * **기다리는 동안에도 화면은 여전히 진행 중이다.** 절마다 저장해 두었으니
 * 돌아오면 쓰던 자리에서 이어진다 — 사용자는 끊긴 줄도 모른다.
 */
const SELF_RETRY_WAITS_MS = [30_000, 60_000, 120_000, 180_000, 300_000];
const MAX_SELF_RETRY = SELF_RETRY_WAITS_MS.length;

@Injectable()
export class PlanService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    private readonly queue: LocalQueueService,
    private readonly store: AttachmentStoreService,
  ) {}

  /**
   * 서버가 다시 뜰 때, 쓰다 만 것을 이어 쓴다.
   *
   * **왜 필요한가.** 작성은 몇 분씩 걸린다. 그 사이 서버가 다시 뜨면
   * 하던 일은 메모리와 함께 사라지는데, DB 에는 `running` 으로 남는다.
   * 아무도 그걸 이어받지 않으니 화면은 **영원히 로딩**이고, 사용자는
   * 무슨 일이 있었는지도 모른 채 기다리다 결국 다시 누른다.
   *
   * 그래서 뜨자마자 훑어보고 도로 줄에 세운다. 절마다 저장해 두었으므로
   * 처음부터가 아니라 **쓰던 자리에서** 이어진다.
   */
  async onApplicationBootstrap(): Promise<void> {
    /* 파일 정리를 먼저 — 어제 것이 남아 있으면 여기서 걷힌다 */
    await this.store.sweep();

    const stuck = await this.projects.find({
      where: { planStatus: 'running' },
      select: { id: true, planFormat: true, planTemplateName: true },
    });
    if (stuck.length === 0) return;

    this.logger.log(`쓰다 만 사업계획서 ${stuck.length}건을 이어서 씁니다.`);
    for (const p of stuck) {
      this.queue.enqueue(`plan:${p.id}`, () =>
        this.run(p.id, undefined, p.planFormat ?? 'gov'),
      );
    }
  }

  private get agentUrl(): string {
    return process.env.AGENT_BASE_URL ?? 'http://localhost:4100';
  }

  private get agentToken(): string {
    return process.env.AGENT_TOKEN ?? '';
  }

  async state(projectId: string, tenantId?: string): Promise<PlanState> {
    const project = await this.find(projectId, tenantId);
    return {
      status: project.planStatus,
      doc: project.planDoc,
      progress: project.planProgress,
      error: project.planError,
      startedAt: project.planStartedAt?.toISOString() ?? null,
      updatedAt: project.planUpdatedAt?.toISOString() ?? null,
      templateName: project.planTemplateName,
      format: project.planFormat,
      hasPoster: project.posterDoc !== null,
    };
  }

  /**
   * 작성을 시작한다. 기다리지 않고 곧바로 돌려준다.
   *
   * 양식은 선택이다 — 공고에 양식이 안 붙어 있는 경우가 흔하다.
   * 없으면 일반적인 정부지원사업 목차로 쓴다.
   */
  async start(
    projectId: string,
    template?: { fileName: string; content: Buffer },
    tenantId?: string,
    format: PlanFormat = 'gov',
  ): Promise<PlanState> {
    const project = await this.find(projectId, tenantId);

    if (!project.posterDoc) {
      throw new NotFoundException(
        '요약 한 장을 먼저 만들어야 사업계획서를 쓸 수 있습니다.',
      );
    }
    if (project.planStatus === 'running') {
      // 두 번 눌러도 두 번 돌지 않는다.
      return this.state(projectId);
    }

    project.planStatus = 'running';
    project.planError = null;
    // 다시 돌리는 것이므로 지난번 알림 표시는 지운다.
    project.planNotifiedAt = null;
    project.planStartedAt = new Date();
    project.planUpdatedAt = null;
    project.planProgress = { done: 0, total: 0, current: '자료 분석 중' };
    project.planFormat = format;
    project.planTemplateName = template?.fileName ?? null;
    await this.projects.save(project);

    /*
     * 양식 파일을 맡겨 둔다. 쓰는 도중에 서버가 다시 뜨면 메모리에 있던
     * 것이 사라지는데, 그때 여기서 도로 꺼내 이어 쓴다.
     */
    if (template) await this.store.put(project.id, 'template', template);

    /*
     * 로컬 CLI 는 한 대뿐이라 줄을 세운다. 기다리는 동안 화면에는
     * "자료 분석 중"으로 남는다 — 순번이나 예상 시간은 알리지 않는다.
     */
    this.queue.enqueue(`plan:${project.id}`, () =>
      this.run(project.id, template, format),
    );
    return this.state(projectId);
  }

  /**
   * 같은 요약으로 **사업계획서를 하나 더** 쓴다.
   *
   * 공고마다 양식이 다르다. 같은 아이템으로 창업도약패키지에도 내고 지자체
   * 사업에도 내는데, 지금은 두 번째를 쓰려면 첫 번째를 덮어써야 했다.
   * 그러면 앞서 낸 것이 사라진다.
   *
   * **요약 한 장까지는 같으니 거기까지 그대로 옮기고 문서만 비운다.**
   * 아이디어를 다시 쓰거나 요약을 다시 만들 이유가 없다 — 달라지는 것은
   * 공고와 양식뿐이다.
   *
   * 새 사업으로 만드는 이유는 목록에서 나란히 보이게 하기 위해서다.
   * 한 사업 안에 문서를 여러 개 두면 목록에서는 하나로 보여서, 어느 공고에
   * 무엇을 냈는지 찾으려면 들어가 봐야 한다.
   */
  async duplicate(
    projectId: string,
    title?: string,
    tenantId?: string,
    /**
     * 요약 한 장을 그대로 옮길 것인가.
     *
     * - true (기본): 베껴서 넘긴다. 비슷한 공고 두 곳에 낼 때는 몇 칸만
     *   고치면 되므로 이쪽이 훨씬 빠르다.
     * - false: 아이디어만 갖고 가고 **요약부터 다시 만든다.** 창업지원에서
     *   R&D 과제로 갈아타는 것처럼 공고 성격이 달라지면, 요약에 들어갈
     *   내용 자체가 달라서 고쳐 쓰는 것보다 새로 뽑는 편이 낫다.
     *   이때는 공고 연결도 함께 비운다 — 새 공고문을 받아야 하기 때문이다.
     */
    keepPoster = true,
  ): Promise<Project> {
    const src = await this.find(projectId, tenantId);

    if (!src.posterDoc) {
      throw new NotFoundException(
        '요약 한 장이 있어야 다음 버전을 만들 수 있습니다.',
      );
    }

    const copy = this.projects.create({
      /*
       * 어디서 갈라져 나왔는지 남긴다.
       *
       * 지금은 아무 화면도 이 값을 쓰지 않는다. 나중에 목록에서 같은 뿌리끼리
       * 묶어 보여주거나, 아이디어를 위 단계로 올릴 때 필요하다 —
       * **그때 안 남겨 뒀으면 누가 누구의 복제본인지 복원할 방법이 없다.**
       * 원본이 이미 복제본이면 그 뿌리를 그대로 물려받는다 (v3 도 v1 을 가리킨다).
       */
      originProjectId: src.originProjectId ?? src.id,

      // 그대로 옮기는 것 — 요약 한 장까지의 재료
      tenantId: src.tenantId,
      userId: src.userId,
      templateId: src.templateId,
      templateKind: src.templateKind,
      track: src.track,
      modooAnswers: src.modooAnswers,
      idea: src.idea,
      title: (title?.trim() || nextVersionTitle(src.title)).slice(0, 200),
      status: src.status,
      answeredCount: src.answeredCount,

      posterDoc: keepPoster ? src.posterDoc : null,
      posterStatus: keepPoster ? 'done' : 'idle',
      posterUpdatedAt: keepPoster ? new Date() : null,
      /*
       * 보완 요청 이력(posterChanges)은 옮기지 않는다. 지난번 문서를 쓸 때
       * 무엇을 고쳤는지는 이 문서와 상관이 없고, 화면에 남아 있으면 이번에
       * 고친 것으로 보인다.
       */

      /*
       * 공고는 그대로 둔다. 다른 공고에 낼 것이면 어차피 바꿔야 하는데,
       * 비워 두면 무엇에 맞춰 쓴 요약인지 모르는 채로 시작하게 된다.
       */
      grantId: keepPoster ? src.grantId : null,
      grantLinkScore: keepPoster ? src.grantLinkScore : null,
      grantLinkedBy: keepPoster ? src.grantLinkedBy : null,
      noticeDigest: keepPoster ? src.noticeDigest : null,
      noticeFileName: keepPoster ? src.noticeFileName : null,

      // 비우는 것 — 사업계획서는 처음부터다
      planStatus: 'idle',
      planDoc: null,
      planProgress: null,
      planError: null,
      planFormat: null,
      planTemplateName: null,
      planStartedAt: null,
      planUpdatedAt: null,
      planNotifiedAt: null,
      posterNotifiedAt: null,
    });

    const saved = await this.projects.save(copy);
    this.logger.log(`새 버전 — "${saved.title}" (원본 ${projectId})`);
    return saved;
  }

  /** 내려받는 파일 이름에 쓸 사업 제목 */
  async titleOf(projectId: string, tenantId?: string): Promise<string> {
    const project = await this.find(projectId, tenantId);
    return project.title;
  }

  /* ────────────── 내부 ────────────── */

  /** `tenantId` 를 주면 소유자까지 확인한다 */
  /**
   * 지금까지의 진행 수치.
   *
   * 문구만 바꿔 쓰려고 부른다 — `done`/`total` 을 모르고 덮으면 진행 막대가
   * 0 으로 튀어, 다 써 놓은 절이 사라진 것처럼 보인다.
   */
  private async progressOf(projectId: string): Promise<PlanProgress> {
    const p = await this.projects.findOne({
      where: { id: projectId },
      select: { id: true, planProgress: true },
    });
    return p?.planProgress ?? { done: 0, total: 0, current: null };
  }

  private async find(id: string, tenantId?: string): Promise<Project> {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException('사업을 찾을 수 없습니다.');
    if (tenantId && project.tenantId !== tenantId) {
      throw new ForbiddenException('이 사업에 접근할 권한이 없습니다.');
    }
    return project;
  }

  /** 목차를 받고 절을 하나씩 쓴다 — 백그라운드 */
  private async run(
    projectId: string,
    template?: { fileName: string; content: Buffer },
    format: PlanFormat = 'gov',
    /** 스스로 다시 잡은 횟수 — 무한히 반복하지 않으려고 센다 */
    retry = 0,
  ): Promise<void> {
    try {
      const project = await this.find(projectId);

      /*
       * 서버가 다시 뜬 뒤라면 양식 파일이 손에 없다. 맡겨 둔 것을 꺼낸다.
       * 이게 없으면 목차를 고정 목차로 잡아 버려서, 사용자가 올린 양식과
       * 다른 문서가 나온다.
       */
      if (!template && project.planTemplateName) {
        template = (await this.store.get(projectId, 'template')) ?? undefined;
      }

      /*
       * 여기부터가 실제 차례다. 대기열에서 기다리는 동안에는 화면에
       * "작성 대기 중"으로 남아 있다가, 자리가 나면 이 줄에서 바뀐다.
       */
      if (project.planStatus !== 'running') {
        this.logger.log(`대기 중 취소됨 — ${projectId}`);
        return;
      }
      await this.projects.update(projectId, {
        planProgress: { done: 0, total: 0, current: '목차 확인 중' },
      });

      const grant = project.grantId
        ? await this.grants.findOne({ where: { id: project.grantId } })
        : null;

      /*
       * 모두의창업 양식(PSSD·PSST)을 골랐는데 공고 정보가 없는 경우가 있다 —
       * 정부사업으로 시작했다가 모두의창업에 내기로 바꾼 경우다.
       * 그때도 공고는 하나로 정해져 있으니 채워 준다.
       *
       * 목차를 정하기 전에 구한다. 양식을 안 올렸을 때 **이 사업이 연구개발
       * 과제인지** 판정하는 재료가 바로 이 공고이기 때문이다.
       */
      const notice =
        project.noticeDigest ??
        (format === 'pssd' || format === 'psst' ? MODOO_NOTICE_DIGEST : null);

      /*
       * PSSD·PSST 는 주최측이 목차를 정해 두었다. 그런 양식까지 모델에게
       * 목차를 물어보면 느리기만 하고, 답이 매번 조금씩 달라져 더 나쁘다.
       *
       * 단, **양식 파일을 올렸으면 그쪽이 이긴다.** 우리가 아는 목차는
       * 공개 자료에서 옮긴 것이고, 사용자가 손에 든 양식이 그 해의 진짜다.
       * 그때도 작성 지침(PSSD·PSST)은 그대로 읽는다 — 목차는 양식에서,
       * 쓰는 법은 지침에서 온다.
       */
      const fixed = template ? null : outlineFor(format);
      const { templateName, sections: outline } = fixed
        ? {
            templateName: PLAN_FORMAT_SPECS[format].label,
            // 고정 목차에서는 절이 곧 칸이다.
            sections: fixed.map((s) => ({ ...s, frame: s.id })),
          }
        : await this.fetchOutline(template, format, {
            title: project.title,
            idea: project.idea,
            grantTitle: grant?.title ?? notice?.name ?? null,
            notice,
          });

      /*
       * **써 둔 것이 있으면 살려 온다.**
       *
       * 끊겼다가 다시 시작할 때 문서를 빈칸으로 새로 만들면, 앞서 쓴 절이
       * 통째로 사라져 처음부터 다시 쓰게 된다. 목차가 그대로면 이전에 쓴
       * 몸통을 그대로 옮겨 담고, 빈 절부터 이어 쓴다.
       *
       * 목차가 달라졌다면(양식을 바꿨거나 공고가 바뀌었다면) 살리지 않는다 —
       * 다른 목차에 쓴 글을 옮겨 붙이면 앞뒤가 안 맞는다.
       */
      const prev = project.planDoc;
      const doc: PlanDoc = {
        templateName,
        sections: outline.map((s, i) => {
          const old = prev?.sections?.[i];
          const reusable = old?.title === s.title && Boolean(old?.body?.trim());
          return reusable
            ? { ...s, body: old!.body, openQuestions: old!.openQuestions ?? [] }
            : { ...s, body: '', openQuestions: [] };
        }),
      };

      await this.projects.update(projectId, {
        planDoc: doc,
        planTemplateName: templateName,
        planProgress: { done: 0, total: outline.length, current: outline[0]?.title ?? null },
        planUpdatedAt: new Date(),
      });

      /*
       * 집필 전에 근거를 찾아 온다.
       *
       * 목차는 "시장 규모를 산식과 출처를 붙여", "경쟁 비교표"를 요구하는데
       * 재료에는 그런 것이 없다. 그러면 비워 두거나 지어내게 된다.
       * 네 편을 **동시에** 돌린다 — 서로 볼 것이 없어 순서가 의미 없다.
       *
       * **찾아 둔 것이 있으면 다시 찾지 않는다.**
       *
       * 절은 살려 오면서 리서치는 안 살리고 있었다. 그래서 여기 다시 들어올
       * 때마다 — 실행기가 끊겨 스스로 재시도할 때, 서버가 다시 떠서 이어
       * 쓸 때 — 웹 검색 네 편을 처음부터 다시 돌렸다. 이게 한 번에 제일
       * 비싼 구간이다(도구를 쓰므로 최대 12턴). 오늘 밤처럼 여러 번
       * 되살아난 날에는 같은 검색값을 네 번, 다섯 번 치른 셈이다.
       *
       * 재시도 한도를 3 → 5 로 늘리면서 이 값이 더 커졌으므로 같이 막는다.
       * 근거 자료는 몇 분 사이에 달라질 것이 아니라 다시 찾을 이유도 없다.
       */
      /*
       * 단, **양식이 그대로일 때만** 살린다. R&D 와 일반은 같은 주제를
       * 찾아도 무엇을 중요하게 보는지가 달라서, 양식을 바꿔 다시 쓰는
       * 경우에는 새로 찾는 편이 맞다. 절을 살릴 때 목차가 같은지 보는 것과
       * 같은 이유다.
       */
      const kept =
        prev?.templateName === templateName ? (prev?.research ?? null) : null;

      const research = kept?.length
        ? kept
        : await this.gatherResearch(projectId, {
            title: project.title,
            idea: project.idea,
            poster: project.posterDoc,
            notice,
            grantTitle: grant?.title ?? notice?.name ?? null,
            kind: templateName === PLAN_KIND_LABELS.rnd ? 'rnd' : 'general',
          });

      if (kept?.length) {
        this.logger.log(
          `찾아 둔 근거 ${kept.length}편이 있어 다시 찾지 않습니다 — ${projectId}`,
        );
      }

      if (research.length > 0) {
        doc.research = research;
        await this.projects.update(projectId, { planDoc: doc, planUpdatedAt: new Date() });
      }

      /*
       * **이미 쓴 절은 다시 쓰지 않는다.**
       *
       * 여덟 절 중 다섯째에서 끊겼을 때 처음부터 다시 쓰면, 앞의 네 절을
       * 버리고 같은 값을 치르게 된다 — 시간도 돈도 두 배다. 절마다 저장해
       * 두었으므로 **비어 있는 절부터** 이어 쓴다.
       */
      /*
       * **앞부분만 담는다.**
       *
       * 실행기는 앞서 쓴 절을 `PLAN_CONTEXT_CHARS` 만큼만 본다 — 되풀이를
       * 피하는 데 그 이상은 필요 없기 때문이다. 그런데 여기서는 전문을
       * 담아 보내고 있었다. 절이 쌓일수록 요청이 커져 여덟째 절쯤에서
       * 100KB 를 넘겼고, 실행기가 `요청이 너무 큽니다` 로 튕겼다.
       *
       * 쓰이지도 않을 글자 때문에 문서가 끝까지 못 갔던 것이다.
       */
      const written: Pick<PlanSection, 'title' | 'body'>[] = [];
      const brief = (body: string) => body.slice(0, PLAN_CONTEXT_CHARS);
      let resumed = 0;

      for (const s of doc.sections) {
        if (!s.body?.trim()) break;
        written.push({ title: s.title, body: brief(s.body) });
        resumed += 1;
      }

      if (resumed > 0) {
        this.logger.log(
          `${resumed}절까지 써 둔 것이 있어 ${resumed + 1}절부터 이어 씁니다 — ${projectId}`,
        );
      }

      for (let i = resumed; i < outline.length; i++) {
        const section = outline[i];

        // 사용자가 중간에 지웠을 수도 있다. 매번 확인한다.
        const alive = await this.projects.findOne({ where: { id: projectId } });
        if (!alive || alive.planStatus !== 'running') {
          this.logger.log(`작성 중단 — ${projectId}`);
          return;
        }

        const input: PlanSectionInput = {
          title: project.title,
          idea: project.idea,
          poster: project.posterDoc!,
          notice,
          grantTitle: grant?.title ?? notice?.name ?? null,
          outline,
          section,
          written,
          format,
          research,
        };

        const result = await this.callAgent<{
          body: string;
          openQuestions: string[];
        }>('/plan/section', input);

        doc.sections[i] = {
          ...section,
          body: result.body,
          openQuestions: result.openQuestions ?? [],
        };
        written.push({ title: section.title, body: brief(result.body) });

        await this.projects.update(projectId, {
          planDoc: doc,
          planProgress: {
            done: i + 1,
            total: outline.length,
            current: outline[i + 1]?.title ?? null,
          },
          planUpdatedAt: new Date(),
        });
      }

      /*
       * 마지막 점검.
       *
       * 절마다 그럴듯해도 문서 전체로는 어긋나는 것이 남는다 — 자금 합계와
       * 일정의 불일치, 절마다 다른 시장 수치, 무엇보다 **지어낸 출처**.
       * 절을 쓰는 호출은 앞 절을 400자씩만 보므로 이런 것을 못 잡는다.
       *
       * 점검에 실패해도 문서는 이미 다 쓰여 있다. 그래서 여기서 나는 오류는
       * 작성 자체를 실패로 만들지 않는다 — 점검만 건너뛴다.
       */
      const review = await this.reviewAndFix(projectId, doc, {
        title: project.title,
        idea: project.idea,
        poster: project.posterDoc!,
        notice,
        grantTitle: grant?.title ?? notice?.name ?? null,
        outline,
        format,
      });
      doc.review = review;

      await this.projects.update(projectId, {
        planStatus: 'done',
        planError: null,
        planDoc: doc,
        planProgress: { done: outline.length, total: outline.length, current: null },
        planUpdatedAt: new Date(),
        status: 'completed',
      });
      this.logger.log(`사업계획서 완료 — ${outline.length}절 (${projectId})`);
      /* 다 썼으니 맡겨 둔 양식은 치운다 */
      await this.store.drop(projectId, 'template');
    } catch (err) {
      const message = (err as Error).message;

      /*
       * **실행기가 잠깐 없던 것이면 스스로 다시 잡는다.**
       *
       * 이건 사용자가 뭘 잘못한 게 아니다. 실행기가 다시 뜨는 중이었거나
       * 감시기가 되살리는 중이었을 뿐이다. 그걸 "실패했으니 다시 누르세요"로
       * 넘기면, 사용자는 영문도 모른 채 몇 번이나 눌러야 한다.
       *
       * 절마다 저장해 두었으므로 **쓰던 자리에서 이어진다.** 화면에는
       * 여전히 진행 중으로 보이고, 사용자는 끊긴 줄도 모른다.
       */
      const connectionLost = /연결할 수 없습니다|fetch failed|ECONNREFUSED/.test(
        message,
      );
      const tries = (retry ?? 0) + 1;
      const wait = SELF_RETRY_WAITS_MS[tries - 1];

      if (connectionLost && wait !== undefined) {
        this.logger.warn(
          `실행기가 없어 멈췄습니다 — ${wait / 1000}초 뒤 ` +
            `이어서 씁니다 (${tries}/${MAX_SELF_RETRY}) ${projectId}`,
        );

        /*
         * **화면에도 알린다.**
         *
         * 상태는 계속 `running` 이라 사용자는 로딩만 본다. 그런데 문구가
         * 몇 분째 "3. 개발 방안 쓰는 중"에 멈춰 있으면 굳은 것처럼 보인다.
         * 무엇을 기다리는지 적어 두면 같은 로딩도 멈춘 것으로 안 보인다.
         */
        await this.projects
          .update(projectId, {
            planProgress: {
              ...(await this.progressOf(projectId)),
              current: '생성 서버가 다시 뜨기를 기다리는 중',
            },
            planUpdatedAt: new Date(),
          })
          .catch(() => undefined);

        await sleep(wait);
        return this.run(projectId, template, format, tries);
      }

      this.logger.warn(`사업계획서 작성 실패 (${projectId}): ${message}`);
      await this.projects.update(projectId, {
        planStatus: 'failed',
        planError: message,
        planUpdatedAt: new Date(),
      });
    }
  }

  /**
   * 리서치 네 편을 동시에 돌린다.
   *
   * 시장·경쟁·특허/규제·동향. 한 번에 다 시키면 시장 얘기만 잔뜩 하고
   * 특허는 한 줄로 끝나므로 종류별로 따로 부른다. 서로 참조할 것이 없어
   * **순서가 의미 없고**, 그래서 병렬로 던진다.
   *
   * **실패해도 계속 간다.** 근거 없이 쓰면 [확인필요]가 늘어날 뿐이지만,
   * 여기서 멈추면 문서가 아예 안 나온다. 넷 다 실패해도 마찬가지다.
   */
  private async gatherResearch(
    projectId: string,
    ctx: {
      title: string;
      idea: string;
      poster: Project['posterDoc'];
      notice: Project['noticeDigest'];
      grantTitle: string | null;
      kind: PlanKind;
    },
  ): Promise<ResearchNote[]> {
    if (process.env.PLAN_RESEARCH === 'false') return [];

    await this.projects.update(projectId, {
      planProgress: { done: 0, total: 0, current: '근거 자료 찾는 중' },
      planUpdatedAt: new Date(),
    });

    const started = Date.now();

    const results = await Promise.all(
      RESEARCH_TOPICS.map((topic) =>
        this.callAgent<ResearchNote | null>('/plan/research', {
          topic,
          title: ctx.title,
          idea: ctx.idea,
          poster: ctx.poster,
          notice: ctx.notice,
          grantTitle: ctx.grantTitle,
          kind: ctx.kind,
        }).catch((err) => {
          this.logger.warn(`리서치 실패 (${topic}): ${(err as Error).message}`);
          return null;
        }),
      ),
    );

    const notes = results.filter((r): r is ResearchNote => Boolean(r?.body));
    const seconds = Math.round((Date.now() - started) / 1000);

    this.logger.log(
      `리서치 ${notes.length}/${RESEARCH_TOPICS.length}편 · ${seconds}초 — ` +
        `출처 ${notes.reduce((n, r) => n + r.sources.length, 0)}건 (${projectId})`,
    );

    return notes;
  }

  /**
   * 다 쓴 문서를 점검하고, 심하게 걸린 절만 다시 쓴다.
   *
   * **다시 쓰는 절은 최대 4개로 묶는다.** 점검이 관대하면 절반이 걸리는데,
   * 다시 쓸수록 좋아진다는 보장이 없고 그만큼 오래 걸린다. 심한 것부터
   * 넷만 고치고 나머지는 결과에 남겨 사용자가 보게 한다.
   *
   * 실패해도 예외를 올리지 않는다 — 본문은 이미 다 쓰여 있고, 점검을 못 한
   * 것이 작성을 실패로 만들 이유는 없다.
   */
  private async reviewAndFix(
    projectId: string,
    doc: PlanDoc,
    ctx: {
      title: string;
      idea: string;
      poster: NonNullable<Project['posterDoc']>;
      notice: Project['noticeDigest'];
      grantTitle: string | null;
      outline: OutlineEntry[];
      format: PlanFormat;
    },
  ): Promise<PlanDoc['review']> {
    const checkedAt = new Date().toISOString();

    try {
      await this.projects.update(projectId, {
        planProgress: {
          done: doc.sections.length,
          total: doc.sections.length,
          current: '마지막 점검 중',
        },
        planUpdatedAt: new Date(),
      });

      const { findings } = await this.callAgent<{ findings: PlanFinding[] }>(
        '/plan/review',
        {
          title: ctx.title,
          idea: ctx.idea,
          poster: ctx.poster,
          notice: ctx.notice,
          grantTitle: ctx.grantTitle,
          sections: doc.sections.map((s) => ({
            id: s.id,
            title: s.title,
            brief: s.brief,
            body: s.body,
            openQuestions: s.openQuestions,
          })),
        },
      );

      if (findings.length === 0) {
        this.logger.log(`점검 통과 — ${projectId}`);
        return { findings: [], rewritten: [], checkedAt };
      }

      // 다시 쓸 절: severity high 인 것만, 절 단위로 묶어서, 최대 4개.
      const bySection = new Map<string, PlanFinding[]>();
      for (const f of findings) {
        if (f.severity !== 'high' || !f.sectionId) continue;
        const list = bySection.get(f.sectionId) ?? [];
        list.push(f);
        bySection.set(f.sectionId, list);
      }
      const targets = [...bySection.entries()].slice(0, 4);

      if (targets.length < bySection.size) {
        this.logger.warn(
          `다시 쓸 절이 ${bySection.size}개라 앞의 ${targets.length}개만 고칩니다 — ${projectId}`,
        );
      }

      const rewritten: string[] = [];

      for (const [sectionId, sectionFindings] of targets) {
        const alive = await this.projects.findOne({ where: { id: projectId } });
        if (!alive || alive.planStatus !== 'running') {
          this.logger.log(`점검 중 중단 — ${projectId}`);
          return { findings, rewritten, checkedAt };
        }

        const index = doc.sections.findIndex((s) => s.id === sectionId);
        if (index === -1) continue;
        const section = doc.sections[index];

        await this.projects.update(projectId, {
          planProgress: {
            done: doc.sections.length,
            total: doc.sections.length,
            current: `${section.title} 다시 쓰는 중`,
          },
          planUpdatedAt: new Date(),
        });

        /*
         * 다시 쓸 때 `written` 에서 자기 자신은 뺀다.
         * 자기 옛 본문을 "앞서 쓴 절"로 들려주면 그대로 다시 쓴다.
         */
        const input: PlanSectionInput & { findings: PlanFinding[] } = {
          title: ctx.title,
          idea: ctx.idea,
          poster: ctx.poster,
          notice: ctx.notice,
          grantTitle: ctx.grantTitle,
          outline: ctx.outline,
          section,
          written: doc.sections
            .filter((s) => s.id !== sectionId && s.body)
            .map((s) => ({ title: s.title, body: s.body })),
          format: ctx.format,
          research: doc.research ?? null,
          findings: sectionFindings,
        };

        const result = await this.callAgent<{
          body: string;
          openQuestions: string[];
        }>('/plan/section', input);

        doc.sections[index] = {
          ...section,
          body: result.body,
          openQuestions: result.openQuestions ?? [],
        };
        rewritten.push(sectionId);

        await this.projects.update(projectId, {
          planDoc: doc,
          planUpdatedAt: new Date(),
        });
      }

      this.logger.log(
        `점검 완료 — ${findings.length}건 지적, ${rewritten.length}개 절 다시 씀 (${projectId})`,
      );
      return { findings, rewritten, checkedAt };
    } catch (err) {
      this.logger.warn(
        `점검을 건너뜁니다: ${(err as Error).message} — 본문은 그대로 둡니다 (${projectId})`,
      );
      return null;
    }
  }

  /**
   * 양식을 실행기로 보내 목차를 받는다.
   *
   * 양식이 없으면 실행기가 `context` 로 **연구개발과제인지** 판정해
   * 그에 맞는 표준 목차를 돌려준다.
   */
  private async fetchOutline(
    template?: { fileName: string; content: Buffer },
    format: PlanFormat = 'gov',
    context?: PlanKindInput,
  ): Promise<{ templateName: string; sections: OutlineEntry[] }> {
    const form = new FormData();
    form.append('format', format);
    if (context) form.append('context', JSON.stringify(context));
    if (template) {
      form.append(
        'template',
        new Blob([new Uint8Array(template.content)]),
        template.fileName,
      );
    }

    let res: Response;
    try {
      res = await fetch(`${this.agentUrl}/plan/outline`, {
        method: 'POST',
        headers: this.agentToken
          ? { authorization: `Bearer ${this.agentToken}` }
          : {},
        body: form,
        signal: AbortSignal.timeout(600_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `로컬 실행기에 연결할 수 없습니다 (${this.agentUrl}). 실행 중인지 확인해 주세요. — ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`목차를 만들지 못했습니다 (${res.status}) — ${body.slice(0, 200)}`);
    }
    return (await res.json()) as { templateName: string; sections: OutlineEntry[] };
  }

  /**
   * 실행기에 일을 시킨다 — **한 번 끊겼다고 포기하지 않는다.**
   *
   * 실행기는 이따금 잠깐 자리를 비운다. 코드를 고쳐 다시 뜨는 중일 수도,
   * 감시기가 되살리는 중일 수도 있다. 그 몇 초 때문에 **여덟 절 중 다섯째에서
   * 통째로 실패**하면, 앞의 네 절이 버려지고 사용자는 처음부터 다시 눌러야
   * 한다. 돈도 시간도 두 배로 든다.
   *
   * 그래서 잠깐 쉬었다 다시 부른다. 실행기가 되살아나는 데 보통 10~20초가
   * 걸리므로 **3초 · 8초 · 20초** 로 벌려 세 번까지 기다린다.
   *
   * 다만 **연결이 안 될 때만** 다시 부른다. 실행기가 400 을 돌려줬다면
   * 요청이 잘못된 것이라, 같은 요청을 또 보내 봐야 같은 답이 온다.
   */
  private async callAgent<T>(path: string, body: unknown): Promise<T> {
    const waits = [3_000, 8_000, 20_000];
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= waits.length; attempt += 1) {
      try {
        const res = await fetch(`${this.agentUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.agentToken
              ? { authorization: `Bearer ${this.agentToken}` }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(600_000),
        });

        if (res.ok) return (await res.json()) as T;

        const text = await res.text().catch(() => '');

        /*
         * 5xx 는 실행기가 잠깐 맛이 간 것이라 다시 부를 만하다.
         * 4xx 는 우리가 잘못 보낸 것이니 다시 보내도 소용없다.
         */
        if (res.status < 500) {
          throw new Error(`${path} 실패 (${res.status}) — ${text.slice(0, 200)}`);
        }
        lastErr = new Error(
          `${path} 실패 (${res.status}) — ${text.slice(0, 200)}`,
        );
      } catch (err) {
        /* 위에서 우리가 던진 4xx 는 그대로 올려보낸다 */
        if (err instanceof Error && /실패 \(4\d\d\)/.test(err.message)) throw err;
        lastErr = err as Error;
      }

      const wait = waits[attempt];
      if (wait === undefined) break;

      this.logger.warn(
        `실행기 응답 없음 (${attempt + 1}/${waits.length + 1}) — ` +
          `${wait / 1000}초 뒤 다시 시도합니다. ${lastErr?.message?.slice(0, 80) ?? ''}`,
      );
      await sleep(wait);
    }

    throw new ServiceUnavailableException(
      `로컬 실행기에 연결할 수 없습니다 — ${lastErr?.message ?? '알 수 없음'}`,
    );
  }
}

/**
 * 다음 버전 제목.
 *
 * "이륜차 플랫폼" → "이륜차 플랫폼 v2" → "이륜차 플랫폼 v3".
 * 이미 붙어 있는 번호를 읽어 올린다 — 그러지 않으면 "v2 v2" 가 된다.
 */
function nextVersionTitle(title: string): string {
  const m = /^(.*?)\s*v(\d+)\s*$/i.exec(title.trim());
  if (m) return `${m[1]} v${Number(m[2]) + 1}`;
  return `${title.trim()} v2`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
