import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  DAILY_PIPELINE: 'daily-pipeline',
  CONTENT_GENERATION: 'content-generation',
  VIDEO_RENDERING: 'video-rendering',
  YOUTUBE_UPLOAD: 'youtube-upload',
  ANALYTICS: 'analytics',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface DailyPipelineJob {
  date: string;
  contentType?: 'long' | 'short' | 'both';
}

export interface ContentGenerationJob {
  contentId: string;
  stage: string;
}

export interface VideoRenderingJob {
  contentId: string;
}

export interface YouTubeUploadJob {
  contentId: string;
}

export interface AnalyticsJob {
  contentId?: string;
}

function createQueue(name: string) {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: config.maxRetries,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}

export const dailyPipelineQueue = createQueue(QUEUE_NAMES.DAILY_PIPELINE);
export const contentGenerationQueue = createQueue(QUEUE_NAMES.CONTENT_GENERATION);
export const videoRenderingQueue = createQueue(QUEUE_NAMES.VIDEO_RENDERING);
export const youtubeUploadQueue = createQueue(QUEUE_NAMES.YOUTUBE_UPLOAD);
export const analyticsQueue = createQueue(QUEUE_NAMES.ANALYTICS);

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 1
) {
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency,
  });

  worker.on('completed', (job) => {
    logger.info(`Job completed: ${queueName}/${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${queueName}/${job?.id}`, { error: err.message });
  });

  return worker;
}

export async function getQueueStats() {
  const queues = [
    dailyPipelineQueue,
    contentGenerationQueue,
    videoRenderingQueue,
    youtubeUploadQueue,
    analyticsQueue,
  ];

  const stats = await Promise.all(
    queues.map(async (q) => ({
      name: q.name,
      waiting: await q.getWaitingCount(),
      active: await q.getActiveCount(),
      completed: await q.getCompletedCount(),
      failed: await q.getFailedCount(),
    }))
  );

  return stats;
}
