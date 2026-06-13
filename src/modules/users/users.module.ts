import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserDataExportService } from './user-data-export.service';
import { UserPrivacyService } from './user-privacy.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserDataExportService, UserPrivacyService],
  exports: [UsersService],
})
export class UsersModule {}
