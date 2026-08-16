import cron from 'node-cron';
import { dailyPipelineQueue, analyticsQueue } from './queues';
import { config } from './config';
import { logger } from './utils/logger';

export function startScheduler() {
  logger.info('Starting content scheduler...');

  cron.schedule(config.cronDailyPipeline, async () => {
    const date = new Date().toISOString().split('T')[0];
    logger.info(`Triggering daily pipeline for ${date}`);

    await dailyPipelineQueue.add('daily-pipeline', {
      date,
      contentType: 'both',
    }, {
      jobId: `daily-${date}`,
    });
  });

  cron.schedule(config.cronAnalytics, async () => {
    logger.info('Triggering analytics collection');
    await analyticsQueue.add('analytics-collect', {}, {
      jobId: `analytics-${Date.now()}`,
    });
  });

  logger.info(`Scheduler active — pipeline: "${config.cronDailyPipeline}", analytics: "${config.cronAnalytics}"`);
}

if (require.main === module) {
  startScheduler();
  process.stdin.resume();
}
