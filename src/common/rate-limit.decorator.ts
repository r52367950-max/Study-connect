import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_RULES_KEY = 'rateLimitRules';

export type RateLimitRule = {
  name: string;
  limit: number;
  windowMs: number;
  keyPrefix?: string;
};

export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_RULES_KEY, rules);
