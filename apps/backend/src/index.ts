import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma, ensureDefaultConfig, ensureDefaultCharacters } from './db';
import dashboardRoutes from './routes/dashboard';
import configRoutes from './routes/config';
import youtubeRoutes from './routes/youtube';

const app = express();

app.use(cors());
app.use(express.json());

const storageDir = config.storagePath;
for (const sub of ['images', 'audio', 'videos', 'thumbnails', 'temp']) {
  fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
}
app.use('/storage', express.static(storageDir));

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/config', configRoutes);
app.use('/api/youtube', youtubeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await ensureDefaultConfig();
  await ensureDefaultCharacters();

  app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

export default app;
