import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  handleDailyPipeline,
  handleContentGeneration,
  handleAnalytics,
} from '../services/pipeline/pipeline-service';

export const JOB_TYPES = {
  DAILY_PIPELINE: 'daily-pipeline',
  CONTENT_GENERATION: 'content-generation',
  ANALYTICS: 'analytics',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export interface DailyPipelineJob {
  date: string;
  contentType?: 'long' | 'short' | 'both';
}

export interface ContentGenerationJob {
  contentId: string;
  stage: string;
}

let isProcessing = false;

export async function enqueueJob(type: JobType, payload: object, options?: { jobId?: string }) {
  if (options?.jobId) {
    const existing = await prisma.pipelineJob.findFirst({
      where: { type, status: { in: ['pending', 'processing'] } },
    });
    if (existing && type === JOB_TYPES.DAILY_PIPELINE) {
      logger.info(`Daily pipeline job already queued: ${existing.id}`);
      return existing;
    }
  }

  const job = await prisma.pipelineJob.create({
    data: { type, payload: payload as Prisma.InputJsonValue, status: 'pending' },
  });

  logger.info(`Job enqueued: ${type} (${job.id})`);

  if (config.inlineWorker) {
    setImmediate(() => processPendingJobs().catch((err) => logger.error('Inline job processing failed', err)));
  }

  return job;
}

export async function getQueueStats() {
  const [pending, processing, completed, failed] = await Promise.all([
    prisma.pipelineJob.count({ where: { status: 'pending' } }),
    prisma.pipelineJob.count({ where: { status: 'processing' } }),
    prisma.pipelineJob.count({ where: { status: 'completed' } }),
    prisma.pipelineJob.count({ where: { status: 'failed' } }),
  ]);

  return [
    { name: 'pipeline-jobs', waiting: pending, active: processing, completed, failed },
  ];
}

async function executeJob(type: string, payload: unknown) {
  switch (type) {
    case JOB_TYPES.DAILY_PIPELINE:
      await handleDailyPipeline(payload as DailyPipelineJob);
      break;
    case JOB_TYPES.CONTENT_GENERATION:
      await handleContentGeneration(payload as ContentGenerationJob);
      break;
    case JOB_TYPES.ANALYTICS:
      await handleAnalytics();
      break;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

export async function processPendingJobs(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  let processed = 0;

  try {
    await resetStuckJobs();

    while (true) {
      const job = await prisma.pipelineJob.findFirst({
        where: { status: 'pending', scheduledAt: { lte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
      });

      if (!job) break;

      await prisma.pipelineJob.update({
        where: { id: job.id },
        data: { status: 'processing', startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        await executeJob(job.type, job.payload);
        await prisma.pipelineJob.update({
          where: { id: job.id },
          data: { status: 'completed', completedAt: new Date(), error: null },
        });
        processed++;
        logger.info(`Job completed: ${job.type} (${job.id})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const failed = job.attempts + 1 >= job.maxAttempts;

        await prisma.pipelineJob.update({
          where: { id: job.id },
          data: {
            status: failed ? 'failed' : 'pending',
            error: message,
            scheduledAt: failed ? job.scheduledAt : new Date(Date.now() + job.attempts * 5000),
          },
        });

        logger.error(`Job ${failed ? 'failed' : 'retry'}: ${job.type} (${job.id})`, { error: message });
        if (failed) processed++;
      }
    }
  } finally {
    isProcessing = false;
  }

  return processed;
}

async function resetStuckJobs() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  await prisma.pipelineJob.updateMany({
    where: { status: 'processing', startedAt: { lt: tenMinAgo } },
    data: { status: 'pending' },
  });

  // Mark content stuck at rendering as failed so UI doesn't hang forever
  const stuckContent = await prisma.content.findMany({
    where: {
      status: 'generating',
      currentStage: 'rendering',
      updatedAt: { lt: tenMinAgo },
      videoUrl: null,
    },
  });

  for (const content of stuckContent) {
    await prisma.content.update({
      where: { id: content.id },
      data: {
        status: 'failed',
        errorMessage: 'Rendering timed out — retry from the content page. On free tier, keep videos under 90 seconds.',
      },
    });
    logger.warn(`Marked stuck content as failed: ${content.id}`);
  }
}

export function startInlineWorker() {
  if (!config.inlineWorker) return;

  logger.info(`Inline job worker started (poll every ${config.jobPollIntervalMs}ms)`);

  setInterval(() => {
    processPendingJobs().catch((err) => logger.error('Job poll failed', err));
  }, config.jobPollIntervalMs);
}

// Legacy exports for compatibility
export const dailyPipelineQueue = {
  add: (_name: string, data: DailyPipelineJob, opts?: { jobId?: string }) =>
    enqueueJob(JOB_TYPES.DAILY_PIPELINE, data, opts),
};
export const contentGenerationQueue = {
  add: (_name: string, data: ContentGenerationJob) =>
    enqueueJob(JOB_TYPES.CONTENT_GENERATION, data),
};
export const analyticsQueue = {
  add: (_name: string, _data?: Record<string, unknown>) =>
    enqueueJob(JOB_TYPES.ANALYTICS, {}),
};
