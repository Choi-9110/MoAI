'use client';

import { useEffect, useState } from 'react';

/**
 * 기다리는 동안 지금 무엇을 하고 있는지 돌아가며 보여 준다.
 *
 * **왜 순번이 아니라 문구인가.** 대기열은 "앞에 3명" 같은 순번을 알려 줄 수
 * 있지만, 그건 자기 차례가 언제인지를 계속 확인하게 만든다. 실제로는 창을
 * 닫았다 와도 되는 일이라, 사람이 화면을 지키게 만들 이유가 없다.
 * 대신 **일이 실제로 진행되고 있다는 것**만 보이면 된다.
 *
 * **문구는 실제로 하는 일과 맞춘다.** 하지도 않는 일을 적으면(예: 아직 붙지
 * 않은 특허 검색) 그럴듯해 보일 뿐 거짓말이 된다. 아래 목록은 우리가 진짜로
 * 거치는 단계 — 공고 분석 → 리서치 4종 → 절 집필 → 검토 — 에서 뽑았다.
 */
export function WorkingMessage({
  messages, intervalMs = 4500, className = '',
}: {
  messages: string[];
  /** 너무 빠르면 산만하고, 너무 느리면 멈춘 것처럼 보인다. */
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (messages.length <= 1) return;

    const timer = setInterval(() => {
      // 글자가 바로 갈리면 눈에 거슬려서, 흐려진 뒤에 바꾼다.
      setVisible(false);
      setTimeout(() => {
        setIndex((v) => (v + 1) % messages.length);
        setVisible(true);
      }, 260);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return (
    <span
      aria-live="polite"
      className={`inline-block transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {messages[index]}
    </span>
  );
}

/** 요약 한 장을 만드는 동안 — 한 번의 호출이라 단계가 나뉘지 않는다. */
export const POSTER_MESSAGES = [
  '아이디어를 읽고 있습니다',
  '핵심만 남기고 추려내는 중입니다',
  '공고가 묻는 것과 맞춰 보고 있습니다',
  '한 장에 들어가도록 압축하는 중입니다',
];

/**
 * 사업계획서를 쓰는 동안.
 *
 * 순서가 실제 진행과 같다 — 공고를 읽고, 자료를 찾고, 절을 쓰고, 검토한다.
 * 절이 여러 개라 한 바퀴 도는 동안 실제로도 그 단계들을 지난다.
 */
export const PLAN_MESSAGES = [
  '공고가 요구하는 목차를 읽고 있습니다',
  '시장 규모 자료를 찾는 중입니다',
  '비슷한 제품과 경쟁사를 살펴보고 있습니다',
  '관련 특허와 기술 동향을 확인하는 중입니다',
  '찾은 근거를 문장으로 옮기고 있습니다',
  '내용을 깊숙하게 분석하는 중입니다',
  '절 사이에 모순이 없는지 맞춰 보고 있습니다',
  '지어낸 수치가 없는지 다시 확인하는 중입니다',
];
