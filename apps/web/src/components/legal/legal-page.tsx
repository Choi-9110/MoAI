import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/brand/site-footer';

/**
 * 약관·방침 같은 법적 문서의 공통 틀.
 *
 * **로그인 없이 열려야 한다.** 가입하기 전에 읽고 판단하는 문서이고,
 * 결제 심사에서도 비로그인 상태로 링크를 확인한다. 그래서 `(app)` 그룹이 아닌
 * 최상위에 둔다.
 *
 * 본문은 길기 때문에 읽기 폭을 좁게 잡는다. 화면 폭을 다 쓰면 한 줄이 길어져
 * 눈이 다음 줄을 놓친다.
 */
export function LegalPage({
  title, updatedAt, intro, children,
}: {
  title: string;
  updatedAt: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-grey-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-grey-900">
            MoAI
          </Link>
          <Link href="/" className="text-sm text-grey-500 hover:text-grey-900">
            홈으로
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-[28px] font-bold tracking-tight text-grey-900">{title}</h1>
        <p className="mt-2 text-sm text-grey-500">최종 개정일: {updatedAt}</p>

        {intro && (
          <p className="mt-6 rounded-xl bg-grey-50 p-4 text-[15px] leading-7 text-grey-700">
            {intro}
          </p>
        )}

        <div className="mt-8 space-y-10">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * 조항 하나.
 *
 * 번호를 제목과 함께 두는 이유는, 문의가 왔을 때 "5항 보세요" 로
 * 가리킬 수 있어야 하기 때문이다.
 */
export function Section({
  n, title, children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-20" id={`s${n}`}>
      <h2 className="text-lg font-bold text-grey-900">
        <span className="mr-2 text-brand">{n}.</span>
        {title}
      </h2>
      <div
        className="
          mt-3 space-y-3 text-[15px] leading-7 text-grey-700
          [&_h3]:mt-6 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-grey-900
          [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5
          [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5
          [&_strong]:font-semibold [&_strong]:text-grey-900
          [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2
        "
      >
        {children}
      </div>
    </section>
  );
}

/**
 * 조항 안의 표.
 *
 * 좁은 화면에서는 표가 넘칠 수밖에 없으므로 가로 스크롤을 허용한다 —
 * 글자를 줄여 뭉개는 것보다 낫다.
 */
export function Table({
  head, rows,
}: {
  head: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-grey-200">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="bg-grey-50">
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-grey-200 px-4 py-2.5 text-left font-semibold text-grey-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i > 0 ? 'border-t border-grey-100' : ''}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 align-top leading-6 ${
                    j === 0 ? 'font-medium text-grey-900' : 'text-grey-600'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
