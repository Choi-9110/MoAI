import { Injectable } from '@nestjs/common';
import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from 'docx';
import type { PlanDoc } from '@moai/shared';

/**
 * 사업계획서를 DOCX 로 묶는다.
 *
 * 정부지원사업 양식은 대부분 HWP 다. 그런데 **HWP 를 만들어 내는 길이
 * 사실상 없다** — 공개된 라이브러리가 없고, 한글 문서 규격은 공개돼 있지만
 * 그걸 직접 짜는 것은 이 기능의 값에 비해 너무 크다.
 *
 * 대신 DOCX 로 내려 준다. **한글에서 DOCX 를 바로 연다.** 열어서 양식에
 * 붙여 넣거나 한글 문서로 다시 저장하면 된다. 있는 척하는 HWP 버튼을
 * 만드는 것보다, 되는 것을 제대로 주고 여는 법을 알려 주는 편이 낫다.
 *
 * 화면에 보이는 것과 같은 것을 담는다 — 표지, 목차, 절 본문, 그리고
 * **[확인필요]** 로 남은 질문들. 확인필요를 빼면 사용자가 그것을 못 보고
 * 그대로 제출한다.
 */
@Injectable()
export class PlanDocxService {
  build(title: string, doc: PlanDoc): Promise<Buffer> {
    const children: Paragraph[] = [];

    /* ── 표지 ── */
    children.push(
      new Paragraph({
        text: '사업계획서',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: title, bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: doc.templateName, size: 20, color: '666666' }),
        ],
      }),
      new Paragraph({ text: '' }),
    );

    /* ── 목차 ── */
    children.push(
      new Paragraph({ text: '목차', heading: HeadingLevel.HEADING_1 }),
    );
    doc.sections.forEach((s, i) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${s.title}`, size: 22 })],
        }),
      );
    });
    children.push(new Paragraph({ text: '' }));

    /* ── 본문 ── */
    for (const section of doc.sections) {
      children.push(
        new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
      );

      const body = section.body?.trim();
      if (!body) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '(아직 쓰지 않은 절입니다)', italics: true, color: '999999' }),
            ],
          }),
        );
      } else {
        for (const line of body.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) {
            children.push(new Paragraph({ text: '' }));
            continue;
          }
          // ▶ 로 시작하는 줄은 소제목이다 (작성 규칙에 그렇게 정해 두었다)
          if (trimmed.startsWith('▶')) {
            children.push(
              new Paragraph({
                text: trimmed.replace(/^▶\s*/, ''),
                heading: HeadingLevel.HEADING_2,
              }),
            );
          } else {
            children.push(new Paragraph({ text: trimmed }));
          }
        }
      }

      // 이 절에서 답을 못 찾은 것 — 제출 전에 사람이 채워야 한다
      if (section.openQuestions.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '[확인필요]', bold: true, color: 'B45309' }),
            ],
          }),
        );
        for (const q of section.openQuestions) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `- ${q}`, color: 'B45309' })],
            }),
          );
        }
      }

      children.push(new Paragraph({ text: '' }));
    }

    /* ── 마지막 점검 결과 ── */
    const review = doc.review;
    if (review && review.findings.length > 0) {
      children.push(
        new Paragraph({ text: '마지막 점검', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [
            new TextRun({
              text:
                '다 쓴 뒤 문서 전체를 다시 읽어 찾은 것입니다. ' +
                '“고침”은 그 절을 다시 써서 반영했고, 나머지는 직접 확인해 주세요.',
              size: 20,
              color: '666666',
            }),
          ],
        }),
      );

      for (const f of review.findings) {
        const fixed = review.rewritten.includes(f.sectionId);
        const where = doc.sections.find((s) => s.id === f.sectionId)?.title ?? '';
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: fixed ? '[고침] ' : '[확인] ', bold: true }),
              new TextRun({ text: where ? `${where} — ` : '' }),
              new TextRun({ text: f.issue }),
            ],
          }),
        );
      }
      children.push(new Paragraph({ text: '' }));
    }

    return Packer.toBuffer(new Document({ sections: [{ children }] }));
  }
}
