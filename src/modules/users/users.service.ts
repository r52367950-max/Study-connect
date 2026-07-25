import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { GRADES, STAGES, SUBJECTS, UpdateProfileDto, VIEWED_KINDS } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile.dto';
import { stripControlChars } from '../materials/upload-security.util';

/**
 * Exactly the columns toProfileResponse reads.
 *
 * The previous `include: { school: true }` selected every User column, pulling
 * passwordHash and tokenVersion out of the database on every profile read and
 * write. toProfileResponse never emitted them, but keeping credential material
 * one spread operator away from a response body is an avoidable hazard — and the
 * wide row was read for nothing.
 */
const PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  username: true,
  profileRole: true,
  displayName: true,
  schoolNameFreeText: true,
  city: true,
  stages: true,
  grades: true,
  subjects: true,
  viewedKinds: true,
  collaborativeOptIn: true,
  onboardedAt: true,
  gradesUpdatedAt: true,
  school: { select: { id: true, name: true, city: true } },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
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
    if (dto.displayName !== undefined) data.displayName = dto.displayName ? stripControlChars(dto.displayName) : null;
    if (dto.city !== undefined) data.city = dto.city ? stripControlChars(dto.city) : dto.city;
    if (dto.stages !== undefined) data.stages = dto.stages;
    if (dto.grades !== undefined) {
      data.grades = dto.grades;
      data.gradesUpdatedAt = new Date();
    }
    if (dto.subjects !== undefined) data.subjects = dto.subjects;
    if (dto.viewedKinds !== undefined) data.viewedKinds = dto.viewedKinds;
    if (dto.collaborativeOptIn !== undefined) data.collaborativeOptIn = dto.collaborativeOptIn;

    /**
     * School field precedence in one request: `schoolId` (including explicit null) wins over
     * `schoolNameFreeText`; only when `schoolId` is omitted do we apply `schoolNameFreeText`.
     */
    if (dto.schoolId !== undefined) {
      if (dto.schoolId) {
        const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
        if (!school) {
          throw new UnprocessableEntityException('Unknown school id');
        }
        data.school = { connect: { id: school.id } };
        data.schoolNameFreeText = null;
      } else {
        data.school = { disconnect: true };
      }
    } else if (dto.schoolNameFreeText !== undefined) {
      data.schoolNameFreeText = dto.schoolNameFreeText ? stripControlChars(dto.schoolNameFreeText) : null;
      if (dto.schoolNameFreeText) {
        data.school = { disconnect: true };
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardedAt: true,
        profileRole: true,
        displayName: true,
        city: true,
        schoolId: true,
        stages: true,
        grades: true,
        subjects: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (!existing.onboardedAt && this.isOnboardingComplete(existing, dto)) {
      data.onboardedAt = new Date();
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });

    return toProfileResponse(user);
  }

  private validateEnums(dto: UpdateProfileDto): void {
    const checkAll = (label: string, values: string[] | undefined, allowed: readonly string[]) => {
      if (!values) return;
      const bad = values.filter((v) => !allowed.includes(v));
      if (bad.length > 0) {
        // Per docs/error-code-spec.md, parameter validation failures are 422.
        throw new UnprocessableEntityException(`Invalid ${label}: ${bad.join(', ')}`);
      }
    };
    checkAll('stage', dto.stages, STAGES);
    checkAll('grade', dto.grades, GRADES);
    checkAll('subject', dto.subjects, SUBJECTS);
    checkAll('viewedKind', dto.viewedKinds, VIEWED_KINDS);
  }

  private isOnboardingComplete(
    existing: {
      profileRole: unknown;
      displayName: string | null;
      city: string | null;
      schoolId: string | null;
      stages: string[];
      grades: string[];
      subjects: string[];
    },
    dto: UpdateProfileDto,
  ): boolean {
    const profileRole = dto.profileRole ?? existing.profileRole;
    const displayName = dto.displayName ?? existing.displayName;
    const city = dto.city ?? existing.city;
    const schoolId = dto.schoolId !== undefined ? dto.schoolId : existing.schoolId;
    const stages = dto.stages ?? existing.stages;
    const grades = dto.grades ?? existing.grades;
    const subjects = dto.subjects ?? existing.subjects;
    return Boolean(
      profileRole && displayName && (city || schoolId) &&
        subjects.length > 0 &&
        (stages.length > 0 || grades.length > 0),
    );
  }
}

export function toProfileResponse(user: ProfileRow): ProfileResponseDto {
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
