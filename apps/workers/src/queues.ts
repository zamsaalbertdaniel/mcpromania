// Placeholder for background BullMQ jobs (e.g. nightly cache warmup, analytics aggregation)
export const QUEUES = {
  ANALYTICS: 'analytics',
  CACHE_WARMUP: 'cache-warmup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
