import { Column, Entity, Index } from 'typeorm';
import type {
  ModooAnswers, NoticeDigest, PlanDoc, PlanFormat, PlanProgress, PosterDoc,
  ProjectTrack, SlotChange, TemplateKind,
} from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/** 사업계획서 프로젝트. 아이디어 1건 = 프로젝트 1건. */
@Entity('projects')
export class Project extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /**
   * 어느 트랙으로 시작했는가.
   *
   * gov 는 공고를 고르거나 올려서 시작하고, modoo 는 공고가 하나로 고정이라
   * 대신 주최측 지원서 문항을 받는다. 기존 사업은 전부 gov 다.
   */
  @Column({ type: 'varchar', length: 20, default: 'gov' })
  track!: ProjectTrack;

  /**
   * 모두의창업 지원서 답변 (Q1~Q11).
   *
   * 트랙이 modoo 일 때만 채워진다. 요약 한 장을 다시 만들 때 원본이
   * 필요하고, 사용자가 답을 고치고 다시 만들 수도 있어서 보관한다.
   */
  @Column({ type: 'jsonb', name: 'modoo_answers', nullable: true })
  modooAnswers!: ModooAnswers | null;

  /**
   * 사업계획서 양식.
   *
   * 사업 시작 시점에는 고르지 않는다 — 공고문마다 양식이 다르므로
   * 사업계획서를 만들 때 사용자가 그 공고의 양식 파일을 올린다.
   */
  @Column({ type: 'uuid', name: 'template_id', nullable: true })
  templateId!: string | null;

  @Column({ type: 'varchar', length: 40, name: 'template_kind', nullable: true })
  templateKind!: TemplateKind | null;

  /**
   * 어느 사업에서 갈라져 나왔는가.
   *
   * 같은 아이디어로 공고를 여러 곳에 낼 때 복제본이 생긴다. 이 값이 있으면
   * 나중에 목록에서 한 묶음으로 보여주거나, 아이디어를 상위 개념으로 올릴 때
   * 뿌리별로 모을 수 있다. 지금은 기록만 한다.
   *
   * 복제본을 또 복제해도 **맨 처음 것**을 가리킨다 — 사슬이 아니라 묶음이다.
   */
  @Column({ type: 'uuid', name: 'origin_project_id', nullable: true })
  originProjectId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** 사용자가 최초 입력한 아이디어 원문 */
  @Column({ type: 'text' })
  idea!: string;

  /** draft / answering / generating / completed / archived */
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: string;

  /** 응답 완료 개수 캐시 — 최소 10개 충족 여부를 빠르게 판정 */
  @Column({ type: 'int', name: 'answered_count', default: 0 })
  answeredCount!: number;

  @Column({ type: 'timestamptz', name: 'last_generated_at', nullable: true })
  lastGeneratedAt!: Date | null;

  /**
   * 사용자가 손으로 정한 목록 순서.
   *
   * 비어 있으면 아직 손대지 않은 것이고, 그때는 최근에 만든 것이 위로 온다.
   * 한 번이라도 끌어서 옮기면 목록 전체에 0,1,2… 가 다시 매겨진다.
   *
   * 새로 만든 사업은 비어 있는 채로 **맨 위**에 붙는다. 방금 시작한 것을
   * 저 아래에서 찾게 만들면 안 된다.
   */
  @Column({ type: 'int', name: 'sort_order', nullable: true })
  sortOrder!: number | null;

  /* ────────────── 요약 한 장 ────────────── */

  /**
   * 어느 공고를 보고 시작했는지.
   *
   * 캘린더에서 고르면 채워지고, 파일만 올리면 비어 있다.
   * 이게 있어야 "공고 원문 보러가기"가 성립한다 — 양식이 붙어 있는지
   * 확인하려면 결국 원문을 봐야 하기 때문이다.
   */
  @Index()
  @Column({ type: 'uuid', name: 'grant_id', nullable: true })
  grantId!: string | null;

  /**
   * 자동으로 찾아 묶었을 때의 확신도(0~1)와 근거 문장.
   *
   * 사용자가 직접 고른 경우에는 비운다 — 추정이 아니기 때문이다.
   * 추정으로 묶인 건 화면에서 "이 공고 맞나요?" 하고 확인받아야 한다.
   */
  @Column({
    type: 'numeric', precision: 4, scale: 3,
    name: 'grant_link_score', nullable: true,
  })
  grantLinkScore!: number | null;

  @Column({ type: 'varchar', length: 200, name: 'grant_linked_by', nullable: true })
  grantLinkedBy!: string | null;

  /** 업로드한 공고문 파일명. 파일 자체는 보관하지 않는다. */
  @Column({ type: 'varchar', length: 200, name: 'notice_file_name', nullable: true })
  noticeFileName!: string | null;

  /**
   * 요약 생성 상태 — idle / running / done / failed.
   *
   * DB 에 두는 이유가 있다. 생성이 몇 분 걸리는데 사용자는 그동안 다른
   * 페이지를 볼 수 있어야 하고, 돌아왔을 때 "아직 만드는 중"이 보여야 한다.
   * 메모리에 두면 서버가 한 번만 재시작해도 사라진다.
   */
  @Column({ type: 'varchar', length: 20, name: 'poster_status', default: 'idle' })
  posterStatus!: 'idle' | 'running' | 'done' | 'failed';

  @Column({ type: 'jsonb', name: 'poster_doc', nullable: true })
  posterDoc!: PosterDoc | null;

  /** 실패 사유 — 사용자에게 그대로 보여준다 */
  @Column({ type: 'text', name: 'poster_error', nullable: true })
  posterError!: string | null;

  @Column({ type: 'timestamptz', name: 'poster_started_at', nullable: true })
  posterStartedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'poster_updated_at', nullable: true })
  posterUpdatedAt!: Date | null;

  /**
   * 직전 재작성에서 무엇이 바뀌었는지.
   *
   * 재작성은 2분 가까이 걸려 응답을 붙잡고 있을 수 없다. 그래서 결과를
   * 여기 적어 두고 화면이 물어보게 한다 — 생성과 같은 방식이다.
   */
  @Column({ type: 'jsonb', name: 'poster_changes', nullable: true })
  posterChanges!: SlotChange[] | null;

  /**
   * 요약을 만들 때 공고문에서 함께 뽑아 둔 핵심.
   *
   * 공고문 파일은 그때 한 번 읽고 지운다. 사업계획서를 쓸 때 다시 올리라고
   * 하면 번거롭기만 하므로, 평가 항목·제출 서류 같은 것만 추려 보관한다.
   */
  @Column({ type: 'jsonb', name: 'notice_digest', nullable: true })
  noticeDigest!: NoticeDigest | null;

  /**
   * 요약 한 장이 끝났다고 **알린 시각**.
   *
   * 백그라운드로 도는 작업이라 사용자는 끝난 줄 모른다. 화면이 주기적으로
   * 물어보고 알린 뒤 여기에 시각을 남긴다 — 이 표시가 없으면 물어볼 때마다
   * 같은 알림이 다시 뜬다.
   */
  @Column({ type: 'timestamptz', name: 'poster_notified_at', nullable: true })
  posterNotifiedAt!: Date | null;

  /* ────────────── 사업계획서 ────────────── */

  /**
   * 어떤 틀로 쓸 것인가 — pssd / psst / gov.
   *
   * 요약 한 장이 끝난 뒤 사용자가 고른다. 트랙과는 별개다:
   * 모두의창업으로 시작했어도 PSST 로 낼 수 있고 그 반대도 된다.
   */
  @Column({ type: 'varchar', length: 20, name: 'plan_format', nullable: true })
  planFormat!: PlanFormat | null;

  /** 업로드한 사업계획서 양식 파일명 */
  @Column({ type: 'varchar', length: 200, name: 'plan_template_name', nullable: true })
  planTemplateName!: string | null;

  /** idle / running / done / failed */
  @Column({ type: 'varchar', length: 20, name: 'plan_status', default: 'idle' })
  planStatus!: 'idle' | 'running' | 'done' | 'failed';

  @Column({ type: 'jsonb', name: 'plan_doc', nullable: true })
  planDoc!: PlanDoc | null;

  /**
   * 어디까지 썼는지.
   *
   * 절 하나에 1분 가까이 걸린다. 통째로 만들면 십수 분을 아무것도 못 보고
   * 기다려야 하므로, 절 단위로 저장하고 진행 상황을 보여준다.
   */
  @Column({ type: 'jsonb', name: 'plan_progress', nullable: true })
  planProgress!: PlanProgress | null;

  @Column({ type: 'text', name: 'plan_error', nullable: true })
  planError!: string | null;

  @Column({ type: 'timestamptz', name: 'plan_started_at', nullable: true })
  planStartedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'plan_updated_at', nullable: true })
  planUpdatedAt!: Date | null;

  /** 사업계획서가 끝났다고 알린 시각 — 위 `posterNotifiedAt` 과 같은 구실 */
  @Column({ type: 'timestamptz', name: 'plan_notified_at', nullable: true })
  planNotifiedAt!: Date | null;
}
