import { Module } from '@nestjs/common';
import { CsrfService } from '../../common/security/csrf.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, RolesGuard, CsrfService],
  exports: [AuthService, CsrfService],
})
export class AuthModule {}
