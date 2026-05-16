import { Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
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
import { FavoritesModule } from './modules/favorites/favorites.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { SearchModule } from './modules/search/search.module';
import { UsersModule } from './modules/users/users.module';
import { ViewEventsModule } from './modules/view-events/view-events.module';
import { HealthModule } from './modules/health/health.module';

export const APP_GUARD_CHAIN = [RateLimitGuard, CsrfGuard, JwtAuthGuard, RolesGuard] as const;

const appGuardProviders: Provider[] = APP_GUARD_CHAIN.map((guardClass: Type<unknown>) => ({
  provide: APP_GUARD,
  useClass: guardClass,
}));

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password', '*.passwordHash', '*.codeHash',
            '*.token', '*.accessToken', '*.refreshToken',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: true,
        genReqId: (req: any) => req.headers['x-request-id'] ?? require('crypto').randomUUID(),
        customProps: (req: any) => ({ reqId: req.id }),
      },
    }),
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
    FavoritesModule,
    SchoolsModule,
    ViewEventsModule,
    AdminModule,
    ReviewsModule,
    DownloadsModule,
    SearchModule,
    HealthModule,
  ],
  providers: appGuardProviders,
})
export class AppModule {}
