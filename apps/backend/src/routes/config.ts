import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { clearProviderCache } from '../services/ai/factory';
import { getSystemStatus } from '../services/system-status';
import { logger } from '../utils/logger';

const router = Router();

router.get('/system-status', async (_req: Request, res: Response) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (error) {
    logger.error('System status error', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await prisma.channelConfig.findFirst();
    if (!config) return res.status(404).json({ error: 'Configuration not found' });

    const { youtubeTokens, ...safeConfig } = config;
    res.json({
      ...safeConfig,
      youtubeConnected: !!youtubeTokens,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const config = await prisma.channelConfig.findFirst();
    if (!config) return res.status(404).json({ error: 'Configuration not found' });

    const allowedFields = [
      'channelName', 'targetAge', 'contentCategories', 'longVideoTime',
      'shortVideoTime', 'videoDurationMin', 'videoDurationMax',
      'visualStyle', 'voiceStyle', 'language', 'automationMode',
      'llmProvider', 'imageProvider', 'videoProvider', 'ttsProvider',
      'musicProvider', 'timezone',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const updated = await prisma.channelConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    clearProviderCache();
    logger.info('Channel configuration updated');

    const { youtubeTokens, ...safeConfig } = updated;
    res.json({ ...safeConfig, youtubeConnected: !!youtubeTokens });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;
