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
    channelId?: string;
    longUploadsStatus?: string;
    hasThumbnailScope: boolean;
    needsReauth: boolean;
    thumbnailEligibility: 'eligible' | 'scope_missing' | 'channel_verification_required' | 'blocked';
    skipCustomThumbnails: boolean;
    status: 'ok' | 'warning' | 'not_configured' | 'not_connected';
    message: string;
    customThumbnailsNote: string;
    verifyChannelUrl: string;
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
    whyStuck.push('OPENAI_API_KEY missing but provider is set to openai — switch to gemini or mock in Settings');
  }
  if (!config.geminiApiKey && llmProvider === 'gemini') {
    whyStuck.push('GEMINI_API_KEY missing but provider is set to gemini — get a free key at aistudio.google.com');
  }
  if (openaiStatus.status === 'error') {
    whyStuck.push(`LLM issue: ${openaiStatus.message} — try switching to gemini or mock in Settings`);
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
  if (activeProvider === 'mock') {
    return {
      configured: true,
      activeProvider,
      status: 'mock',
      message: 'Using mock LLM — free demo content, no API cost',
      limitsNote: 'Switch to gemini (free tier) or openai in Settings for AI-generated scripts.',
      usageUrl: 'https://aistudio.google.com/apikey',
    };
  }

  if (activeProvider === 'gemini') {
    const usageUrl = 'https://aistudio.google.com/apikey';
    const limitsNote = 'Gemini free tier has daily request limits. If exceeded, switch to mock temporarily.';

    if (!config.geminiApiKey) {
      return {
        configured: false,
        activeProvider,
        status: 'not_configured',
        message: 'GEMINI_API_KEY not set — get a free key at aistudio.google.com and add it to Render env vars',
        limitsNote,
        usageUrl,
      };
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${body}`);
      }
      return {
        configured: true,
        activeProvider,
        status: 'ok',
        message: `Gemini API key valid — using ${config.geminiModel}`,
        limitsNote,
        usageUrl,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Gemini status check failed', { error: msg });
      return {
        configured: true,
        activeProvider,
        status: 'error',
        message: msg.includes('401') || msg.includes('API key')
          ? 'Invalid GEMINI_API_KEY — check Render env vars'
          : `Gemini API error: ${msg.substring(0, 120)}`,
        limitsNote,
        usageUrl,
      };
    }
  }

  const usageUrl = 'https://platform.openai.com/usage';
  const limitsNote =
    'OpenAI quota exceeded? Switch to gemini (free) or mock in Settings → AI Providers.';

  if (activeProvider !== 'openai') {
    return {
      configured: false,
      activeProvider,
      status: 'mock',
      message: `Using "${activeProvider}" provider`,
      limitsNote,
      usageUrl,
    };
  }

  if (!config.openaiApiKey) {
    return {
      configured: false,
      activeProvider,
      status: 'not_configured',
      message: 'OPENAI_API_KEY not set on server — set it in Render env vars or switch to gemini/mock',
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
      limitsNote,
      usageUrl,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('OpenAI status check failed', { error: msg });

    let friendly = msg;
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      friendly = 'Rate limit exceeded — switch to gemini or mock in Settings';
    } else if (msg.includes('401') || msg.toLowerCase().includes('incorrect api key')) {
      friendly = 'Invalid API key — check OPENAI_API_KEY on Render';
    } else if (msg.includes('insufficient_quota') || msg.toLowerCase().includes('quota')) {
      friendly = 'Quota exceeded — switch to gemini (free) or mock in Settings, or add billing at platform.openai.com';
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
      thumbnailEligibility: 'blocked',
      skipCustomThumbnails: false,
      status: 'not_configured',
      message: 'YouTube API credentials not set on server',
      customThumbnailsNote: connection.customThumbnailsNote,
      verifyChannelUrl: connection.verifyChannelUrl,
    };
  }

  if (!connection.authenticated) {
    return {
      configured: true,
      authenticated: false,
      hasThumbnailScope: false,
      needsReauth: false,
      thumbnailEligibility: 'blocked',
      skipCustomThumbnails: false,
      status: 'not_connected',
      message: 'YouTube account not connected — uploads will be skipped',
      customThumbnailsNote: connection.customThumbnailsNote,
      verifyChannelUrl: connection.verifyChannelUrl,
    };
  }

  if (connection.thumbnailEligibility === 'channel_verification_required') {
    return {
      configured: true,
      authenticated: true,
      channelTitle: connection.channelTitle,
      channelId: connection.channelId,
      longUploadsStatus: connection.longUploadsStatus,
      hasThumbnailScope: connection.hasThumbnailScope,
      needsReauth: connection.needsReauth,
      thumbnailEligibility: connection.thumbnailEligibility,
      skipCustomThumbnails: connection.skipCustomThumbnails,
      status: 'warning',
      message: connection.message || 'Channel must be phone-verified for custom thumbnails',
      customThumbnailsNote: connection.customThumbnailsNote,
      verifyChannelUrl: connection.verifyChannelUrl,
    };
  }

  if (connection.needsReauth || connection.thumbnailEligibility === 'scope_missing') {
    return {
      configured: true,
      authenticated: true,
      channelTitle: connection.channelTitle,
      channelId: connection.channelId,
      longUploadsStatus: connection.longUploadsStatus,
      hasThumbnailScope: connection.hasThumbnailScope,
      needsReauth: true,
      thumbnailEligibility: connection.thumbnailEligibility,
      skipCustomThumbnails: connection.skipCustomThumbnails,
      status: 'warning',
      message: connection.message || 'Reconnect YouTube to grant custom thumbnail permissions',
      customThumbnailsNote: connection.customThumbnailsNote,
      verifyChannelUrl: connection.verifyChannelUrl,
    };
  }

  return {
    configured: true,
    authenticated: true,
    channelTitle: connection.channelTitle,
    channelId: connection.channelId,
    longUploadsStatus: connection.longUploadsStatus,
    hasThumbnailScope: connection.hasThumbnailScope,
    needsReauth: false,
    thumbnailEligibility: connection.thumbnailEligibility,
    skipCustomThumbnails: connection.skipCustomThumbnails,
    status: 'ok',
    message: connection.message || `Connected as ${connection.channelTitle || 'your channel'}`,
    customThumbnailsNote: connection.customThumbnailsNote,
    verifyChannelUrl: connection.verifyChannelUrl,
  };
}
