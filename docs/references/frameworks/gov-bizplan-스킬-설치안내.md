# gov-bizplan 스킬 설치 안내 (타인 전달용)

**gov-bizplan** — 정부지원사업·국책과제 사업계획서 작성 스킬.
공고 분석 → RFP 분석 → 리서치 4종 → 목차 8항목 순차 집필 → 평가위원 관점 검증까지의 전 과정과 프롬프트 15종이 들어 있습니다.

## 설치 (Claude Code)

1. 동봉된 `gov-bizplan-skill.zip`의 압축을 풉니다.
2. 폴더째 아래 위치로 복사합니다:
   - Windows: `C:\Users\<사용자>\.claude\skills\gov-bizplan\`
   - Mac/Linux: `~/.claude/skills/gov-bizplan/`
3. 최종 구조가 이렇게 되면 완료:
   ```
   .claude/skills/gov-bizplan/
   ├── SKILL.md
   └── references/
       ├── prompts.md      (프롬프트 15종)
       ├── artifacts.md    (산출물 14종 스펙)
       └── sources.md      (방법론 출처)
   ```
4. Claude Code를 새 세션으로 열면 자동 인식됩니다.

## 사용법

- 공고문/RFP 파일을 첨부하고 "이 공고 분석해서 사업계획서 준비해줘"라고 하면 스킬이 자동 발동됩니다.
- 명시 호출: "gov-bizplan 스킬로 진행해줘"
- 진행 중 두 번 확인을 요청받습니다: ①지원 여부·대상 RFP 확정 ②최종 초안 팩트체크 — 이건 스킬에 내장된 안전장치입니다.

## claude.ai (웹/앱)에서 쓰려면

설정 → 기능(Capabilities) → 스킬에서 zip을 업로드하면 됩니다 (SKILL.md가 폴더 최상위에 있는 zip 그대로 사용 가능).

## 참고

- 산출물은 과제별 폴더에 `공고분석.md → RFP분석.md → 리서치 4종 → 1_필요성.md ~ 8_사업화.md` 순으로 쌓입니다.
- HWP 최종본이 필요하면 각자 환경의 HWP 도구로 이식하세요(스킬은 MD/DOCX까지 산출).
