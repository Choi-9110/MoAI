import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly startedAt = Date.now();

  health() {
    return {
      ok: true,
      service: 'moai-api',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
