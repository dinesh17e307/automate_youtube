import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { config } from '../config';
import { youtubeService } from '../services/youtube/youtube-service';

const router = Router();

router.get('/auth', (_req: Request, res: Response) => {
  if (!youtubeService.isConfigured()) {
    return res.status(400).json({
      error: 'YouTube API not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.',
    });
  }
  const url = youtubeService.getAuthUrl();
  res.json({ authUrl: url });
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code required' });
    }
    await youtubeService.handleCallback(code);
    res.redirect('/?youtube=connected');
  } catch (error) {
    res.status(500).json({ error: 'YouTube authentication failed' });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  const isAuthenticated = await youtubeService.isAuthenticated();
  res.json({
    configured: youtubeService.isConfigured(),
    authenticated: isAuthenticated,
    redirectUri: config.youtubeRedirectUri,
    setupHint: 'Add redirectUri to Google Cloud Console → APIs & Services → Credentials → OAuth client → Authorized redirect URIs',
  });
});

router.get('/characters', async (_req: Request, res: Response) => {
  const characters = await prisma.character.findMany({ orderBy: { name: 'asc' } });
  res.json(characters);
});

router.post('/characters', async (req: Request, res: Response) => {
  try {
    const character = await prisma.character.create({ data: req.body });
    res.status(201).json(character);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create character' });
  }
});

router.put('/characters/:id', async (req: Request, res: Response) => {
  try {
    const character = await prisma.character.update({
      where: { id: req.params.id as string },
      data: req.body,
    });
    res.json(character);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update character' });
  }
});

export default router;
