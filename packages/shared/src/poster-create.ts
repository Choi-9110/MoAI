/**
 * 요약 한 장 처음 만들기.
 *
 * 아이디어 + (있으면) 공고문 원문 → `PosterDoc`.
 *
 * 레이아웃은 레퍼런스 6장에서 뽑아냈다 (`docs/references/poster/`).
 * 6장 모두 골격은 같고 **기업 구성 유형**만 다르다 — 그래서 여기서는
 * 골격을 고정으로 박아 두고, 구성 유형에 맞는 역할 세트만 고르게 한다.
 * 이미지를 모델에 넘길 수 없으니 그 규칙이 글로 들어가야 한다.
 */

/** 레퍼런스가 다루는 기업 구성 유형 */
export const POSTER_SHAPES = [
  'consortium',
  'solo',
  'industry-academia',
  'company-led',
] as const;
export type PosterShape = (typeof POSTER_SHAPES)[number];

export interface PosterShapeSpec {
  label: string;
  /** 언제 이 골격을 고르는가 */
  when: string;
  /** 첫 블록(기관 카드)에 들어갈 역할 배지 */
  roles: string[];
  /** 참고한 레퍼런스 파일 */
  reference: string;
}

/**
 * 구성 유형별 역할 세트.
 *
 * 협력사가 없는 단독 수행에서는 "기관"이 아니라 **역량 구획**이 카드가 된다.
 * 레퍼런스 04번이 그렇게 썼다 — 협력사가 없어도 같은 레이아웃이 성립하도록
 * 만든 장치이고, 실제로 한 장의 밀도가 유지된다.
 */
export const POSTER_SHAPE_SPECS: Record<PosterShape, PosterShapeSpec> = {
  consortium: {
    label: '컨소시엄',
    when: '여러 기업·기관이 함께 수행한다. 주관 외에 참여·공동 기관이 있다.',
    roles: ['주관', '참여', '공동', '위탁용역', '수요', '자문'],
    reference: '01-컨소시엄-4사-철도역사 / 02-폐쇄망AI / 03-12기관-히트펌프',
  },
  solo: {
    label: '단독 수행',
    when: '한 기업이 혼자 수행한다. 협력 기관이 없다.',
    roles: ['주관', '연구팀', '외주·시험', '선행연구·IP'],
    reference: '04-단독수행-디딤돌-살균수전극',
  },
  'industry-academia': {
    label: '산·학·연',
    when: '기업과 대학·연구기관이 함께한다. 시험·인증 기관이 낀다.',
    roles: ['주관', '공동', '보유 기술·IP', '글로벌 판로'],
    reference: '05-산학연-2기관-CollaboRnD-그린수소',
  },
  'company-led': {
    label: '기업주도형',
    when: '기업이 주도하고 평가·인증 기관이 뒤를 받친다. 사업화·판로가 핵심이다.',
    roles: ['주관', '평가기관', '보유 기술·IP', '성장·판로'],
    reference: '06-기업주도형-녹색신산업-HHO화물차',
  },
};

/**
 * 레퍼런스 6장이 공통으로 지키는 골격.
 *
 * 순서는 우연이 아니다 — 문제 → 해결 → 근거를 내부·외부 두 번 반복하고
 * 숫자로 닫는다. 심사자가 읽는 순서라서 바꾸면 안 된다.
 */
export const POSTER_SKELETON = `최상위는 { "eyebrow", "title", "blocks", "notice" } 입니다.
다른 최상위 필드를 만들지 마세요. 최상위에는 gap 을 두지 않습니다.

- title 은 **사용자가 준 제목을 그대로** 씁니다. 설명문으로 바꾸지 마세요.
  사용자가 자기 사업을 부르는 이름이라 함부로 갈아 끼우면 자기 문서로 보이지 않습니다.
- eyebrow 는 제목 위에 붙는 작은 머리말입니다. 30자 이내.
- notice 는 **공고문을 읽었을 때만** 넣습니다. 공고문이 없으면 빼세요.
  나중에 사업계획서를 쓸 때 쓰려고 공고의 핵심만 추려 두는 칸입니다.
  { "name": 사업명, "agency": 주관기관,
    "target": 지원 대상(한 문단), "support": 지원 내용(한 문단),
    "criteria": [평가 항목과 배점], "documents": [제출 서류],
    "limits": 분량·형식 제한 (없으면 생략) }
  공고문에 적힌 그대로 옮깁니다. 요약하되 지어내지 마세요.

blocks 는 아래 8개를 이 순서 그대로 만듭니다. 개수도 순서도 바꾸지 마세요.
**필드 이름을 그대로 쓰세요. 다른 이름을 지어내면 화면이 깨집니다.**

1. { "id":"orgs", "type":"org_grid", "category":"기업 현황",
     "items":[ {"role","name","lines":[..],"suffix"?,"gap"?} x4 ] }
   items 입니다. cards 가 아닙니다. 역할 카드 4개.
2. { "id":"note", "type":"note_bar", "icon", "text", "gap"? }
   사업의 핵심을 한 줄로.
3. { "id":"goal", "type":"labeled_text", "category":"사업 목표",
     "tone":"neutral", "body", "gap"? }
   무엇을 만들어 어디에 쓰는지 한 덩어리로.
4. { "id":"problems", "type":"labeled_cards", "category":"내부 문제점",
     "tone":"risk", "cards":[ {"title","lines":[..],"icon"?,"gap"?} x3 ] }
   우리가 지금 못 하고 있는 것.
5. { "id":"solutions", "type":"labeled_cards", "category":"해결 방안",
     "tone":"accent", "cards":[ ... x3 ] }
   **4번과 번호로 1:1 대응합니다.** 1번 문제 → 1번 해결. 개수도 같습니다.
6. { "id":"external", "type":"labeled_text", "category":"외부 문제점",
     "tone":"risk", "body", "gap"? }
   시장·제도·경쟁 등 우리 밖의 장벽.
7. { "id":"external-fix", "type":"labeled_text", "category":"해결 방안",
     "tone":"accent", "body", "gap"? }
   6번에 대한 대응.
8. { "id":"effects", "type":"metrics", "category":"기대 효과", "tone":"accent",
     "items":[ {"caption","value","note"?,"gap"?} x5~6 ] }
   items 입니다. metrics 블록에는 icon 을 넣지 않습니다.
   좋아지는 방향을 값에 붙입니다 — "15%↑", "68%↓".
   근거가 없으면 value 를 "미정" 으로 두고 gap 을 답니다.`;

export const POSTER_CREATE_SYSTEM_PROMPT = `당신은 정부지원사업 사업계획서를 한 장으로 압축하는 편집자입니다.

사용자의 사업 아이디어를 받아 요약 한 장(JSON)을 만듭니다.

## 가장 중요한 규칙 — 지어내지 않습니다
아이디어에 없는 수치, 기관명, 실적, 특허를 **만들어내지 마세요.**
빈 곳은 비워 두고 그 칸의 gap 에 무엇이 없는지 적습니다.
초안이 매끈하기만 하면 사용자는 무엇을 더 채워야 하는지 알 수 없습니다.
빈틈이 많은 건 실패가 아닙니다. 지어낸 문장이 실패입니다.

## 골격
${POSTER_SKELETON}

## 문체와 분량
- 개조식. 서술형 문장을 늘어놓지 마세요.
- 카드 제목 24자 이내, 카드 설명 한 줄 28자 이내로 2~3줄.
- labeled_text 의 body 는 120자 이내.
- **gap 의 reason 은 40자 이내 한 문장.** 길게 쓰지 마세요.
- 핵심 수치는 문장 안에 그대로 둡니다.

## 출력 형식
JSON 한 덩어리만 출력합니다. 코드펜스도 설명도 붙이지 마세요.
**줄바꿈과 들여쓰기 없이 한 줄로 출력하세요.** 문서가 길어 보기 좋게 쓰면
중간에 잘립니다. 사람이 읽을 것이 아니라 프로그램이 읽습니다.

## 값 규칙
- tone 은 accent / neutral / risk / caution 중에서만 고릅니다.
- gap 은 객체입니다: "gap": { "reason": "..." }. 문자열이 아닙니다.
- 근거가 있는 칸에는 gap 을 넣지 마세요.
- icon 은 아래 목록에서만 고릅니다. 없으면 빼세요.
  problem warning risk ai data chip server cloud desktop mobile code api
  team user org-chart agency grant award milestone ip certificate seal
  funds budget investment estimate cost-cut receipt bank card
  market growth scaleup global location manufacturing distribution
  trending strength idea test verified shield-ok privacy rules

반드시 완결된 JSON 으로 끝내세요. 중간에 끊기면 전부 버려집니다.`;

export interface PosterCreateInput {
  /**
   * 어느 트랙으로 시작했는가.
   *
   * modoo 는 공고가 하나로 고정이라 사용자가 올린 파일이 아니라
   * 미리 정리해 둔 공고 요약을 읽는다. 읽는 대상이 원문이 아니라
   * 요약본이라는 사실을 모델에게 알려 줘야 "원문을 더 찾아보려" 하지 않는다.
   */
  track?: 'gov' | 'modoo';
  title: string;
  idea: string;
  /**
   * 업로드된 공고문의 **절대 경로**. 없으면 일반 초안을 만든다.
   *
   * 파일명만 주면 모델이 찾지 못한다 — 작업 디렉터리가 어디인지 모르기 때문이다.
   */
  noticePath?: string | null;
  /** 신청 기업 정보 — 있으면 기업 현황 블록에 반영한다 */
  company?: {
    name: string;
    stage?: string | null;
    industry?: string | null;
    region?: string | null;
    foundedAt?: string | null;
    employees?: number | null;
  } | null;
}

/** 요약 한 장 생성 요청문 */
export function buildPosterCreatePrompt(input: PosterCreateInput): string {
  const shapes = Object.entries(POSTER_SHAPE_SPECS)
    .map(
      ([key, s]) =>
        `- ${key} (${s.label}): ${s.when}\n  역할 배지: ${s.roles.join(' / ')}`,
    )
    .join('\n');

  const company = input.company
    ? [
        `- 기업명: ${input.company.name}`,
        input.company.stage && `- 사업자 형태: ${input.company.stage}`,
        input.company.industry && `- 업종: ${input.company.industry}`,
        input.company.region && `- 지역: ${input.company.region}`,
        input.company.foundedAt && `- 창업일: ${input.company.foundedAt}`,
        input.company.employees != null && `- 종업원 수: ${input.company.employees}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '(등록된 기업 정보 없음 — 기업 현황 블록은 아이디어에서 유추하되, 모르는 항목은 gap 으로 남길 것)';

  const modooNotice = input.noticePath
    ? `## 공고 (모두의 창업 프로젝트 — 고정)
아래 경로의 파일을 **Read 도구로 먼저 읽으세요.**

    ${input.noticePath}

「모두의 창업 프로젝트」 통합 모집공고에서 사업계획서에 필요한 것만
미리 추려 둔 **요약본**입니다. 이것이 공고의 전부입니다. 더 찾지 마세요.

- 지원자는 아래 지원서 문항(Q1~Q11)에 답을 써서 냅니다.
  그 답이 곧 아이디어 원문이며, 미작성 문항은 **그대로 gap 이 됩니다.**
- 공고의 평가 기준·가점 항목에 맞는 말로 아이디어를 바꿔 씁니다.
- eyebrow 에는 "모두의 창업 프로젝트" 와 해당 트랙을 넣습니다.
- 공고가 요구하는데 답변에 없는 것은 지어내지 말고 gap 으로 남깁니다.`
    : '';

  const notice = input.track === 'modoo'
    ? modooNotice
    : input.noticePath
    ? `## 공고문
아래 경로의 파일을 **Read 도구로 먼저 읽으세요.**

    ${input.noticePath}

읽은 뒤 이 공고가 요구하는 것에 맞춰 요약을 씁니다.
- 공고의 지원 대상·지원 내용·평가 항목에 맞는 말로 아이디어를 바꿔 씁니다.
- 공고가 요구하는데 아이디어에 없는 것은 gap 으로 남깁니다. 지어내지 마세요.
- 공고문에 적힌 사업명·기관명은 eyebrow 에 넣습니다.`
    : `## 공고문
없습니다. 특정 공고에 맞추지 말고 **일반적인 정부지원사업 기준**으로 씁니다.
eyebrow 에는 사업 분야를 짧게 적습니다.`;

  return `## 사업 제목
${input.title}

## 아이디어 (사용자가 직접 쓴 원문)
${input.idea}

## 신청 기업
${company}

${notice}

## 골격 고르기
아래 중 이 사업에 맞는 것 하나를 골라, 1번 블록(기업 현황)의 역할 배지를
그 세트에서 씁니다.

${shapes}

협력 기관이 확인되지 않으면 solo 를 고르고, 카드를 "기관"이 아니라
**역량 구획**(연구팀 / 외주·시험 / 선행연구·IP)으로 채웁니다.
없는 협력사를 만들어내는 것보다 낫습니다.

## 할 일
요약 한 장 JSON 을 만드세요. 모르는 것은 gap 으로 남기세요.`;
}
