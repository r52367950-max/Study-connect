import { Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RateLimitModule } from './common/rate-limit.module';
import { CsrfGuard } from './common/security/csrf.guard';
import { SecurityModule } from './common/security/security.module';
import { PrismaModule } from './infra';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SearchModule } from './modules/search/search.module';
import { UsersModule } from './modules/users/users.module';

export const APP_GUARD_CHAIN = [RateLimitGuard, CsrfGuard, JwtAuthGuard, RolesGuard] as const;

const appGuardProviders: Provider[] = APP_GUARD_CHAIN.map((guardClass: Type<unknown>) => ({
  provide: APP_GUARD,
  useClass: guardClass,
}));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RateLimitModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    MaterialsModule,
    AdminModule,
    ReviewsModule,
    DownloadsModule,
    SearchModule,
  ],
  providers: appGuardProviders,
})
export class AppModule {}
