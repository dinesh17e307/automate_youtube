import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { pipelineService } from '../services/pipeline/pipeline-service';
import { enqueueJob, getQueueStats, JOB_TYPES } from '../queues';
import { logger } from '../utils/logger';

const router = Router();

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [longVideo, short, recentContent, queueStats] = await Promise.all([
      prisma.content.findFirst({
        where: { type: 'long', createdAt: { gte: today } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.content.findFirst({
        where: { type: 'short', createdAt: { gte: today } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.content.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { analytics: true },
      }),
      getQueueStats(),
    ]);

    const totalVideos = await prisma.content.count({ where: { type: 'long' } });
    const totalShorts = await prisma.content.count({ where: { type: 'short' } });
    const failedJobs = await prisma.jobLog.count({ where: { status: 'failed' } });
    const pendingApproval = await prisma.content.count({ where: { status: 'awaiting_approval' } });

    const analyticsAgg = await prisma.analytics.aggregate({
      _sum: { views: true },
    });

    res.json({
      today: { longVideo, short },
      recentContent,
      stats: {
        totalVideos,
        totalShorts,
        publishedToday: [longVideo, short].filter((c) => c?.status === 'published' || c?.status === 'scheduled').length,
        failedJobs,
        pendingApproval,
        totalViews: analyticsAgg._sum.views || 0,
      },
      queueStats,
    });
  } catch (error) {
    logger.error('Dashboard status error', error);
    res.status(500).json({ error: 'Failed to fetch dashboard status' });
  }
});

router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.floor(days / 2));

    const contents = await prisma.content.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: 'asc' },
    });

    const calendar = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayContents = contents.filter(
        (c: { createdAt: Date }) => c.createdAt.toISOString().split('T')[0] === dateStr
      );

      calendar.push({
        date: dateStr,
        dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        longVideo: dayContents.find((c: { type: string }) => c.type === 'long'),
        short: dayContents.find((c: { type: string }) => c.type === 'short'),
      });
    }

    res.json(calendar);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

router.get('/content', async (req: Request, res: Response) => {
  try {
    const { status, type, limit = '20', offset = '0' } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: { analytics: true, characters: { include: { character: true } } },
      }),
      prisma.content.count({ where }),
    ]);

    res.json({ contents, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.get('/content/:id', async (req: Request, res: Response) => {
  try {
    const content = await prisma.content.findUnique({
      where: { id: req.params.id as string },
      include: {
        analytics: true,
        characters: { include: { character: true } },
        jobLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!content) return res.status(404).json({ error: 'Content not found' });
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.post('/content/generate', async (req: Request, res: Response) => {
  try {
    const { type = 'long' } = req.body;
    const content = await pipelineService.createContent(type);
    await enqueueJob(JOB_TYPES.CONTENT_GENERATION, { contentId: content.id, stage: 'start' });
    res.json({ message: 'Content generation started', content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start content generation' });
  }
});

router.post('/content/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await pipelineService.approveContent(id);
    res.json({ message: 'Content approved and uploaded' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve content' });
  }
});

router.post('/content/:id/regenerate/:stage', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const stage = req.params.stage as string;
    await pipelineService.regenerateStage(id, stage);
    res.json({ message: `Stage ${stage} regenerated` });
  } catch (error) {
    res.status(500).json({ error: `Failed to regenerate ${req.params.stage}` });
  }
});

router.post('/content/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) return res.status(404).json({ error: 'Content not found' });

    await prisma.content.update({
      where: { id },
      data: { status: 'generating', errorMessage: null, currentStage: 'rendering' },
    });

    await enqueueJob(JOB_TYPES.CONTENT_GENERATION, { contentId: id, stage: 'rendering' });
    res.json({ message: 'Retry queued' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retry content' });
  }
});

router.post('/content/:id/sync-publish', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) return res.status(404).json({ error: 'Content not found' });

    if (content.status === 'scheduled' && content.scheduledAt && content.scheduledAt <= new Date()) {
      await prisma.content.update({
        where: { id },
        data: { status: 'published', currentStage: 'published', publishDate: new Date() },
      });
      return res.json({ message: 'Marked as published', status: 'published' });
    }

    if (content.status === 'scheduled') {
      return res.json({
        message: 'Still scheduled on YouTube',
        status: 'scheduled',
        scheduledAt: content.scheduledAt,
      });
    }

    res.json({ message: 'No sync needed', status: content.status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync publish status' });
  }
});

router.post('/pipeline/trigger', async (_req: Request, res: Response) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    await enqueueJob(JOB_TYPES.DAILY_PIPELINE, { date, contentType: 'both' });
    res.json({ message: 'Daily pipeline triggered', date });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger pipeline' });
  }
});

export default router;
