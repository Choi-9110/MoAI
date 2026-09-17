import type { PosterDoc } from '@moai/shared';

/**
 * 템플릿 검증용 샘플.
 *
 * 레퍼런스 인포그래픽과 같은 내용을 블록 구조로 옮긴 것이다.
 * 일부러 `gap` 을 몇 군데 남겨 뒀다 — 요약이 매끈하기만 하면
 * 무엇을 더 채워야 하는지 보이지 않는다.
 */
export const SAMPLE_POSTER: PosterDoc = {
  eyebrow: '기업 현황 · 4사 컨소시엄',
  title: 'AI 철도역사 인파밀집 예방 디지털 트윈',
  blocks: [
    {
      id: 'orgs',
      type: 'org_grid',
      category: '컨소시엄',
      items: [
        {
          role: '주관',
          name: '이삭엔지니어링',
          suffix: '중소기업',
          lines: [
            'AI CCTV · 데이터 통합 플랫폼',
            'Edge 전처리',
            '사업화 · 혁신제품 지정 주도',
          ],
        },
        {
          role: '참여',
          name: '인사이터',
          lines: ['3변수 위험도 분석', '병목 예측', '디지털트윈 인파 시뮬레이션'],
          gap: { reason: '담당 인력 규모와 수행 실적이 아직 없습니다.' },
        },
        {
          role: '참여',
          name: '고브이알',
          lines: [
            'Unity 설치형 3D 디지털트윈 관제',
            '히트맵 · 이동흐름 시각화',
            '상황 재현',
          ],
        },
        {
          role: '공동',
          name: '고등기술연구원',
          suffix: '비영리',
          lines: ['시험평가', '인증 불합격요소 제로화', '국토부 · 철도기관 MOU 지원'],
        },
      ],
    },
    {
      id: 'note',
      type: 'note_bar',
      icon: 'agency',
      text: '외부 공인 시험기관 — 개발 내용별 시험 · 인증 수행 (신뢰성 확보)',
    },
    {
      id: 'goal',
      type: 'labeled_text',
      category: '사업 목표',
      tone: 'neutral',
      body:
        'AI CCTV · 디지털 트윈으로 철도역사 인파밀집 위험을 사전 예측 · 경보 · 대응 · 재현하는 안전관리 플랫폼을 개발하고, 혁신제품(유형2) 지정 · 시범구매로 공공조달 시장에 진입한다.',
    },
    {
      id: 'problems',
      type: 'labeled_cards',
      category: '내부 문제점',
      tone: 'risk',
      cards: [
        {
          title: '감시는 있으나 예측 부재',
          icon: 'warning',
          lines: ['육안 의존 · 사후 인지', '전 구간 감시 사각지대'],
        },
        {
          title: '다종 데이터 · 다구역 통합 부재',
          icon: 'warning',
          lines: ['CCTV · 게이트 · 방송', '이벤트 분산'],
        },
        {
          title: '운영자 의사결정 지원 부재',
          icon: 'warning',
          lines: ['병목 예측 · 인파관리 계획', '시나리오 도구 부재'],
          gap: { reason: '현장 운영자 인터뷰 등 근거가 필요합니다.' },
        },
      ],
    },
    {
      id: 'solutions',
      type: 'labeled_cards',
      category: '해결 방안',
      tone: 'accent',
      cards: [
        {
          title: 'AI 사전 예측형 관제',
          icon: 'ai',
          lines: [
            '인원수 · 이동속도 · 체류시간',
            '3변수 위험도, 4단계 위험등급',
            '실시간 산정',
          ],
        },
        {
          title: '통합 플랫폼 + 3D 디지털트윈',
          icon: 'desktop',
          lines: ['단일 데이터 흐름', '밀집도 히트맵 · 이동흐름', '위험등급 시각화'],
        },
        {
          title: '디지털트윈 보행 시뮬레이션',
          icon: 'team',
          lines: [
            '병목 발생위치 · 위험발생시점 예측',
            '의사결정 시나리오 추천',
            '타임라인 사후 재현',
          ],
        },
      ],
    },
    {
      id: 'external',
      type: 'compare',
      left: {
        category: '외부 문제점',
        tone: 'risk',
        icon: 'privacy',
        text: 'CCTV 영상 개인정보 반출 우려 + 컨소시엄 자체시험 신뢰성 논란',
      },
      right: {
        category: '해결 방안',
        tone: 'accent',
        icon: 'shield-ok',
        text:
          '영상 원본 미전송 · 비식별 Edge 전처리(보안 "일반") + 시험 · 인증은 외부 공인 시험기관 수행',
      },
    },
    {
      id: 'effects',
      type: 'metrics',
      category: '기대 효과',
      tone: 'accent',
      items: [
        { caption: '정확도', value: '≥90%', note: 'AI 인파분석' },
        { caption: '재현율', value: '≥85%', note: '위험도 · 시뮬레이션' },
        {
          caption: '병목예측',
          value: '≥80%',
          note: '5분 선행 경보',
          gap: { reason: '목표치 산출 근거가 제시되지 않았습니다.' },
        },
        { caption: '시각화', value: '≤3초', note: '3D 관제 지연' },
        { caption: '가용성', value: '≥99%', note: '시스템 가동률' },
        { caption: '혁신제품', value: '유형2', note: '지정 · TRL 9' },
      ],
    },
  ],
};
