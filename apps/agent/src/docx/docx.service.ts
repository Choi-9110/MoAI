import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SECTION_TITLES } from '@moai/shared';
import type { PlanJob, SectionKey } from '@moai/shared';

export interface BuiltArtifact {
  path: string;
  bytes: number;
}

/**
 * 생성된 섹션들을 DOCX 로 묶는다.
 *
 * 정부지원사업 양식은 대부분 HWP 이지만, 초기 버전은 DOCX 로 제공하고
 * 사용자가 한글에서 열어 양식에 붙여넣는 방식으로 운용한다.
 */
@Injectable()
export class DocxService {
  private readonly logger = new Logger(DocxService.name);

  constructor(private readonly config: ConfigService) {}

  private get workspaceDir(): string {
    return this.config.get<string>('WORKSPACE_DIR', join(process.cwd(), 'workspace'));
  }

  private jobDir(jobId: string): string {
    return join(this.workspaceDir, jobId);
  }

  async build(
    job: PlanJob,
    sections: { section: SectionKey; content: string }[],
  ): Promise<BuiltArtifact> {
    const dir = this.jobDir(job.jobId);
    await mkdir(dir, { recursive: true });

    const children: Paragraph[] = [
      new Paragraph({
        text: '사업계획서',
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `양식: ${job.templateKind}`, size: 20, color: '666666' }),
        ],
      }),
      new Paragraph({ text: '' }),
    ];

    for (const { section, content } of sections) {
      children.push(
        new Paragraph({
          text: SECTION_TITLES[section] ?? section,
          heading: HeadingLevel.HEADING_1,
        }),
      );

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
          children.push(new Paragraph({ text: '' }));
          continue;
        }
        // ▶ 로 시작하는 줄은 소제목으로 처리한다.
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

      children.push(new Paragraph({ text: '' }));
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    const fileName = `사업계획서_${job.jobId.slice(0, 8)}.docx`;
    const filePath = join(dir, fileName);
    await writeFile(filePath, buffer);

    const { size } = await stat(filePath);
    this.logger.log(`DOCX 생성 — ${fileName} (${size} bytes)`);

    return { path: filePath, bytes: size };
  }

  /**
   * 작업 디렉터리 삭제.
   *
   * 고객의 사업 아이디어가 로컬 PC 에 잔존하지 않도록
   * 잡이 끝나면 반드시 호출한다.
   */
  async cleanup(jobId: string): Promise<void> {
    const keep = this.config.get<string>('KEEP_WORKSPACE', 'false') === 'true';
    if (keep) {
      this.logger.warn(`KEEP_WORKSPACE=true — ${jobId} 작업물을 남겨둡니다.`);
      return;
    }
    try {
      await rm(this.jobDir(jobId), { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`작업 디렉터리 정리 실패 ${jobId}: ${(err as Error).message}`);
    }
  }
}
