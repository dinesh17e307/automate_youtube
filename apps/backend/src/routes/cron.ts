import { Router, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { enqueueJob, processPendingJobs, JOB_TYPES } from '../queues';

const router = Router();

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!config.cronSecret) {
    logger.warn('CRON_SECRET not set — cron endpoints disabled');
    res.status(503).json({ error: 'Cron not configured. Set CRON_SECRET env var.' });
    return false;
  }
  if (secret !== config.cronSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Wake service + process pending jobs (ping every 10 min from cron-job.org) */
router.get('/keep-alive', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  const processed = await processPendingJobs();
  res.json({ status: 'ok', processed, timestamp: new Date().toISOString() });
});

/** Trigger daily content generation */
router.post('/daily-pipeline', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  const date = new Date().toISOString().split('T')[0];
  await enqueueJob(JOB_TYPES.DAILY_PIPELINE, { date, contentType: 'both' });
  res.json({ message: 'Daily pipeline queued', date });
});

/** Process all pending jobs */
router.post('/process-jobs', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  const processed = await processPendingJobs();
  res.json({ message: 'Jobs processed', processed });
});

/** Collect YouTube analytics */
router.post('/analytics', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  await enqueueJob(JOB_TYPES.ANALYTICS, {});
  res.json({ message: 'Analytics job queued' });
});

export default router;
