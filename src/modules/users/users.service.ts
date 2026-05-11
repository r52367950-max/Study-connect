import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { GRADES, STAGES, SUBJECTS, UpdateProfileDto, VIEWED_KINDS } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { school: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toProfileResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    this.validateEnums(dto);

    const data: Prisma.UserUpdateInput = {};
    if (dto.profileRole !== undefined) data.profileRole = dto.profileRole;
    if (dto.displayName !== undefined) data.displayName = dto.displayName ?? null;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.stages !== undefined) data.stages = dto.stages;
    if (dto.grades !== undefined) {
      data.grades = dto.grades;
      data.gradesUpdatedAt = new Date();
    }
    if (dto.subjects !== undefined) data.subjects = dto.subjects;
    if (dto.viewedKinds !== undefined) data.viewedKinds = dto.viewedKinds;
    if (dto.collaborativeOptIn !== undefined) data.collaborativeOptIn = dto.collaborativeOptIn;

    if (dto.schoolId !== undefined) {
      if (dto.schoolId) {
        const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
        if (!school) {
          throw new BadRequestException('Unknown school id');
        }
        data.school = { connect: { id: school.id } };
        data.schoolNameFreeText = null;
      } else {
        data.school = { disconnect: true };
      }
    }
    if (dto.schoolNameFreeText !== undefined) {
      data.schoolNameFreeText = dto.schoolNameFreeText ?? null;
      if (dto.schoolNameFreeText) {
        data.school = { disconnect: true };
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardedAt: true },
    });
    if (existing && !existing.onboardedAt && this.isOnboardingComplete(dto)) {
      data.onboardedAt = new Date();
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { school: true },
    });

    return toProfileResponse(user);
  }

  private validateEnums(dto: UpdateProfileDto): void {
    const checkAll = (label: string, values: string[] | undefined, allowed: readonly string[]) => {
      if (!values) return;
      const bad = values.filter((v) => !allowed.includes(v));
      if (bad.length > 0) {
        throw new BadRequestException(`Invalid ${label}: ${bad.join(', ')}`);
      }
    };
    checkAll('stage', dto.stages, STAGES);
    checkAll('grade', dto.grades, GRADES);
    checkAll('subject', dto.subjects, SUBJECTS);
    checkAll('viewedKind', dto.viewedKinds, VIEWED_KINDS);
  }

  private isOnboardingComplete(dto: UpdateProfileDto): boolean {
    return Boolean(
      dto.profileRole && dto.displayName && (dto.city || dto.schoolId) &&
        dto.subjects && dto.subjects.length > 0 &&
        ((dto.stages && dto.stages.length > 0) || (dto.grades && dto.grades.length > 0)),
    );
  }
}

type UserWithSchool = Prisma.UserGetPayload<{ include: { school: true } }>;

export function toProfileResponse(user: UserWithSchool): ProfileResponseDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    username: user.username,
    profileRole: user.profileRole,
    displayName: user.displayName,
    school: user.school ? { id: user.school.id, name: user.school.name, city: user.school.city } : null,
    schoolNameFreeText: user.schoolNameFreeText,
    city: user.city,
    stages: user.stages,
    grades: user.grades,
    subjects: user.subjects,
    viewedKinds: user.viewedKinds,
    collaborativeOptIn: user.collaborativeOptIn,
    onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    gradesUpdatedAt: user.gradesUpdatedAt ? user.gradesUpdatedAt.toISOString() : null,
  };
}
