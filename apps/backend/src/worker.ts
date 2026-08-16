import {
  createWorker,
  QUEUE_NAMES,
  type DailyPipelineJob,
  type ContentGenerationJob,
  type VideoRenderingJob,
  type YouTubeUploadJob,
} from './queues';
import {
  handleDailyPipeline,
  handleContentGeneration,
  handleVideoRendering,
  handleYouTubeUpload,
  handleAnalytics,
} from './services/pipeline/pipeline-service';
import { logger } from './utils/logger';
import type { Job } from 'bullmq';

export function startWorkers() {
  logger.info('Starting background workers...');

  createWorker<DailyPipelineJob>(QUEUE_NAMES.DAILY_PIPELINE, async (job: Job<DailyPipelineJob>) => {
    await handleDailyPipeline(job.data);
  });

  createWorker<ContentGenerationJob>(QUEUE_NAMES.CONTENT_GENERATION, async (job: Job<ContentGenerationJob>) => {
    await handleContentGeneration(job.data);
  }, 2);

  createWorker<VideoRenderingJob>(QUEUE_NAMES.VIDEO_RENDERING, async (job: Job<VideoRenderingJob>) => {
    await handleVideoRendering(job.data);
  });

  createWorker<YouTubeUploadJob>(QUEUE_NAMES.YOUTUBE_UPLOAD, async (job: Job<YouTubeUploadJob>) => {
    await handleYouTubeUpload(job.data);
  });

  createWorker(QUEUE_NAMES.ANALYTICS, async () => {
    await handleAnalytics();
  });

  logger.info('All workers started');
}

if (require.main === module) {
  startWorkers();
}
