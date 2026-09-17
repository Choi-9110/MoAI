import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import type { PlanDoc } from '@moai/shared';

/**
 * 사업계획서를 PDF 로 만든다.
 *
 * **PC 에 이미 깔린 크롬을 빌려 쓴다.** puppeteer 를 통째로 설치하면 크로미움
 * 150MB 를 따로 받는데, 이 PC 에는 크롬이 이미 있다. `puppeteer-core` 는
 * 브라우저를 안 들고 오는 판이라 경로만 알려 주면 된다.
 *
 * 화면을 열어 찍지 않고 **HTML 을 직접 지어 넣는다.** 화면을 찍으려면 그
 * 브라우저가 로그인부터 해야 하는데, 서버가 남의 계정으로 로그인하는 구조를
 * 만들 수는 없다. 어차피 담을 것은 문서 내용뿐이라 여기서 만드는 편이 간단하고
 * 결과도 일정하다.
 *
 * 한글은 시스템 글꼴(맑은 고딕)을 쓴다. 글꼴 파일을 심지 않아도 되는 것은
 * 크롬이 로컬에서 돌기 때문이다 — **나중에 리눅스 서버로 옮기면 그 서버에
 * 크롬과 한글 글꼴을 함께 깔아야 한다.**
 */
@Injectable()
export class PlanPdfService {
  private readonly logger = new Logger(PlanPdfService.name);

  /** 크롬을 찾는다. 못 찾으면 PDF 는 포기하고 그 사실을 알린다. */
  private findBrowser(): string {
    const fromEnv = process.env.CHROME_PATH;
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];

    const found = candidates.find((p) => existsSync(p));
    if (!found) {
      throw new ServiceUnavailableException(
        'PDF 를 만들 브라우저를 찾지 못했습니다. 크롬을 설치하거나 CHROME_PATH 를 지정해 주세요.',
      );
    }
    return found;
  }

  async build(title: string, doc: PlanDoc): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: this.findBrowser(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(this.html(title, doc), { waitUntil: 'load' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        // 쪽 번호 — 인쇄해서 넘길 문서라 없으면 순서가 섞인다
        footerTemplate:
          '<div style="width:100%;font-size:9px;color:#888;text-align:center;">' +
          '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });

      this.logger.log(`PDF 생성 — ${title} (${pdf.length} bytes)`);
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** HTML 에 넣기 전에 태그로 읽힐 만한 글자를 막는다 */
  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private html(title: string, doc: PlanDoc): string {
    const toc = doc.sections
      .map((s, i) => `<li><span>${i + 1}</span> ${this.esc(s.title)}</li>`)
      .join('');

    const body = doc.sections
      .map((s) => {
        const lines = (s.body ?? '')
          .split('\n')
          .map((raw) => {
            const line = raw.trim();
            if (!line) return '';
            // ▶ 로 시작하는 줄은 소제목이다 (작성 규칙에 그렇게 정해 두었다)
            if (line.startsWith('▶')) {
              return `<h3>${this.esc(line.replace(/^▶\s*/, ''))}</h3>`;
            }
            return `<p>${this.esc(line)}</p>`;
          })
          .join('');

        const asks =
          s.openQuestions.length > 0
            ? `<div class="ask"><b>[확인필요]</b><ul>${s.openQuestions
                .map((q) => `<li>${this.esc(q)}</li>`)
                .join('')}</ul></div>`
            : '';

        return `<section><h2>${this.esc(s.title)}</h2>${
          lines || '<p class="empty">(아직 쓰지 않은 절입니다)</p>'
        }${asks}</section>`;
      })
      .join('');

    const review =
      doc.review && doc.review.findings.length > 0
        ? `<section><h2>마지막 점검</h2>
             <p class="muted">다 쓴 뒤 문서 전체를 다시 읽어 찾은 것입니다.
             ‘고침’은 그 절을 다시 써서 반영했고, 나머지는 직접 확인해 주세요.</p>
             <ul class="findings">${doc.review.findings
               .map((f) => {
                 const fixed = doc.review!.rewritten.includes(f.sectionId);
                 const where =
                   doc.sections.find((s) => s.id === f.sectionId)?.title ?? '';
                 return `<li><b>${fixed ? '고침' : '확인'}</b> ${
                   where ? `${this.esc(where)} — ` : ''
                 }${this.esc(f.issue)}</li>`;
               })
               .join('')}</ul>
           </section>`
        : '';

    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
  /* 시스템에 있는 한글 글꼴을 쓴다. 없으면 브라우저 기본으로 떨어진다. */
  * { box-sizing: border-box; }
  body {
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    color: #1e3932; line-height: 1.65; font-size: 11pt; margin: 0;
  }
  .cover { text-align: center; padding: 40mm 0 24mm; }
  .cover .kind { font-size: 9pt; color: #888; letter-spacing: 2px; }
  .cover h1 { font-size: 20pt; margin: 8mm 0 4mm; }
  .cover .tpl { font-size: 10pt; color: #777; }

  h2 {
    font-size: 13pt; margin: 0 0 4mm; padding-bottom: 2mm;
    border-bottom: 1.5pt solid #00704a; color: #00704a;
  }
  h3 { font-size: 11pt; margin: 5mm 0 2mm; color: #1e3932; }
  p { margin: 0 0 2mm; }
  .empty, .muted { color: #999; }

  /* 절이 페이지 경계에서 반토막 나면 읽기 나쁘다 */
  section { margin-bottom: 8mm; break-inside: avoid-page; }

  ol.toc { list-style: none; padding: 0; }
  ol.toc li { padding: 1.5mm 0; border-bottom: 0.5pt dotted #ddd; }
  ol.toc li span { display: inline-block; width: 8mm; color: #00704a; font-weight: bold; }

  .ask {
    margin-top: 3mm; padding: 3mm 4mm;
    background: #fffbeb; border-left: 2pt solid #b45309; color: #b45309;
    font-size: 10pt; break-inside: avoid;
  }
  .ask ul { margin: 1mm 0 0; padding-left: 5mm; }
  .findings { padding-left: 5mm; font-size: 10pt; }
  .findings li { margin-bottom: 1.5mm; }
</style></head>
<body>
  <div class="cover">
    <div class="kind">사업계획서</div>
    <h1>${this.esc(title)}</h1>
    <div class="tpl">${this.esc(doc.templateName)}</div>
  </div>

  <section>
    <h2>목차</h2>
    <ol class="toc">${toc}</ol>
  </section>

  ${body}
  ${review}
</body></html>`;
  }
}
