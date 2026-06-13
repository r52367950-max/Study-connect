export type RankerVersion = 'ranker_v1' | 'ranker_v2';

export type RankerWeights = {
  subject: number;
  grade: number;
  stage: number;
  city: number;
  viewedKind: number;
  popularity: number;
  rating: number;
  ratingFloor: number;
  freshness: number;
  collaborative: number;
};

export type CandidateLimits = {
  profile: number;
  popular: number;
  school: number;
  recent: number;
};

export type RankerConfig = {
  id: RankerVersion;
  weights: RankerWeights;
  candidateLimits: CandidateLimits;
};

export const RANKER_CONFIGS: Record<RankerVersion, RankerConfig> = {
  ranker_v1: {
    id: 'ranker_v1',
    weights: {
      subject: 5,
      grade: 3,
      stage: 2,
      city: 1.5,
      viewedKind: 1,
      popularity: 0.8,
      rating: 2,
      ratingFloor: -2,
      freshness: 0.6,
      collaborative: 1.5,
    },
    candidateLimits: {
      profile: 120,
      popular: 60,
      school: 60,
      recent: 60,
    },
  },
  ranker_v2: {
    id: 'ranker_v2',
    weights: {
      subject: 5,
      grade: 3,
      stage: 2,
      city: 1.5,
      viewedKind: 1,
      popularity: 0.8,
      rating: 2,
      ratingFloor: -2,
      freshness: 0.6,
      collaborative: 1.5,
    },
    candidateLimits: {
      profile: 120,
      popular: 60,
      school: 60,
      recent: 60,
    },
  },
};

export const DEFAULT_RANKER = 'ranker_v1' satisfies RankerVersion;

export function resolveRankerConfig(ranker?: string): RankerConfig {
  if (ranker && ranker in RANKER_CONFIGS) {
    return RANKER_CONFIGS[ranker as RankerVersion];
  }
  return RANKER_CONFIGS[DEFAULT_RANKER];
}
