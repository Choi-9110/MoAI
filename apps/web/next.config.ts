import type { NextConfig } from 'next';

/**
 * API 서버는 별도 포트(4000)에서 돈다.
 *
 * 브라우저가 그 주소를 직접 부르면, 외부에 공개할 때 포트를 두 개 열어야 한다.
 * ngrok 무료 플랜은 터널이 하나뿐이고, 남의 브라우저에서 `localhost:4000` 은
 * 그 사람의 PC 를 가리키므로 애초에 닿지도 않는다.
 *
 * 그래서 `/api/*` 를 이 서버가 받아 넘긴다. 밖에서는 포트 하나만 보면 된다.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * 개발 서버에 접속을 허용할 바깥 주소.
 *
 * Next 는 개발 중에 다른 출처에서 오는 요청을 기본으로 막는다. 개발 서버는
 * 소스맵 같은 것을 그대로 내주기 때문이다. ngrok 으로 열면 그 도메인이
 * "다른 출처"가 되어 화면은 뜨는데 스크립트가 전부 막힌다 —
 * 아무것도 눌리지 않는 상태가 된다.
 *
 * 쉼표로 여러 개를 넣을 수 있다. 예)
 *   DEV_ORIGINS=conjure-hamper-citation.ngrok-free.dev,another.ngrok-free.dev
 */
const devOrigins = (process.env.DEV_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^https?:\/\//, ''))
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
