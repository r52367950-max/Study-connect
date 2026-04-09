import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SearchModule } from './modules/search/search.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AuthModule,
    UsersModule,
    MaterialsModule,
    AdminModule,
    ReviewsModule,
    DownloadsModule,
    SearchModule,
  ],
})
export class AppModule {}
