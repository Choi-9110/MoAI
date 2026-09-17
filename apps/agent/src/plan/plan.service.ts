import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_OUTLINE, OUTLINE_SYSTEM_PROMPT, PLAN_FORMAT_SPECS,
  PLAN_KIND_LABELS, PLAN_KIND_SYSTEM_PROMPT, RESEARCH_SPECS,
  RESEARCH_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT, SECTION_SYSTEM_PROMPT,
  buildOutlinePrompt, buildPlanKindPrompt, buildResearchPrompt,
  buildReviewPrompt, buildRewriteNote, buildSectionWritePrompt,
  outlineForKind, parsePlanKind, parseResearch, parseReview, parseSectionOutput,
} from '@moai/shared';
import type {
  PlanFinding, PlanFormat, PlanKind, PlanKindInput, PlanReviewInput,
  PlanSection, PlanSectionInput, ResearchInput, ResearchNote,
} from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { extractHangulText } from '../common/hangul';
import { referenceDir, referenceFile } from '../common/references';

type OutlineEntry = Pick<PlanSection, 'id' | 'title' | 'brief' | 'frame'>;

/**
 * 스킬을 켤 때만 붙이는 안내.
 *
 * CLI 의 스킬 기능을 쓰지 않고 **경로만 알려 준다.** 스킬 기능을 켜면 우리
 * 스킬 하나 때문에 기본 스킬 12종 목록까지 딸려 와 호출마다 5천 토큰이
 * 더 붙는다. 이 스킬은 실행 파일 없는 문서라 Read 로 열어도 똑같다.
 *
 * 내용도 좁혀서 알려 준다. 스킬은 공고 분석부터 검증까지의 **전체
 * 워크플로우**를 갖고 있는데, 우리는 이미 목차를 정해 두고 절 단위로 부르고
 * 있다. 그대로 두면 모델이 스킬의 순서로 갈아타 "먼저 공고를 분석하겠습니다"
 * 하고 엉뚱한 걸 내놓는다.
 */
function skillNote(skillsDir: string): string {
  return `

## 참고 — 이 프로젝트의 작성 스킬
아래 파일에 정부지원사업 사업계획서 작성 방법이 정리돼 있습니다.

    ${join(skillsDir, 'gov-bizplan', 'SKILL.md')}

문장을 증명형으로 다듬는 규칙, 정량화 방법, 평가위원 관점의 점검이 필요하면
**Read 로 열어** 참고하세요. 같은 폴더의 references/ 아래에 프롬프트와 산출물
규격이 더 있습니다. 필요 없으면 열지 않아도 됩니다.

**다만 목차와 진행 순서는 위에서 정한 것을 따릅니다.** 스킬의 워크플로우
(공고 분석 → RFP 분석 → 리서치 → 8항목 집필)로 갈아타지 마세요. 지금 할 일은
**위에 지정된 절 하나를 쓰는 것**이고, 앞뒤 절은 다른 호출이 맡습니다.`;
}

/**
 * 사업계획서 작성.
 *
 * 절을 한꺼번에 쓰지 않고 **하나씩** 쓴다. 절마다 1분 가까이 걸려서,
 * 통으로 만들면 십수 분을 아무것도 못 보고 기다려야 하고 중간에 끊기면
 * 처음부터 다시다. 호출하는 쪽(API)이 절 단위로 돌면서 그때그때 저장한다.
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliService,
  ) {}

  get model(): string {
    // 심사자가 읽는 문서다. 여기서 모델을 아끼면 결과가 바로 티가 난다.
    return this.config.get<string>('PLAN_MODEL', 'claude-opus-5');
  }

  private get timeoutMs(): number {
    return parseInt(this.config.get<string>('PLAN_TIMEOUT_MS', '600000'), 10);
  }

  /**
   * 목차 판정용 모델.
   *
   * 공고를 읽고 둘 중 하나를 고르는 일이라 본문 집필만큼의 모델이 필요 없다.
   * 여기서 아낀 것은 결과에 티가 나지 않는다.
   */
  private get kindModel(): string {
    return this.config.get<string>('PLAN_KIND_MODEL', 'claude-sonnet-5');
  }

  /** 판정이 오래 걸릴 일은 없다. 늦어지면 그냥 일반 목차로 간다. */
  private get kindTimeoutMs(): number {
    return parseInt(this.config.get<string>('PLAN_KIND_TIMEOUT_MS', '120000'), 10);
  }

  /**
   * 리서치용 모델.
   *
   * 검색해서 추리고 옮겨 적는 일이라 집필만큼의 모델이 필요 없다.
   * 대신 네 편을 돌리므로 여기서 아끼는 편이 낫다.
   */
  private get researchModel(): string {
    return this.config.get<string>('PLAN_RESEARCH_MODEL', 'claude-sonnet-5');
  }

  /** 검색 왕복이 있어 절 집필보다 길게 준다. */
  private get researchTimeoutMs(): number {
    return parseInt(this.config.get<string>('PLAN_RESEARCH_TIMEOUT_MS', '420000'), 10);
  }

  /**
   * 점검용 모델.
   *
   * 집필과 같은 급을 쓴다. 지어낸 근거를 찾아내는 일은 쓰는 일보다 쉽지
   * 않다 — 여기서 아끼면 걸러야 할 것을 그냥 통과시킨다.
   */
  private get reviewModel(): string {
    return this.config.get<string>('PLAN_REVIEW_MODEL', this.model);
  }

  private get workspaceDir(): string {
    return this.config.get<string>('WORKSPACE_DIR', join(process.cwd(), 'workspace'));
  }

  /**
   * 양식에서 목차를 뽑는다.
   *
   * 양식이 없으면 **어떤 사업인지 먼저 판정**하고 그에 맞는 표준 목차를 쓴다
   * (연구개발과제면 연구개발계획서 8항목, 아니면 사업화 계획서 8항목).
   * 억지로 지어낸 목차로 쓰는 것보다 표준 목차가 낫다.
   */
  async outline(
    template?: { fileName: string; content: Buffer },
    format: PlanFormat = 'gov',
    context?: PlanKindInput | null,
  ): Promise<{ templateName: string; sections: OutlineEntry[] }> {
    const fallback = {
      templateName: PLAN_KIND_LABELS.general,
      sections: DEFAULT_OUTLINE,
    };

    if (!template) {
      const kind = await this.classifyKind(context);
      return {
        templateName: PLAN_KIND_LABELS[kind],
        sections: outlineForKind(kind),
      };
    }

    let safeName = this.safeFileName(template.fileName);
    const dir = join(this.workspaceDir, `plan-${Date.now()}`);

    /*
     * 양식도 공고문과 같다 — 한글 파일이면 CLI 에게 넘기기 전에 글자로
     * 바꿔 둔다. 안 그러면 목차를 못 뽑는 정도가 아니라 CLI 가 파일을
     * 열어 보려다 턴 한도를 태우고 죽는다.
     */
    const hangul = await extractHangulText(safeName, template.content);
    if (hangul) {
      this.logger.log(`한글 양식에서 ${hangul.text.length}자 추출 — ${hangul.fileName}`);
      safeName = hangul.fileName;
    } else if (/\.hwpx?$/i.test(safeName)) {
      this.logger.warn(
        `한글 양식에서 글자를 뽑지 못했습니다 (${template.fileName}) — 원본을 그대로 넘깁니다.`,
      );
    }

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, safeName), hangul?.text ?? template.content);

      const envelope = await this.cli.run({
        systemPrompt: OUTLINE_SYSTEM_PROMPT,
        // 목차는 양식에서 오지만, 절마다 어느 칸인지도 함께 받는다.
        prompt: buildOutlinePrompt(join(dir, safeName), format),
        model: this.model,
        timeoutMs: this.timeoutMs,
        readDir: dir,
        maxTurns: 8,
      });

      const sections = this.parseOutline(envelope.result ?? '');
      if (sections.length === 0) {
        this.logger.warn(
          `양식에서 목차를 찾지 못했습니다 (${safeName}) — 표준 목차로 씁니다.`,
        );
        const kind = await this.classifyKind(context);
        return {
          templateName: `${safeName} (목차 인식 실패 · ${PLAN_KIND_LABELS[kind]} 사용)`,
          sections: outlineForKind(kind),
        };
      }

      this.logger.log(`목차 ${sections.length}절 — ${safeName}`);
      return { templateName: safeName, sections };
    } catch (err) {
      this.logger.warn(
        `양식 읽기 실패: ${(err as Error).message} — 표준 목차로 씁니다.`,
      );
      return fallback;
    } finally {
      if (this.config.get<string>('KEEP_WORKSPACE', 'false') !== 'true') {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  /**
   * 양식이 없을 때, 이 사업이 **연구개발과제인지** 판정한다.
   *
   * 판정에 쓰는 재료는 공고와 아이디어뿐이라 짧은 한 번의 호출로 끝난다.
   * 절 하나 쓰는 데 1분 가까이 걸리는 것에 비하면 몇 초짜리다.
   *
   * **애매하면 general 이다.** R&D 목차에는 연구책임자·연구개발비 비목·
   * 안전보안 이행계획 칸이 있어서, R&D 가 아닌 사업에 씌우면 채울 수 없는
   * 칸이 절반이 된다. 반대는 칸이 모자랄 뿐 못 채우지는 않는다.
   * 그래서 판정에 실패해도, 재료가 없어도 general 로 떨어진다.
   */
  private async classifyKind(context?: PlanKindInput | null): Promise<PlanKind> {
    if (!context?.title?.trim() && !context?.idea?.trim()) {
      this.logger.log('목차 판정 — 재료가 없어 일반 사업화 목차로 씁니다.');
      return 'general';
    }

    try {
      const envelope = await this.cli.run({
        systemPrompt: PLAN_KIND_SYSTEM_PROMPT,
        prompt: buildPlanKindPrompt(context),
        model: this.kindModel,
        timeoutMs: this.kindTimeoutMs,
        maxTurns: 1,
      });
      if (envelope.is_error) {
        throw new Error(envelope.subtype ?? '알 수 없음');
      }

      const { kind, reason } = parsePlanKind(envelope.result ?? '');
      this.logger.log(`목차 판정 — ${PLAN_KIND_LABELS[kind]} (${reason})`);
      return kind;
    } catch (err) {
      this.logger.warn(
        `목차 판정 실패: ${(err as Error).message} — 일반 사업화 목차로 씁니다.`,
      );
      return 'general';
    }
  }

  /**
   * 집필 전에 근거를 찾아 온다.
   *
   * **검색 도구를 여기서만 연다.** 절을 쓸 때는 열지 않는다 — 쓰다가
   * 검색하면 문장 흐름에 맞는 것만 골라 오게 되고, 무엇을 근거로 썼는지
   * 나중에 되짚을 수 없다. 찾는 일과 쓰는 일을 갈라 둔다.
   *
   * 결과에 출처 URL 이 하나도 없으면 **버린다.** 도구를 쥐여 줘도 쓰지 않고
   * 기억으로 답하는 일이 있는데, 그런 결과를 근거랍시고 넘기면 지어낸
   * 수치가 출처까지 달고 본문에 박힌다. 근거가 없는 편이 낫다.
   */
  async research(input: ResearchInput): Promise<ResearchNote | null> {
    const spec = RESEARCH_SPECS[input.topic];

    try {
      const envelope = await this.cli.run({
        systemPrompt: RESEARCH_SYSTEM_PROMPT,
        prompt: buildResearchPrompt(input),
        model: this.researchModel,
        timeoutMs: this.researchTimeoutMs,
        // 검색하고, 결과를 보고, 더 찾아보는 왕복이 필요하다.
        maxTurns: 12,
        allowedTools: ['WebSearch', 'WebFetch'],
      });

      if (envelope.is_error) {
        throw new Error(envelope.subtype ?? '알 수 없음');
      }

      const note = parseResearch(input.topic, envelope.result ?? '');
      if (!note) {
        this.logger.warn(
          `리서치 버림 (${spec.label}) — 출처가 없습니다. 검색 없이 답한 것으로 봅니다.`,
        );
        return null;
      }

      this.logger.log(
        `리서치 ${spec.label} — ${note.body.length}자, 출처 ${note.sources.length}건` +
          (envelope.total_cost_usd ? ` ($${envelope.total_cost_usd.toFixed(4)})` : ''),
      );
      return note;
    } catch (err) {
      this.logger.warn(
        `리서치 실패 (${spec.label}): ${(err as Error).message} — 이 항목 없이 씁니다.`,
      );
      return null;
    }
  }

  /**
   * 다 쓴 문서를 **처음 보는 눈으로** 다시 읽는다.
   *
   * 절을 쓰는 호출은 앞 절을 400자씩만 보기 때문에, 문서 전체로 어긋나는
   * 것(자금 합계와 일정의 불일치, 같은 시장 수치가 절마다 다른 것)을
   * 스스로 잡지 못한다. 무엇보다 **자기가 지어낸 근거는 자기가 못 본다.**
   * 그래서 쓴 맥락을 버리고 새 호출로 대조한다.
   *
   * 도구를 주지 않는다. 재료는 프롬프트에 전부 실려 있고, 여기서 무언가를
   * 더 찾아보게 하면 그 자체가 새로운 지어내기의 출처가 된다.
   */
  async review(input: PlanReviewInput): Promise<{ findings: PlanFinding[]; costUsd?: number }> {
    const envelope = await this.cli.run({
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      prompt: buildReviewPrompt(input),
      model: this.reviewModel,
      timeoutMs: this.timeoutMs,
      maxTurns: 1,
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const findings = parseReview(envelope.result ?? '');
    const high = findings.filter((f) => f.severity === 'high').length;
    this.logger.log(
      `점검 — ${findings.length}건 (다시 쓸 것 ${high}건)` +
        (envelope.total_cost_usd ? ` ($${envelope.total_cost_usd.toFixed(4)})` : ''),
    );

    return { findings, costUsd: envelope.total_cost_usd };
  }

  /**
   * 절 하나를 쓴다.
   *
   * PSSD·PSST 는 채점 기준이 공개되어 있다. 그 지침을 읽고 쓰면 배점이
   * 큰 항목에 분량이 몰리고 문장이 증명형으로 나온다 — 안 읽고 쓰면
   * 매끈하지만 채점표와 어긋난 글이 된다.
   */
  async writeSection(
    input: PlanSectionInput & { findings?: PlanFinding[] },
  ): Promise<{ body: string; openQuestions: string[]; costUsd?: number }> {
    const guidePath = this.guidePath(input.format);
    // 스킬 폴더가 없으면 조용히 안 쓴다. 없는 경로를 알려 주면 헤맨다.
    const skillsDir = this.useSkills ? this.cli.skillsDir : null;

    const envelope = await this.cli.run({
      systemPrompt: SECTION_SYSTEM_PROMPT,
      prompt:
        buildSectionWritePrompt({ ...input, guidePath }) +
        buildRewriteNote(input.findings ?? []) +
        (skillsDir ? skillNote(skillsDir) : ''),
      model: this.model,
      timeoutMs: this.timeoutMs,
      useSkills: Boolean(skillsDir),
      ...(guidePath || skillsDir
        ? {
            readDir: referenceDir(this.config.get<string>('REFERENCE_DIR')),
            maxTurns: 6,
          }
        : {}),
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const raw = envelope.result ?? '';
    if (!raw.trim()) throw new Error('모델이 빈 응답을 돌려주었습니다.');

    const { body, openQuestions } = parseSectionOutput(raw);
    this.logger.log(
      `${input.section.title} — ${body.length}자, 확인필요 ${openQuestions.length}건` +
        (envelope.total_cost_usd ? ` ($${envelope.total_cost_usd.toFixed(4)})` : ''),
    );

    return { body, openQuestions, costUsd: envelope.total_cost_usd };
  }

  /**
   * 사업계획서 집필에만 스킬을 붙인다.
   *
   * 공고 판정은 공고 수만큼 도는 작업이라, 거기까지 붙이면 쓰지도 않을
   * 폴더를 매번 열어 두는 셈이 된다.
   */
  private get useSkills(): boolean {
    return this.config.get<string>('PLAN_USE_SKILLS', 'true') !== 'false';
  }

  /* ────────────── 내부 ────────────── */

  /**
   * 이 양식의 작성 지침 파일. 없으면 null.
   *
   * 파일이 없는데 경로만 넘기면 CLI 가 헤매다 빈손으로 돌아온다.
   * 없으면 지침 없이 쓰게 두는 편이 낫다.
   */
  private guidePath(format?: string | null): string | null {
    const spec = format
      ? PLAN_FORMAT_SPECS[format as keyof typeof PLAN_FORMAT_SPECS]
      : undefined;
    if (!spec?.guide) return null;

    const path = referenceFile(
      `frameworks/${spec.guide}`,
      this.config.get<string>('REFERENCE_DIR'),
    );
    if (!path) {
      this.logger.warn(`작성 지침을 찾지 못했습니다 (${spec.guide}) — 지침 없이 씁니다.`);
    }
    return path;
  }

  private parseOutline(raw: string): OutlineEntry[] {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return [];

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        sections?: {
          id?: string; title?: string; brief?: string; frame?: string;
        }[];
      };
      if (!Array.isArray(parsed.sections)) return [];

      const seen = new Set<string>();
      return parsed.sections
        .filter((s) => typeof s.title === 'string' && s.title.trim())
        .map((s, i) => {
          // id 가 겹치면 뒤 절이 앞 절을 덮어쓴다. 순번을 붙여 갈라 둔다.
          let id = (s.id ?? '').trim() || `section-${i + 1}`;
          while (seen.has(id)) id = `${id}-${i + 1}`;
          seen.add(id);

          return {
            id,
            title: (s.title as string).trim().slice(0, 120),
            brief: (s.brief ?? '').trim().slice(0, 600),
            // 빈 문자열은 "어느 칸도 아니다" 라는 뜻이다. null 로 통일한다.
            frame: (s.frame ?? '').trim() || null,
          };
        })
        .slice(0, 24);
    } catch {
      return [];
    }
  }

  private safeFileName(name: string): string {
    const base = name.replace(/[/\\]/g, '_').replace(/^\.+/, '').trim();
    return base.replace(/[^\w가-힣.\-() ]/g, '_').slice(0, 120) || 'template.pdf';
  }
}
