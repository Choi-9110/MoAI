import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

const TITLE = 'MoAI — 우리 회사에 맞는 지원사업을 찾아드립니다';
const DESCRIPTION =
  '기업 정보를 한 번만 입력하면 지원 가능한 정부지원사업을 캘린더로 안내하고, 사업계획서 초안까지 만들어 드립니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,

  /*
   * 링크를 붙여 넣었을 때 뜨는 미리보기.
   *
   * 그림은 `opengraph-image.tsx` 가 그린다 — 여기에 파일 경로를 적지 않는
   * 것은 Next 가 그 파일을 알아서 찾아 넣기 때문이다.
   *
   * `metadataBase` 가 없으면 미리보기 주소가 상대경로로 나가서 카톡·슬랙이
   * 그림을 못 찾는다. 배포 주소를 환경변수로 두고, 없으면 지금 쓰는 도메인을
   * 기본으로 한다.
   */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://moai.drevv.co.kr'),
  openGraph: {
    type: 'website',
    siteName: 'MoAI',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 가독성이 최우선이므로 Pretendard 를 사용한다. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      {/*
        브라우저 확장(번역기·컬러픽커 등)이 <body> 에 속성을 심는다.
        React 가 서버 HTML 과 다르다며 경고를 띄우는데, 우리 코드 문제가 아니고
        고칠 수도 없다. body 한 겹에만 경고를 끈다 — 안쪽 내용은 그대로 검사한다.
      */}
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
