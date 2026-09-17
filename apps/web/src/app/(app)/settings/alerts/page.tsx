'use client';

import { NotificationToggle } from '@/components/notifications';

/**
 * 알림 설정.
 *
 * 지금 있는 알림은 하나다 — **백그라운드 작업이 끝났을 때.**
 * 요약 한 장과 사업계획서는 걸어 두고 다른 일을 보는 작업이라, 끝난 것을
 * 사용자가 새로고침으로 확인하게 두면 안 된다.
 *
 * 화면 안 알림(토스트)은 켜고 끄는 것이 없다. 창을 보고 있는 사람에게
 * 한 줄 띄우는 것뿐이라 끌 이유가 없다. 여기서 정하는 것은 **브라우저
 * 알림**뿐이다 — 다른 탭에 가 있어도 뜨는 그것.
 */
export default function AlertsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-grey-900">
        알림 설정
      </h1>
      <p className="mt-1 text-sm text-grey-500">
        오래 걸리는 작업이 끝나면 알려드려요.
      </p>

      <section className="mt-6 rounded-2xl border border-grey-200 bg-white p-5">
        <h2 className="text-base font-bold text-grey-900">작업 완료 알림</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-grey-600">
          요약 한 장과 사업계획서는 시간이 걸려서 걸어 두고 다른 일을 봐도
          됩니다. 다 되면 <b>화면 오른쪽 아래에 알림</b>이 뜹니다. 이 알림은
          어느 화면에 있든 뜨고, 따로 켜지 않아도 됩니다.
        </p>

        <div className="mt-4 border-t border-grey-100 pt-4">
          <p className="text-sm font-semibold text-grey-800">브라우저 알림</p>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-grey-600">
            다른 탭을 보고 있거나 창을 최소화해 두었을 때도 알려드려요.
            브라우저가 권한을 물어보면 허용을 눌러 주세요.
          </p>
          <NotificationToggle />
        </div>

        <p className="mt-4 border-t border-grey-100 pt-4 text-xs leading-relaxed text-grey-500">
          알림은 이 창이 열려 있을 때만 확인합니다. 창을 완전히 닫아 두면
          작업은 계속 돌지만 알림은 다음에 들어왔을 때 뜹니다.
        </p>
      </section>
    </main>
  );
}
