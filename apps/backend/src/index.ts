import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger } from './utils/logger';
import { ensureDefaultConfig, ensureDefaultCharacters } from './db';
import { startInlineWorker } from './queues';
import dashboardRoutes from './routes/dashboard';
import configRoutes from './routes/config';
import youtubeRoutes from './routes/youtube';
import cronRoutes from './routes/cron';

const app = express();

app.use(cors({
  origin: config.corsOrigin || true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

const storageDir = config.storagePath;
for (const sub of ['images', 'audio', 'videos', 'thumbnails', 'temp']) {
  fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
}
app.use('/storage', express.static(storageDir));

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/config', configRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/cron', cronRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    freeTier: config.freeTier,
    inlineWorker: config.inlineWorker,
    timestamp: new Date().toISOString(),
  });
});

// Serve React dashboard from same service (free tier — one Render service)
if (config.serveFrontend) {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/storage')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    logger.info(`Serving frontend from ${frontendDist}`);
  } else {
    logger.warn('Frontend dist not found — run npm run build -w @kids-youtube/frontend');
  }
}

async function start() {
  await ensureDefaultConfig();
  await ensureDefaultCharacters();
  startInlineWorker();

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} (freeTier=${config.freeTier})`);
    if (config.freeTier) {
      logger.info('Free tier mode: use /api/cron/keep-alive with CRON_SECRET to prevent sleep');
    }
  });
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

export default app;
