import { Module } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaModule, PrismaService } from '../../infra';
import { HealthController } from './health.controller';

class PrismaHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}
  async pingCheck(key: string) {
    await this.prisma.$queryRaw`SELECT 1`;
    return { [key]: { status: 'up' } };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthCheckService, PrismaHealthIndicator],
})
export class HealthModule {}
export { PrismaHealthIndicator };
