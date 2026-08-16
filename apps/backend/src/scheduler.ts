import { enqueueJob, JOB_TYPES } from './queues';
import { config } from './config';
import { logger } from './utils/logger';

/** Local dev scheduler — in production free tier, use HTTP cron instead */
export function startScheduler() {
  if (config.freeTier) {
    logger.info('Free tier: use HTTP cron at /api/cron/* instead of node-cron');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cron = require('node-cron') as typeof import('node-cron');
  logger.info('Starting content scheduler (node-cron)...');

  cron.schedule(config.cronDailyPipeline, async () => {
    const date = new Date().toISOString().split('T')[0];
    logger.info(`Triggering daily pipeline for ${date}`);
    await enqueueJob(JOB_TYPES.DAILY_PIPELINE, { date, contentType: 'both' });
  });

  cron.schedule(config.cronAnalytics, async () => {
    logger.info('Triggering analytics collection');
    await enqueueJob(JOB_TYPES.ANALYTICS, {});
  });
}

if (require.main === module) {
  startScheduler();
  process.stdin.resume();
}
