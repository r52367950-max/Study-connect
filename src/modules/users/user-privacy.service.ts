import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra';

@Injectable()
export class UserPrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Account erasure is implemented as anonymization so approved public uploads,
   * denormalized material counters and aggregate rating scores remain useful
   * platform content. Direct PII and behavioral rows are removed.
   */
  async anonymizeAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const anonymizedUsername = `deleted_${userId.replace(/-/g, '').slice(0, 24)}`;

    await this.prisma.$transaction([
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.download.deleteMany({ where: { userId } }),
      this.prisma.viewEvent.deleteMany({ where: { userId } }),
      this.prisma.rating.updateMany({ where: { userId }, data: { comment: null } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: null,
          phone: null,
          username: anonymizedUsername,
          passwordHash: `anonymized:${userId}`,
          status: 'DELETED' as never,
          tokenVersion: { increment: 1 },
          avatarUrl: null,
          profileRole: null,
          displayName: null,
          school: { disconnect: true },
          schoolNameFreeText: null,
          city: null,
          stages: [],
          grades: [],
          subjects: [],
          viewedKinds: [],
          collaborativeOptIn: false,
          onboardedAt: null,
          gradesUpdatedAt: null,
        },
      }),
    ]);

    return {
      anonymized: true,
      retainedAsPublicContent: ['approved public uploaded materials', 'rating scores in aggregate counters'],
      clearedPiiFields: ['email', 'phone', 'username', 'passwordHash', 'avatarUrl', 'displayName', 'schoolId', 'schoolNameFreeText', 'city', 'profileRole', 'stages', 'grades', 'subjects', 'viewedKinds'],
      deletedBehaviorData: ['favorites', 'downloads', 'viewEvents'],
      historicalCollaborativeContribution: 'removed from future calculations because collaborativeOptIn=false and favorites/viewEvents/downloads are deleted; no extra backfill is required for current real-time ranker signals',
    };
  }
}
