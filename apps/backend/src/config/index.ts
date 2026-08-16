import dotenv from 'dotenv';
import path from 'path';

// Load .env in development; production uses platform env vars (Render, etc.)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : undefined;

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kids_youtube',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  storagePath: process.env.STORAGE_PATH || path.resolve(__dirname, '../../../storage'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
  youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/youtube/callback',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigin,
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  cronDailyPipeline: process.env.CRON_DAILY_PIPELINE || '0 0 * * *',
  cronAnalytics: process.env.CRON_ANALYTICS || '0 */6 * * *',
  startScheduler: process.env.START_SCHEDULER === 'true',
};
