import { Module } from '@nestjs/common';
import { RateLimitModule } from '../../common/rate-limit.module';
import { SecurityModule } from '../../common/security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [RateLimitModule, SecurityModule],
  controllers: [AuthController],
  providers: [AuthService, RolesGuard],
  exports: [AuthService],
})
export class AuthModule {}
