import { Module } from '@nestjs/common';
import { RateLimitModule } from '../../common/rate-limit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService, RolesGuard, CsrfService],
  exports: [AuthService, CsrfService],
})
export class AuthModule {}
