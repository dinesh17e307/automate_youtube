import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

const isFreeTier = process.env.FREE_TIER === 'true';

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : undefined;

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  freeTier: isFreeTier,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kids_youtube',
  storagePath: process.env.STORAGE_PATH || path.resolve(__dirname, '../../../storage'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
  youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/youtube/callback',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigin,
  cronSecret: process.env.CRON_SECRET || '',
  serveFrontend: process.env.SERVE_FRONTEND === 'true' || isFreeTier,
  inlineWorker: process.env.INLINE_WORKER !== 'false',
  jobPollIntervalMs: parseInt(process.env.JOB_POLL_INTERVAL_MS || (isFreeTier ? '60000' : '15000'), 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  cronDailyPipeline: process.env.CRON_DAILY_PIPELINE || '0 0 * * *',
  cronAnalytics: process.env.CRON_ANALYTICS || '0 */6 * * *',
  // Free tier: shorter videos to stay within memory/time limits
  defaultVideoDurationMin: isFreeTier ? 60 : 120,
  defaultVideoDurationMax: isFreeTier ? 90 : 300,
};
