import OpenAI from 'openai';
import { prisma } from '../db';
import { config } from '../config';
import { getQueueStats } from '../queues';
import { logger } from '../utils/logger';
import { youtubeService } from './youtube/youtube-service';

export interface SystemStatus {
  hosting: {
    freeTier: boolean;
    environment: string;
    memoryLimit: string;
    storageNote: string;
    cronConfigured: boolean;
  };
  openai: {
    configured: boolean;
    activeProvider: string;
    status: 'ok' | 'error' | 'not_configured' | 'mock';
    message: string;
    limitsNote: string;
    usageUrl: string;
  };
  youtube: {
    configured: boolean;
    authenticated: boolean;
    channelTitle?: string;
    hasThumbnailScope: boolean;
    needsReauth: boolean;
    status: 'ok' | 'warning' | 'not_configured' | 'not_connected';
    message: string;
    customThumbnailsNote: string;
  };
  pipeline: {
    jobsPending: number;
    jobsProcessing: number;
    jobsFailed: number;
    stuckRendering: number;
    recentErrors: { contentId: string; title: string; error: string; stage: string }[];
  };
  freeTierLimits: {
    maxVideoSeconds: number;
    maxScenes: number;
    renderResolution: string;
    renderTimeoutSeconds: number;
    whyStuck: string[];
  };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const channelConfig = await prisma.channelConfig.findFirst();
  const llmProvider = channelConfig?.llmProvider || 'mock';

  const openaiStatus = await checkOpenAiStatus(llmProvider);
  const youtubeStatus = await checkYouTubeStatus();
  const queueStats = await getQueueStats();
  const q = queueStats[0] || { waiting: 0, active: 0, failed: 0 };

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckRendering = await prisma.content.count({
    where: {
      status: 'generating',
      currentStage: 'rendering',
      updatedAt: { lt: tenMinAgo },
      videoUrl: null,
    },
  });

  const recentFailed = await prisma.content.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, title: true, errorMessage: true, currentStage: true },
  });

  const whyStuck: string[] = [];
  if (config.freeTier) {
    whyStuck.push('Render free tier has 512 MB RAM — video rendering is slow and may timeout');
    whyStuck.push('Service sleeps after 15 min idle — use cron-job.org keep-alive');
    whyStuck.push('Storage is temporary — files are lost on redeploy');
  }
  if (!config.cronSecret) {
    whyStuck.push('CRON_SECRET not set — daily automation and keep-alive won\'t work');
  }
  if (!config.openaiApiKey && llmProvider === 'openai') {
    whyStuck.push('OPENAI_API_KEY missing but provider is set to openai — using fallback may fail');
  }
  if (openaiStatus.status === 'error') {
    whyStuck.push(`OpenAI issue: ${openaiStatus.message}`);
  }
  if (stuckRendering > 0) {
    whyStuck.push(`${stuckRendering} video(s) stuck at rendering — click Retry Rendering`);
  }
  if (q.failed > 0) {
    whyStuck.push(`${q.failed} background job(s) failed — check recent errors below`);
  }

  if (youtubeStatus.status === 'warning') {
    whyStuck.push(`YouTube: ${youtubeStatus.message}`);
  }

  return {
    hosting: {
      freeTier: config.freeTier,
      environment: config.nodeEnv,
      memoryLimit: config.freeTier ? '512 MB (Render free)' : 'Varies by plan',
      storageNote: config.freeTier
        ? 'Ephemeral — videos deleted on redeploy. Upload to YouTube to keep them.'
        : 'Persistent storage configured',
      cronConfigured: !!config.cronSecret,
    },
    openai: openaiStatus,
    youtube: youtubeStatus,
    pipeline: {
      jobsPending: q.waiting,
      jobsProcessing: q.active,
      jobsFailed: q.failed,
      stuckRendering,
      recentErrors: recentFailed.map((c) => ({
        contentId: c.id,
        title: c.title,
        error: c.errorMessage || 'Unknown error',
        stage: c.currentStage,
      })),
    },
    freeTierLimits: {
      maxVideoSeconds: config.defaultVideoDurationMax,
      maxScenes: config.freeTier ? 3 : 5,
      renderResolution: config.freeTier ? '854×480' : '1920×1080',
      renderTimeoutSeconds: config.freeTier ? 120 : 300,
      whyStuck,
    },
  };
}

async function checkOpenAiStatus(activeProvider: string): Promise<SystemStatus['openai']> {
  const usageUrl = 'https://platform.openai.com/usage';
  const limitsNote =
    'OpenAI limits depend on your plan (free trial, pay-as-you-go, etc.). Check usage dashboard for rate limits and billing.';

  if (activeProvider !== 'openai') {
    return {
      configured: false,
      activeProvider,
      status: 'mock',
      message: `Using "${activeProvider}" provider — no OpenAI API calls (no cost, demo content)`,
      limitsNote,
      usageUrl,
    };
  }

  if (!config.openaiApiKey) {
    return {
      configured: false,
      activeProvider,
      status: 'not_configured',
      message: 'OPENAI_API_KEY not set on server — set it in Render env vars',
      limitsNote,
      usageUrl,
    };
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: 10000 });
    await client.models.list();
    return {
      configured: true,
      activeProvider,
      status: 'ok',
      message: 'API key valid — connected to OpenAI',
      limitsNote:
        'If generation fails with "rate limit" or "quota exceeded", you hit OpenAI limits. Wait or upgrade at platform.openai.com.',
      usageUrl,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('OpenAI status check failed', { error: msg });

    let friendly = msg;
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      friendly = 'Rate limit exceeded — too many requests. Wait a few minutes or check billing.';
    } else if (msg.includes('401') || msg.toLowerCase().includes('incorrect api key')) {
      friendly = 'Invalid API key — check OPENAI_API_KEY on Render';
    } else if (msg.includes('insufficient_quota') || msg.toLowerCase().includes('quota')) {
      friendly = 'Quota exceeded — add billing or credits at platform.openai.com';
    }

    return {
      configured: true,
      activeProvider,
      status: 'error',
      message: friendly,
      limitsNote,
      usageUrl,
    };
  }
}

async function checkYouTubeStatus(): Promise<SystemStatus['youtube']> {
  const connection = await youtubeService.getConnectionStatus();

  if (!connection.configured) {
    return {
      configured: false,
      authenticated: false,
      hasThumbnailScope: false,
      needsReauth: false,
      status: 'not_configured',
      message: 'YouTube API credentials not set on server',
      customThumbnailsNote: connection.customThumbnailsNote,
    };
  }

  if (!connection.authenticated) {
    return {
      configured: true,
      authenticated: false,
      hasThumbnailScope: false,
      needsReauth: false,
      status: 'not_connected',
      message: 'YouTube account not connected — uploads will be skipped',
      customThumbnailsNote: connection.customThumbnailsNote,
    };
  }

  if (connection.needsReauth || !connection.hasThumbnailScope) {
    return {
      configured: true,
      authenticated: true,
      channelTitle: connection.channelTitle,
      hasThumbnailScope: connection.hasThumbnailScope,
      needsReauth: true,
      status: 'warning',
      message: connection.message || 'Reconnect YouTube to grant custom thumbnail permissions',
      customThumbnailsNote: connection.customThumbnailsNote,
    };
  }

  return {
    configured: true,
    authenticated: true,
    channelTitle: connection.channelTitle,
    hasThumbnailScope: true,
    needsReauth: false,
    status: 'ok',
    message: connection.message || `Connected as ${connection.channelTitle || 'your channel'}`,
    customThumbnailsNote: connection.customThumbnailsNote,
  };
}
