import { ImageResponse } from 'next/og';

/**
 * 링크를 붙여 넣었을 때 뜨는 미리보기 그림.
 *
 * 그림 파일을 따로 두지 않고 **코드로 그린다.** 카피를 고칠 때마다 디자인
 * 도구를 열었다 닫는 대신 이 파일만 고치면 되고, 문구와 그림이 어긋날 일도
 * 없다.
 *
 * 카톡·슬랙·디스코드는 이 그림을 **캐시한다.** 고친 뒤에도 예전 그림이
 * 보이면 각 서비스의 디버거로 새로 읽게 해야 한다.
 */

export const alt = 'MoAI — 우리 회사가 받을 수 있는 지원사업만 골라서';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#00704a',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        {/* 위 — 이름 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#f7f5f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
              color: '#00704a',
            }}
          >
            m
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#f7f5f0' }}>
            MoAI
          </div>
        </div>

        {/* 가운데 — 무엇을 해 주는가 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.22,
              letterSpacing: -2,
            }}
          >
            우리 회사가 받을 수 있는
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.22,
              letterSpacing: -2,
            }}
          >
            지원사업만 골라서
          </div>
          <div
            style={{
              fontSize: 30,
              color: '#cfe4d8',
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            마감을 캘린더로 챙기고, 사업계획서 초안까지 만들어 드립니다
          </div>
        </div>

        {/* 아래 — 무엇으로 이루어져 있는가 */}
        <div style={{ display: 'flex', gap: 14 }}>
          {['지원자격 자동 판정', '마감 캘린더', '공고 양식 그대로 작성'].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  fontSize: 24,
                  color: '#f7f5f0',
                  border: '2px solid rgba(247,245,240,0.45)',
                  borderRadius: 999,
                  padding: '10px 24px',
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}
