import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, MinioService],
  exports: [PrismaService, MinioService],
})
export class PrismaModule {}
