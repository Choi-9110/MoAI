import type { NoticeDigest } from './plan-doc';
import type { PlanKind } from './plan-doc';
import type { PosterDoc } from './poster';
import { formatPoster } from './plan-doc';

/**
 * 집필 전 리서치.
 *
 * 목차는 "TAM–SAM–SOM 을 산식과 출처를 붙여", "경쟁 제품 비교표", "선행
 * 기술과의 차별성"을 요구하는데, 집필에 주는 재료는 **아이디어 · 요약 한 장 ·
 * 공고** 뿐이다. 그 안에 시장 규모도 경쟁사도 없다. 그러면 모델이 하는 일은
 * 둘 중 하나다 — 비워 두거나, 지어내거나. 둘 다 나쁘다.
 *
 * 그래서 쓰기 전에 **찾아본다.** 로컬 CLI 에 검색 도구를 열어 주고 종류별로
 * 따로 시킨다. 한 번에 다 시키면 시장 얘기만 잔뜩 하고 특허는 한 줄로 끝낸다.
 *
 * **지어낸 리서치는 리서치가 아니라 독이다.** 도구를 쥐여 줘도 쓰지 않고
 * 답을 만들어 내는 일이 있어서(실측), 출처 URL 이 하나도 없는 결과는
 * 실패로 보고 버린다 — 실제로 찾았다면 URL 이 없을 수 없다.
 */

export const RESEARCH_TOPICS = ['market', 'competitor', 'patent', 'trend'] as const;
export type ResearchTopic = (typeof RESEARCH_TOPICS)[number];

export interface ResearchSpec {
  label: string;
  /** 무엇을 찾아 오라고 시킬 것인가 */
  ask: string;
  /** 어느 절에서 쓰이는가 — 집필 프롬프트에서 이 자료의 쓰임을 알린다 */
  usedFor: string;
}

export const RESEARCH_SPECS: Record<ResearchTopic, ResearchSpec> = {
  market: {
    label: '시장·통계',
    ask:
      '이 아이템이 속한 **시장의 크기와 성장세**를 찾으세요.\n' +
      '- 시장 규모(금액), 이용자·사업자 수, 연평균 성장률\n' +
      '- 문제의 크기를 보여 주는 통계 (대상 수 · 빈도 · 손실액)\n' +
      '- 정부 통계·공공기관 조사·업계 보고서를 우선합니다. 기사보다 원자료가 낫습니다.\n' +
      '숫자마다 **발행처와 연도**를 함께 적으세요. 연도가 오래된 것은 오래됐다고 밝히세요.',
    usedFor: '시장 규모(TAM–SAM–SOM), 문제의 크기 산식',
  },
  competitor: {
    label: '경쟁 제품·서비스',
    ask:
      '이 아이템과 **경쟁하거나 대체재가 되는 제품·서비스**를 찾으세요.\n' +
      '- 이름, 운영 주체, 무엇을 해 주는지, **가격**(요금제가 있으면 금액까지)\n' +
      '- 규모를 알 수 있는 것 (사용자 수·투자 유치·매출 — 공개된 것만)\n' +
      '- 국내를 먼저 찾고, 없으면 해외까지.\n' +
      '3~6개면 충분합니다. 억지로 채우지 말고, 정말 없으면 없다고 쓰세요 —\n' +
      '"경쟁자가 없다"는 것도 사업계획서에서는 쓸모 있는 사실입니다.',
    usedFor: '경쟁 비교표, 차별화·진입장벽',
  },
  patent: {
    label: '특허·규제',
    ask:
      '이 아이템과 관련된 **특허와 규제**를 찾으세요.\n' +
      '- 관련 등록·공개 특허 (출원인, 등록번호, 무엇을 보호하는지)\n' +
      '- 사업에 걸리는 인허가·규제·표준·인증\n' +
      '특허는 KIPRIS(kipris.or.kr) 같은 공개 검색을, 규제는 법령·부처 자료를 보세요.\n' +
      '없으면 없다고 쓰세요. **등록번호를 지어내지 마세요** — 조회하면 바로 드러납니다.',
    usedFor: '기존 기술과의 차별성, 진입장벽, 규제 대응',
  },
  trend: {
    label: '기술·산업 동향',
    ask:
      '이 아이템이 놓인 **기술·산업의 흐름**을 찾으세요.\n' +
      '- 최근 2~3년의 기술 변화, 업계에서 무엇이 문제로 지적되는지\n' +
      '- 정부 정책·지원 방향 (관련 부처 계획·로드맵)\n' +
      '- 참고할 논문·보고서가 있으면 제목과 출처\n' +
      '"요즘 AI 가 뜬다" 같은 일반론은 쓰지 마세요. **이 아이템에 걸리는 것**만.',
    usedFor: '필요성의 배경, 기술적 실현 근거, 정책 부합성',
  },
};

/** 리서치 한 편의 결과 */
export interface ResearchNote {
  topic: ResearchTopic;
  /** 찾은 것 — 마크다운 */
  body: string;
  /** 본문에서 인용한 출처 URL */
  sources: string[];
  /** 찾지 못했으면 그 사정 */
  note?: string;
}

export const RESEARCH_SYSTEM_PROMPT = `당신은 사업계획서를 쓰기 전에 **근거를 모으는 리서처**입니다.
글을 쓰는 사람이 아니라 **자료를 찾아 오는 사람**입니다.

## 반드시 지킬 것

1. **WebSearch 도구로 실제로 검색하세요.** 기억으로 답하지 마세요.
   당신이 아는 것처럼 느껴지는 수치도 지금은 확인해야 합니다.
2. **찾은 것만 씁니다.** 검색해도 안 나오면 "찾지 못함"이라고 쓰세요.
   그럴듯한 숫자를 채워 넣는 것이 가장 나쁜 결과입니다 — 그 한 줄 때문에
   사업계획서 전체가 심사에서 의심받습니다.
3. **수치마다 출처를 붙입니다.** 발행처·연도·URL. 출처를 못 붙일 숫자는 쓰지 마세요.
4. 검색 결과가 이 사업과 **상관없으면 버립니다.** 비슷해 보인다고 끌어오지 마세요.
5. 오래된 자료는 연도를 밝히고, 최신 자료가 없으면 없다고 쓰세요.

## 출력 형식

먼저 찾은 것을 마크다운으로 정리하고, **맨 마지막 줄에** 출처 URL 을 한 줄로 모읍니다.

    ## (소제목)
    - 내용 (출처: 발행처, 연도)
    - 내용 (출처: 발행처, 연도)

    SOURCES: https://... , https://... , https://...

- 본문은 개조식으로 짧게. 해설하지 말고 **사실만** 나열하세요.
- SOURCES 줄은 반드시 넣습니다. 하나도 못 찾았으면 \`SOURCES: 없음\` 이라고 쓰고,
  본문에는 무엇을 검색했는데 왜 못 찾았는지 한 줄로 적으세요.`;

export interface ResearchInput {
  topic: ResearchTopic;
  title: string;
  idea: string;
  poster?: PosterDoc | null;
  notice?: NoticeDigest | null;
  grantTitle?: string | null;
  /** 어떤 계획서인가 — 연구개발과제면 기술 쪽을 더 판다 */
  kind?: PlanKind | null;
}

export function buildResearchPrompt(input: ResearchInput): string {
  const spec = RESEARCH_SPECS[input.topic];

  const context = [
    `## 사업 제목\n${input.title}`,
    `## 아이디어 (사용자가 쓴 원문)\n${input.idea.slice(0, 2000)}`,
    input.poster ? `## 요약 한 장\n${formatPoster(input.poster)}` : '',
    input.notice?.name || input.grantTitle
      ? `## 지원하려는 공고\n${input.notice?.name ?? input.grantTitle}${
          input.notice?.agency ? ` (${input.notice.agency})` : ''
        }`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const kindNote =
    input.kind === 'rnd'
      ? '\n\n이 사업은 **연구개발과제**입니다. 기술 수준·선행 연구·성능 지표 쪽을 더 깊이 보세요.'
      : '';

  return `${context}

---

# 찾아 올 것 — ${spec.label}

${spec.ask}${kindNote}

**WebSearch 로 실제 검색해서** 찾으세요. 못 찾은 것은 못 찾았다고 쓰고,
마지막 줄에 SOURCES 를 반드시 넣으세요.`;
}

/**
 * 리서치 결과를 읽는다.
 *
 * 본문과 출처를 가른다. **출처가 하나도 없으면 실패로 본다** — 검색을
 * 실제로 했다면 URL 이 남지 않을 수 없다. 도구를 쓰지 않고 기억으로 답한
 * 결과를 근거랍시고 집필에 넘기면, 지어낸 수치가 출처까지 달고 본문에 박힌다.
 */
export function parseResearch(
  topic: ResearchTopic,
  raw: string,
): ResearchNote | null {
  const text = raw.trim();
  if (!text) return null;

  // SOURCES 줄은 맨 뒤에 있다. 없으면 형식을 안 지킨 것이다.
  const match = /SOURCES\s*[:：]\s*(.*)$/is.exec(text);
  const body = (match ? text.slice(0, match.index) : text).trim();

  const sources = match
    ? (match[1].match(/https?:\/\/[^\s,)\]]+/g) ?? []).map((u) =>
        u.replace(/[.,;]+$/, ''),
      )
    : [];

  // 본문에 URL 을 직접 달아 둔 경우도 주워 담는다.
  const inline = body.match(/https?:\/\/[^\s,)\]]+/g) ?? [];
  const all = [...new Set([...sources, ...inline.map((u) => u.replace(/[.,;]+$/, ''))])];

  if (all.length === 0) return null;
  if (body.length < 40) return null;

  return { topic, body: body.slice(0, 6000), sources: all.slice(0, 20) };
}

/**
 * 집필 프롬프트에 붙일 리서치 묶음.
 *
 * 절마다 통째로 넣는다. 절이 여덟이면 같은 자료를 여덟 번 넣는 셈이지만,
 * 어느 절에 어느 자료가 쓰일지 미리 가르는 편이 더 위험하다 — 시장 자료가
 * 필요 없다고 판단한 절에서 정작 시장 얘기를 하게 된다.
 */
export function buildResearchNote(notes: ResearchNote[]): string {
  if (notes.length === 0) return '';

  const blocks = notes
    .map((n) => {
      const spec = RESEARCH_SPECS[n.topic];
      return `### ${spec.label} (쓰이는 곳: ${spec.usedFor})\n${n.body}\n\n출처: ${n.sources.join(' , ')}`;
    })
    .join('\n\n');

  return `

## 리서치 자료 (집필 전에 실제로 검색해 모은 것)

${blocks}

**이 자료의 수치는 출처와 함께 인용하십시오.** 여기 없는 수치는 여전히
지어내면 안 됩니다 — 자료에 없으면 [확인필요]로 남기십시오.`;
}
