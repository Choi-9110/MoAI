/*
 * MoAI 브랜드 아이콘 — 브랜드킷 v2(딥 그린)에서 추출한 선형 아이콘 116종.
 *
 * 이 파일은 스크립트로 생성했다. 직접 고치지 말고 브랜드킷을 갱신할 것.
 * 모든 획은 currentColor 라서 놓인 자리의 글자색을 그대로 따른다.
 */

export interface BrandIcon {
  /** 브랜드킷에 적힌 한국어 이름 */
  label: string;
  /** <svg viewBox="0 0 24 24"> 안에 들어가는 내용 */
  body: string;
}

export const BRAND_ICONS = {
  'tone-calm': {
    label: '차분한 전문성',
    body: `<path d="M6 3h7l5 5v13H6z"></path><path d="M13 3v5h5"></path>`,
  },
  'tone-document': {
    label: '문서처럼 읽히게',
    body: `<path d="M9 7h11M9 12h11M9 17h11"></path><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'tone-one-at-a-time': {
    label: '한 번에 하나씩',
    body: `<rect x="3" y="8" width="18" height="8" rx="4"></rect><path d="M8.5 12l2 2 3.5-4"></path>`,
  },
  'tone-honest': {
    label: '불확실성을 숨기지 않기',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M9.6 9.8a2.5 2.5 0 1 1 3.4 2.3v1.3"></path><circle cx="12.6" cy="16.4" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'doc': {
    label: '문서',
    body: `<path d="M6 3h7l5 5v13H6z"></path><path d="M13 3v5h5"></path>`,
  },
  'doc-new': {
    label: '새 문서',
    body: `<path d="M6 3h7l5 5v13H6z"></path><path d="M13 3v5h5"></path><path d="M12 12.5v5M9.5 15h5"></path>`,
  },
  'section': {
    label: '섹션',
    body: `<path d="M4 8l8-4 8 4-8 4z"></path><path d="M4 12l8 4 8-4"></path><path d="M4 16l8 4 8-4"></path>`,
  },
  'problem': {
    label: '문제 인식',
    body: `<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3.5"></circle><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'market': {
    label: '시장 분석',
    body: `<path d="M4 20h16"></path><path d="M7 20v-6M12 20V8M17 20v-9"></path>`,
  },
  'growth': {
    label: '성장 전략',
    body: `<path d="M4 16l5-5 4 3 6-7"></path><path d="M15 7h4v4"></path>`,
  },
  'budget': {
    label: '소요 예산',
    body: `<rect x="4" y="6" width="16" height="12" rx="3"></rect><path d="M4 10h16"></path><circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'team': {
    label: '팀 구성',
    body: `<circle cx="9.5" cy="9" r="3"></circle><path d="M4 19a5.5 5.5 0 0 1 11 0"></path><path d="M16.5 7.4a3 3 0 0 1 0 5.2"></path><path d="M17.5 14.6a5.5 5.5 0 0 1 3 3.4"></path>`,
  },
  'user': {
    label: '사용자',
    body: `<circle cx="12" cy="8.5" r="3.5"></circle><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>`,
  },
  'duration': {
    label: '소요 시간',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M12 7.5V12l3.5 2"></path>`,
  },
  'deadline': {
    label: '공고 마감',
    body: `<rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M4 10h16M9 3v4M15 3v4"></path>`,
  },
  'question': {
    label: '질의',
    body: `<rect x="4" y="4" width="16" height="12" rx="3"></rect><path d="M8 16v4.5l4.5-4.5"></path>`,
  },
  'list': {
    label: '목록',
    body: `<path d="M9 7h11M9 12h11M9 17h11"></path><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'chip': {
    label: '칩 선택',
    body: `<rect x="3" y="8" width="18" height="8" rx="4"></rect><path d="M8.5 12l2 2 3.5-4"></path>`,
  },
  'edit': {
    label: '직접 수정',
    body: `<path d="M4 20l1-4L16 5l3 3L8 19z"></path><path d="M14.5 6.5l3 3"></path>`,
  },
  'regenerate': {
    label: '다시 생성',
    body: `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"></path><path d="M19.5 5v4h-4"></path>`,
  },
  'autosave': {
    label: '자동 저장',
    body: `<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8.5 12.5l2.5 2.5 4.5-5.5"></path>`,
  },
  'download-docx': {
    label: 'DOCX 내려받기',
    body: `<path d="M12 4v10"></path><path d="M8 10.5l4 4 4-4"></path><path d="M5 19h14"></path>`,
  },
  'upload': {
    label: '자료 올리기',
    body: `<path d="M12 20V10"></path><path d="M8 13.5l4-4 4 4"></path><path d="M5 5h14"></path>`,
  },
  'ai': {
    label: 'AI 생성',
    body: `<path d="M11 3.5l1.6 4.6 4.6 1.6-4.6 1.6L11 15.9 9.4 11.3 4.8 9.7l4.6-1.6z"></path><path d="M18 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"></path>`,
  },
  'confirmed': {
    label: '확정',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M8.5 12.2l2.5 2.5 4.5-5.4"></path>`,
  },
  'needs-user': {
    label: '확인 필요',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M9.6 9.8a2.5 2.5 0 1 1 3.4 2.3v1.3"></path><circle cx="12.6" cy="16.4" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'risk': {
    label: '리스크',
    body: `<path d="M12 4.5l8.5 15H3.5z"></path><path d="M12 10v4"></path><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'progress': {
    label: '진행률',
    body: `<circle cx="12" cy="12" r="8" opacity="0.25"></circle><path d="M12 4a8 8 0 0 1 8 8"></path>`,
  },
  'search': {
    label: '검색',
    body: `<circle cx="11" cy="11" r="6"></circle><path d="M15.5 15.5L20 20"></path>`,
  },
  'arrow': {
    label: '이동',
    body: `<path d="M4 12h15"></path><path d="M14 7l5 5-5 5"></path>`,
  },
  'expand': {
    label: '펼치기',
    body: `<path d="M6 10l6 6 6-6"></path>`,
  },
  'plus': {
    label: '추가',
    body: `<path d="M12 5v14M5 12h14"></path>`,
  },
  'close': {
    label: '닫기',
    body: `<path d="M6 6l12 12M18 6L6 18"></path>`,
  },
  'shield-ok': {
    label: '보안 통과',
    body: `<path d="M12 3l7 3v6c0 4-3 6.6-7 8-4-1.4-7-4-7-8V6z"></path><path d="M9.3 11.6l2.2 2.2 3.5-4.2"></path>`,
  },
  'shield-warn': {
    label: '보안 경고',
    body: `<path d="M12 3l7 3v6c0 4-3 6.6-7 8-4-1.4-7-4-7-8V6z"></path><path d="M12 8.5v4"></path><circle cx="12" cy="15.3" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'unlock': {
    label: '잠금 해제',
    body: `<rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8.5 10V8a3.5 3.5 0 0 1 6.6-1.7"></path>`,
  },
  'access': {
    label: '접근 권한',
    body: `<circle cx="8.5" cy="8.5" r="4"></circle><path d="M11.4 11.4L20 20"></path><path d="M17.2 17.2l-2 2"></path>`,
  },
  'identity': {
    label: '본인 인증',
    body: `<path d="M12 3.5c-4 0-7 3.4-7 7.5 0 3.6 1 6.5 2.5 9.5"></path><path d="M12 3.5c4 0 7 3.4 7 7.5 0 3.6-1 6.5-2.5 9.5"></path><path d="M12 7.5c-2 0-3.5 1.6-3.5 3.7 0 2.6.6 4.8 1.6 6.8"></path><path d="M12 7.5c2 0 3.5 1.6 3.5 3.7 0 2.6-.6 4.8-1.6 6.8"></path><path d="M12 11.5v5"></path>`,
  },
  'certificate': {
    label: '인증서',
    body: `<rect x="4" y="4" width="16" height="11" rx="2"></rect><path d="M7.5 8h9M7.5 11h5"></path><circle cx="16.5" cy="17.5" r="3"></circle><path d="M14.5 19.8L13.8 22l2.7-1 2.7 1-.7-2.2"></path>`,
  },
  'seal': {
    label: '직인 · 날인',
    body: `<circle cx="12" cy="9" r="5"></circle><path d="M9 14h6l1 4H8z"></path><path d="M4.5 21h15"></path>`,
  },
  'privacy': {
    label: '개인정보',
    body: `<circle cx="9.5" cy="8" r="3.2"></circle><path d="M4 19a6 6 0 0 1 8.6-5.4"></path><path d="M18 12.2l3 1.2v2.5c0 2-1.3 3.5-3 4.3-1.7-.8-3-2.3-3-4.3v-2.5z"></path>`,
  },
  'mfa': {
    label: '2단계 인증',
    body: `<rect x="7" y="3" width="10" height="18" rx="3"></rect><path d="M9.8 12.2l1.7 1.7 3-3.5"></path>`,
  },
  'visible': {
    label: '공개',
    body: `<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6"></circle>`,
  },
  'hidden': {
    label: '비공개',
    body: `<path d="M4.5 9.5C3.4 10.6 2.5 12 2.5 12s3.5 5.5 9.5 5.5c1.3 0 2.5-.3 3.6-.7"></path><path d="M18.6 15C20.4 13.6 21.5 12 21.5 12S18 6.5 12 6.5c-1 0-1.9.2-2.7.4"></path><path d="M5 19L19 5"></path>`,
  },
  'funds': {
    label: '자금',
    body: `<ellipse cx="12" cy="6.5" rx="7" ry="3"></ellipse><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"></path><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"></path>`,
  },
  'project-cost': {
    label: '사업비',
    body: `<rect x="3" y="7" width="18" height="10" rx="2"></rect><circle cx="12" cy="12" r="2.6"></circle><circle cx="6.5" cy="12" r=".9" fill="currentColor" stroke="none"></circle><circle cx="17.5" cy="12" r=".9" fill="currentColor" stroke="none"></circle>`,
  },
  'card': {
    label: '결제 · 카드',
    body: `<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 10h18"></path><path d="M6.5 14.5h4"></path>`,
  },
  'estimate': {
    label: '예산 산정',
    body: `<rect x="5" y="3" width="14" height="18" rx="3"></rect><path d="M8.5 7.5h7"></path><circle cx="9.5" cy="12" r=".9" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"></circle><circle cx="14.5" cy="12" r=".9" fill="currentColor" stroke="none"></circle><circle cx="9.5" cy="16" r=".9" fill="currentColor" stroke="none"></circle><circle cx="12" cy="16" r=".9" fill="currentColor" stroke="none"></circle><circle cx="14.5" cy="16" r=".9" fill="currentColor" stroke="none"></circle>`,
  },
  'allocation': {
    label: '비중 · 배분',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M12 4v8h8"></path>`,
  },
  'cost-cut': {
    label: '비용 절감',
    body: `<path d="M4 8l5 5 4-3 6 7"></path><path d="M19 13v4h-4"></path>`,
  },
  'bank': {
    label: '금융기관',
    body: `<path d="M3.5 9.5L12 4l8.5 5.5"></path><path d="M6 10.5v8M12 10.5v8M18 10.5v8"></path><path d="M3.5 20.5h17"></path>`,
  },
  'receipt': {
    label: '증빙 · 영수',
    body: `<path d="M6 3h12v18l-3-1.7-3 1.7-3-1.7L6 21z"></path><path d="M9 8h6M9 12h6M9 16h3"></path>`,
  },
  'investment': {
    label: '투자 유치',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M8.5 13.5l3-3 2 2 3-3.5"></path>`,
  },
  'budget-table': {
    label: '예산 표',
    body: `<rect x="3.5" y="5" width="17" height="14" rx="2"></rect><path d="M3.5 9.5h17M9 9.5V19"></path>`,
  },
  'agency': {
    label: '주관 기관',
    body: `<path d="M3.5 20.5h17"></path><path d="M6 20.5V9l6-4 6 4v11.5"></path><path d="M10 20.5v-5h4v5"></path>`,
  },
  'grant': {
    label: '공고',
    body: `<path d="M4 10v4l12 4.5V5.5z"></path><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5"></path>`,
  },
  'application': {
    label: '신청서',
    body: `<rect x="5" y="5" width="14" height="16" rx="3"></rect><path d="M9.5 3.5h5v3h-5z"></path><path d="M9.5 13l2.2 2.2 3.8-4.4"></path>`,
  },
  'submit': {
    label: '접수 · 제출',
    body: `<path d="M4 12l16-7-6.5 16-2.6-6.2z"></path><path d="M10.9 14.8L20 5"></path>`,
  },
  'review': {
    label: '심사 · 검토',
    body: `<circle cx="11" cy="11" r="6"></circle><path d="M8.5 11l2 2 3.5-4"></path><path d="M15.5 15.5L20 20"></path>`,
  },
  'agreement': {
    label: '협약 · 서명',
    body: `<path d="M4 17c3 0 4-6 6-6s2 4 4 4 3-2.5 6-2.5"></path><path d="M4 20.5h16"></path>`,
  },
  'rules': {
    label: '사업 규정',
    body: `<path d="M12 6.5C10.5 5 8 4.5 4.5 4.5v12c3.5 0 6 .5 7.5 2 1.5-1.5 4-2 7.5-2v-12c-3.5 0-6 .5-7.5 2z"></path><path d="M12 6.5V18.5"></path>`,
  },
  'award': {
    label: '선정 · 수상',
    body: `<circle cx="12" cy="14.5" r="4.5"></circle><path d="M8.5 10.5L6 3.5M15.5 10.5L18 3.5"></path>`,
  },
  'consortium': {
    label: '협력 · 컨소시엄',
    body: `<circle cx="9" cy="12" r="5"></circle><circle cx="15" cy="12" r="5"></circle>`,
  },
  'awaiting': {
    label: '결과 대기',
    body: `<path d="M7 3h10"></path><path d="M7 21h10"></path><path d="M8 3v3.5l4 4 4-4V3M8 21v-3.5l4-4 4 4V21"></path>`,
  },
  'milestone': {
    label: '마일스톤',
    body: `<path d="M6 3.5v17.5"></path><path d="M6 4.5h11l-2 3.6 2 3.6H6z"></path>`,
  },
  'ip': {
    label: '지식재산 · 특허',
    body: `<path d="M12 3l7 3v6c0 4-3 6.6-7 8-4-1.4-7-4-7-8V6z"></path><path d="M9.5 10.5h5M9.5 13.5h3"></path>`,
  },
  'org-chart': {
    label: '조직도',
    body: `<rect x="9.5" y="3" width="5" height="4.5" rx="1.2"></rect><rect x="3" y="16.5" width="5" height="4.5" rx="1.2"></rect><rect x="16" y="16.5" width="5" height="4.5" rx="1.2"></rect><path d="M12 7.5v4M5.5 16.5v-2.5h13v2.5"></path>`,
  },
  'idea': {
    label: '아이디어',
    body: `<path d="M9 17.5h6"></path><path d="M10 20.5h4"></path><path d="M12 3a6 6 0 0 1 3.5 10.9v3.6h-7v-3.6A6 6 0 0 1 12 3z"></path>`,
  },
  'scaleup': {
    label: '스케일업',
    body: `<path d="M12 3c3 2.6 4.5 6 4.5 9.5L12 17l-4.5-4.5C7.5 9 9 5.6 12 3z"></path><circle cx="12" cy="10" r="1.8"></circle><path d="M9 17l-2 4 3.5-1.8M15 17l2 4-3.5-1.8"></path>`,
  },
  'global': {
    label: '해외 진출',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M4 12h16"></path><path d="M12 4c2.6 2.6 2.6 13 0 16-2.6-3-2.6-13.4 0-16z"></path>`,
  },
  'location': {
    label: '거점 · 위치',
    body: `<path d="M12 21s6.5-6.3 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 14.7 12 21 12 21z"></path><circle cx="12" cy="10.5" r="2.5"></circle>`,
  },
  'manufacturing': {
    label: '제조 · 생산',
    body: `<path d="M3.5 20.5h17"></path><path d="M4 20.5v-8.5l5 3v-3l5 3V8l6 4v8.5"></path>`,
  },
  'distribution': {
    label: '판로 · 유통',
    body: `<path d="M4.5 9.5V20.5h15V9.5"></path><path d="M3 9.5L5 4h14l2 5.5z"></path><path d="M9.5 20.5v-5h5v5"></path>`,
  },
  'trending': {
    label: '주목 · 인기',
    body: `<path d="M12 3.6c3 3 5 5.6 5 8.6a5 5 0 0 1-10 0c0-1.7.8-3.1 2-4.5.4 1.2 1.1 2 2 2.3-.6-2.3-.3-4.4 1-6.4z"></path>`,
  },
  'strength': {
    label: '핵심 · 강점',
    body: `<path d="M12 4l2.4 5.1 5.6.7-4.1 4 1 5.5-4.9-2.7-4.9 2.7 1-5.5-4.1-4 5.6-.7z"></path>`,
  },
  'bookmark': {
    label: '저장 · 북마크',
    body: `<path d="M6 3.5h12V21l-6-4.2L6 21z"></path>`,
  },
  'code': {
    label: '개발',
    body: `<path d="M8.5 8L4.5 12l4 4"></path><path d="M15.5 8l4 4-4 4"></path>`,
  },
  'server': {
    label: '서버 · 인프라',
    body: `<rect x="3.5" y="4" width="17" height="6" rx="2"></rect><rect x="3.5" y="14" width="17" height="6" rx="2"></rect><circle cx="7.5" cy="7" r=".9" fill="currentColor" stroke="none"></circle><circle cx="7.5" cy="17" r=".9" fill="currentColor" stroke="none"></circle>`,
  },
  'cloud': {
    label: '클라우드',
    body: `<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.4 3.4 0 0 0 7 18.5z"></path>`,
  },
  'data': {
    label: '데이터',
    body: `<ellipse cx="12" cy="6" rx="7" ry="3"></ellipse><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"></path><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"></path>`,
  },
  'chip-2': {
    label: 'AI · 반도체',
    body: `<rect x="7" y="7" width="10" height="10" rx="2"></rect><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"></path>`,
  },
  'api': {
    label: 'API 연동',
    body: `<path d="M9 3.5v4.5M15 3.5v4.5"></path><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"></path><path d="M12 16.5v4"></path>`,
  },
  'mobile': {
    label: '모바일',
    body: `<rect x="7" y="3" width="10" height="18" rx="3"></rect><path d="M10.5 18h3"></path>`,
  },
  'desktop': {
    label: '데스크톱',
    body: `<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M9 20.5h6M12 16v4.5"></path>`,
  },
  'test': {
    label: '실증 · 테스트',
    body: `<path d="M9 3.5h6"></path><path d="M10 3.5v6l-4.6 8A2 2 0 0 0 7.2 20.5h9.6a2 2 0 0 0 1.8-3l-4.6-8v-6"></path>`,
  },
  'link': {
    label: '연동 링크',
    body: `<path d="M10.5 13.5l3-3"></path><path d="M8 12L6.5 13.5a3.5 3.5 0 0 0 5 5L13 17"></path><path d="M16 12l1.5-1.5a3.5 3.5 0 0 0-5-5L11 7"></path>`,
  },
  'settings': {
    label: '설정',
    body: `<path d="M4 8h9M17.5 8h2.5M4 16h3.5M12 16h8"></path><circle cx="15.5" cy="8" r="2"></circle><circle cx="10" cy="16" r="2"></circle>`,
  },
  'automation': {
    label: '자동화',
    body: `<path d="M12 3.5l2 3.5h-4z"></path><rect x="4.5" y="7" width="15" height="11" rx="3"></rect><circle cx="9" cy="12.5" r="1.3" fill="currentColor" stroke="none"></circle><circle cx="15" cy="12.5" r="1.3" fill="currentColor" stroke="none"></circle><path d="M8 21h8"></path>`,
  },
  'mail': {
    label: '메일',
    body: `<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M4 8.5l8 5 8-5"></path>`,
  },
  'bell': {
    label: '알림',
    body: `<path d="M6 16.5V10a6 6 0 0 1 12 0v6.5l1.5 2.5h-15z"></path><path d="M10 21.5h4"></path>`,
  },
  'phone': {
    label: '전화 문의',
    body: `<path d="M6 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6.5 6.5l1.5-2 4 1.5v3A2 2 0 0 1 18.4 20C10.9 19.3 4.7 13.1 4 5.6A2 2 0 0 1 6 3.5z"></path>`,
  },
  'share': {
    label: '공유',
    body: `<circle cx="17" cy="6" r="2.6"></circle><circle cx="6.5" cy="12" r="2.6"></circle><circle cx="17" cy="18" r="2.6"></circle><path d="M14.7 7.3L8.8 10.7M8.8 13.3l5.9 3.4"></path>`,
  },
  'feedback': {
    label: '상담 · 피드백',
    body: `<rect x="3.5" y="4.5" width="14" height="11" rx="3"></rect><path d="M7.5 15.5v4l4.5-4"></path><path d="M20.5 9v8.5a3 3 0 0 1-3 3h-2"></path>`,
  },
  'info': {
    label: '안내',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M12 11.5v5"></path><circle cx="12" cy="8.3" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'external': {
    label: '외부 링크',
    body: `<path d="M14 3.5h6v6"></path><path d="M20 3.5l-8.5 8.5"></path><path d="M18 14v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4.5"></path>`,
  },
  'history': {
    label: '변경 이력',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 1.5"></path><path d="M4.5 8.5L4 4"></path>`,
  },
  'folder': {
    label: '폴더',
    body: `<path d="M3.5 7.5a2 2 0 0 1 2-2h3.7l2 2.5h7.3a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"></path>`,
  },
  'attach': {
    label: '첨부',
    body: `<path d="M18 10.5l-7 7a3 3 0 0 1-4.2-4.2l7.8-7.8a4 4 0 0 1 5.7 5.7l-8 8"></path>`,
  },
  'print': {
    label: '인쇄',
    body: `<path d="M7 8V4h10v4"></path><rect x="4" y="8" width="16" height="7" rx="2"></rect><path d="M7 13h10v7.5H7z"></path>`,
  },
  'copy': {
    label: '복제',
    body: `<rect x="8" y="8" width="12" height="12" rx="3"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>`,
  },
  'trash': {
    label: '삭제',
    body: `<path d="M4.5 7h15"></path><path d="M9 7V4.5h6V7"></path><path d="M6.5 7l1 13.5h9L17.5 7"></path>`,
  },
  'filter': {
    label: '필터',
    body: `<path d="M4 5h16l-6 7v7.5l-4-2.2V12z"></path>`,
  },
  'sort': {
    label: '정렬',
    body: `<path d="M7 4.5v15"></path><path d="M4 8l3-3.5L10 8"></path><path d="M17 19.5v-15"></path><path d="M14 16l3 3.5 3-3.5"></path>`,
  },
  'tag': {
    label: '태그',
    body: `<path d="M11 4H4.5v6.5L14 20l6-6z"></path><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"></circle>`,
  },
  'docx': {
    label: 'DOCX',
    body: `<path d="M6 3h7l5 5v13H6z"></path><path d="M13 3v5h5"></path><path d="M9 13h6M9 16.5h4"></path>`,
  },
  'verified': {
    label: '검수 완료',
    body: `<path d="M6 3h7l5 5v13H6z"></path><path d="M13 3v5h5"></path><path d="M9.5 12.5l2 2 3-3.5"></path>`,
  },
  'cloud-save': {
    label: '클라우드 저장',
    body: `<path d="M12 15.5V4"></path><path d="M8 7.5l4-3.5 4 3.5"></path><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"></path>`,
  },
  'templates': {
    label: '양식 모음',
    body: `<rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect x="13" y="4" width="7" height="7" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="13" y="13" width="7" height="7" rx="1.5"></rect>`,
  },
  'blocked': {
    label: '차단 · 반려',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M6.5 17.5l11-11"></path>`,
  },
  'pause': {
    label: '일시 중지',
    body: `<circle cx="12" cy="12" r="8"></circle><path d="M10 9.5v5M14 9.5v5"></path>`,
  },
  'stop': {
    label: '생성 중단',
    body: `<circle cx="12" cy="12" r="8"></circle><rect x="9.5" y="9.5" width="5" height="5" rx="1"></rect>`,
  },
  'spinner': {
    label: '처리 중',
    body: `<path d="M4 12a8 8 0 1 1 8 8" opacity="0.3"></path><path d="M12 4a8 8 0 0 1 8 8"></path>`,
  },
  'sync': {
    label: '동기화',
    body: `<path d="M19.5 10.5A7.5 7.5 0 0 0 6.3 7.3"></path><path d="M19.5 6.5v4h-4"></path><path d="M4.5 13.5a7.5 7.5 0 0 0 13.2 3.2"></path><path d="M4.5 17.5v-4h4"></path>`,
  },
  'disabled': {
    label: '비활성',
    body: `<rect x="3.5" y="6" width="17" height="12" rx="3"></rect><path d="M7 12h10"></path>`,
  },
  'warning': {
    label: '주의',
    body: `<path d="M12 3.5l8.5 15h-17z"></path><path d="M12 9.5v4"></path><circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none"></circle>`,
  },
  'done': {
    label: '완료',
    body: `<path d="M20 6.5L9.5 17 4 11.5"></path>`,
  },
} as const satisfies Record<string, BrandIcon>;

export type IconName = keyof typeof BRAND_ICONS;

export const ICON_NAMES = Object.keys(BRAND_ICONS) as IconName[];
