import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /** Runs a trivial query so we know Postgres accepts connections. */
  async checkDatabase(): Promise<{ ok: boolean }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
