/**
 * 맨 아래 회사 정보.
 *
 * MoAI 는 서비스 이름이고, 만들어 운영하는 곳은 **(주)디레브**다.
 * 처음 보는 사람에게는 이 서비스를 누가 책임지는지가 안 보이므로,
 * 회사 이름·주소·연락처를 숨기지 않고 적는다. 지원사업 심사에서도
 * 운영 주체가 분명한지를 본다.
 *
 * 내용은 회사 사이트(drevv.co.kr)의 것과 **글자 그대로** 맞춘다.
 * 두 곳이 다르면 어느 쪽이 맞는지 확인할 방법이 없다.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--moai-border)]">
      <div className="mx-auto max-w-6xl px-6 py-9">
        <p className="text-sm font-bold text-[var(--moai-ink)]">MoAI</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--moai-muted)]">
          MoAI 는{' '}
          <a
            href="https://drevv.co.kr"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--moai-accent)] underline underline-offset-2"
          >
            (주)디레브
          </a>
          가 만들고 운영합니다.
        </p>

        {/*
          약관·방침은 가입 전에 읽는 문서라 로그인 없이 열려야 한다.
          결제 심사에서도 이 링크를 눌러 확인하므로 푸터에 상시 노출한다.
        */}
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <a
            href="/terms"
            className="text-[var(--moai-muted)] underline underline-offset-2"
          >
            이용약관
          </a>
          <a
            href="/privacy"
            className="font-semibold text-[var(--moai-muted)] underline underline-offset-2"
          >
            개인정보처리방침
          </a>
        </nav>

        {/*
          주소·연락처는 한 줄로 이어 붙인다. 좁은 화면에서는 알아서 접히게
          두고, 가운뎃점 앞뒤로 줄이 끊겨도 읽는 데 문제가 없게 했다.

          통신판매업 신고번호는 전자상거래법상 표시 의무 항목이다.
        */}
        <p className="mt-4 text-xs leading-relaxed text-[var(--moai-subtle)]">
          © 2026 DREVV 주식회사 디레브 · 대표 최현근 · 서울특별시 구로구 디지털로34길 43,
          코오롱싸이언스밸리1차 405호 내 4128호 · 사업자등록번호 529-87-03931 ·
          통신판매업신고 제2026-서울구로-1105호 ·{' '}
          <a
            href="mailto:admin@drevv.co.kr"
            className="underline underline-offset-2"
          >
            admin@drevv.co.kr
          </a>
        </p>
        <p className="mt-1.5 text-xs text-[var(--moai-subtle)]">
          공고 정보는 K-Startup·기업마당 공개 데이터를 사용합니다.
        </p>
      </div>
    </footer>
  );
}
