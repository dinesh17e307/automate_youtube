import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { ContentMetadata } from '@kids-youtube/shared';

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
] as const;

const THUMBNAIL_SCOPES = new Set([
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
]);

const VERIFY_CHANNEL_URL = 'https://www.youtube.com/verify';
const VERIFY_CHANNEL_HELP_URL = 'https://support.google.com/youtube/answer/171664?hl=en';

export type ThumbnailEligibility =
  | 'eligible'
  | 'scope_missing'
  | 'channel_verification_required'
  | 'blocked';

export interface YouTubeMeta {
  skipCustomThumbnails?: boolean;
  thumbnailBlockReason?: string;
  thumbnailBlockedAt?: string;
  lastThumbnailError?: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  thumbnailSet: boolean;
  thumbnailSkipped?: boolean;
  thumbnailSkipReason?: string;
  thumbnailError?: string;
}

export interface YouTubeConnectionStatus {
  configured: boolean;
  authenticated: boolean;
  redirectUri: string;
  channelTitle?: string;
  channelId?: string;
  longUploadsStatus?: string;
  grantedScopes: string[];
  hasThumbnailScope: boolean;
  needsReauth: boolean;
  thumbnailEligibility: ThumbnailEligibility;
  skipCustomThumbnails: boolean;
  customThumbnailsNote: string;
  verifyChannelUrl: string;
  message?: string;
}

function resolveStoragePath(urlPath: string): string {
  if (urlPath.startsWith('/storage/')) {
    return path.join(config.storagePath, urlPath.replace('/storage/', ''));
  }
  return urlPath;
}

function parseGrantedScopes(tokens: Record<string, unknown> | null | undefined): string[] {
  const scope = tokens?.scope;
  if (typeof scope !== 'string' || !scope.trim()) {
    return [];
  }
  return scope.split(/\s+/).filter(Boolean);
}

function hasThumbnailScope(scopes: string[]): boolean {
  return scopes.some((scope) => THUMBNAIL_SCOPES.has(scope));
}

function parseYouTubeMeta(raw: unknown): YouTubeMeta {
  if (!raw || typeof raw !== 'object') return {};
  return raw as YouTubeMeta;
}

function formatYouTubeError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    const message = response?.data?.error?.message;
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'Unknown YouTube API error';
}

function classifyThumbnailError(message: string): ThumbnailEligibility {
  const lower = message.toLowerCase();
  if (lower.includes('insufficient') && lower.includes('scope')) {
    return 'scope_missing';
  }
  if (
    lower.includes("doesn't have permissions to upload and set custom video thumbnails") ||
    lower.includes('custom video thumbnails') ||
    lower.includes('channel must be verified')
  ) {
    return 'channel_verification_required';
  }
  return 'blocked';
}

function buildCustomThumbnailsNote(eligibility: ThumbnailEligibility): string {
  switch (eligibility) {
    case 'scope_missing':
      return 'Reconnect YouTube and approve all requested permissions to enable custom thumbnail uploads.';
    case 'channel_verification_required':
      return 'Your YouTube channel must be phone-verified before custom thumbnails work via API. Verify at youtube.com/verify, then click “Retry thumbnails” in Settings.';
    case 'blocked':
      return 'Custom thumbnail uploads are currently blocked for this channel. Verify the channel or reconnect the correct YouTube account.';
    default:
      return 'Custom thumbnails are enabled for this connected channel.';
  }
}

export class YouTubeService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.youtubeClientId,
      config.youtubeClientSecret,
      config.youtubeRedirectUri
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [...YOUTUBE_OAUTH_SCOPES],
      prompt: 'consent',
      include_granted_scopes: true,
    });
  }

  async handleCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    const channelConfig = await prisma.channelConfig.findFirst();
    if (channelConfig) {
      const existingMeta = parseYouTubeMeta(channelConfig.youtubeMeta);
      await prisma.channelConfig.update({
        where: { id: channelConfig.id },
        data: {
          youtubeTokens: tokens as object,
          youtubeMeta: {
            ...existingMeta,
            skipCustomThumbnails: false,
            thumbnailBlockReason: undefined,
            thumbnailBlockedAt: undefined,
            lastThumbnailError: undefined,
          },
        },
      });
    }
    this.oauth2Client.setCredentials(tokens);
    logger.info('YouTube OAuth tokens saved', {
      scopes: parseGrantedScopes(tokens as Record<string, unknown>),
    });
  }

  private async getChannelConfig() {
    return prisma.channelConfig.findFirst();
  }

  private async getAuthenticatedClient() {
    const channelConfig = await this.getChannelConfig();
    if (!channelConfig?.youtubeTokens) {
      throw new Error('YouTube not authenticated. Visit /api/youtube/auth to connect.');
    }
    this.oauth2Client.setCredentials(channelConfig.youtubeTokens as Record<string, string>);
    return this.oauth2Client;
  }

  private async updateYouTubeMeta(patch: Partial<YouTubeMeta>): Promise<void> {
    const channelConfig = await this.getChannelConfig();
    if (!channelConfig) return;

    const current = parseYouTubeMeta(channelConfig.youtubeMeta);
    await prisma.channelConfig.update({
      where: { id: channelConfig.id },
      data: {
        youtubeMeta: {
          ...current,
          ...patch,
        },
      },
    });
  }

  async clearThumbnailBlock(): Promise<void> {
    await this.updateYouTubeMeta({
      skipCustomThumbnails: false,
      thumbnailBlockReason: undefined,
      thumbnailBlockedAt: undefined,
      lastThumbnailError: undefined,
    });
  }

  async getConnectionStatus(): Promise<YouTubeConnectionStatus> {
    const redirectUri = config.youtubeRedirectUri;
    const configured = this.isConfigured();
    const authenticated = await this.isAuthenticated();

    if (!configured) {
      return {
        configured: false,
        authenticated: false,
        redirectUri,
        grantedScopes: [],
        hasThumbnailScope: false,
        needsReauth: false,
        thumbnailEligibility: 'blocked',
        skipCustomThumbnails: false,
        customThumbnailsNote: buildCustomThumbnailsNote('blocked'),
        verifyChannelUrl: VERIFY_CHANNEL_URL,
        message: 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET on the server.',
      };
    }

    if (!authenticated) {
      return {
        configured: true,
        authenticated: false,
        redirectUri,
        grantedScopes: [],
        hasThumbnailScope: false,
        needsReauth: false,
        thumbnailEligibility: 'blocked',
        skipCustomThumbnails: false,
        customThumbnailsNote: buildCustomThumbnailsNote('blocked'),
        verifyChannelUrl: VERIFY_CHANNEL_URL,
        message: 'Connect your YouTube account to enable uploads.',
      };
    }

    const channelConfig = await this.getChannelConfig();
    const grantedScopes = parseGrantedScopes(channelConfig?.youtubeTokens as Record<string, unknown>);
    const youtubeMeta = parseYouTubeMeta(channelConfig?.youtubeMeta);
    const thumbnailScopeGranted = hasThumbnailScope(grantedScopes);
    const needsReauth = grantedScopes.length === 0 || !thumbnailScopeGranted;

    try {
      const auth = await this.getAuthenticatedClient();
      const youtube = google.youtube({ version: 'v3', auth });
      const response = await youtube.channels.list({
        part: ['snippet', 'status'],
        mine: true,
      });
      const channel = response.data.items?.[0];
      const channelTitle = channel?.snippet?.title || undefined;
      const channelId = channel?.id || undefined;
      const longUploadsStatus = channel?.status?.longUploadsStatus || undefined;

      let thumbnailEligibility: ThumbnailEligibility = 'eligible';
      if (needsReauth || !thumbnailScopeGranted) {
        thumbnailEligibility = 'scope_missing';
      } else if (youtubeMeta.skipCustomThumbnails) {
        thumbnailEligibility = classifyThumbnailError(youtubeMeta.thumbnailBlockReason || youtubeMeta.lastThumbnailError || '');
        if (thumbnailEligibility === 'blocked') {
          thumbnailEligibility = 'channel_verification_required';
        }
      } else if (longUploadsStatus && longUploadsStatus !== 'allowed') {
        thumbnailEligibility = 'channel_verification_required';
      }

      const skipCustomThumbnails = thumbnailEligibility !== 'eligible' || !!youtubeMeta.skipCustomThumbnails;
      const customThumbnailsNote = buildCustomThumbnailsNote(thumbnailEligibility);

      let message: string;
      if (thumbnailEligibility === 'scope_missing') {
        message = 'Reconnect YouTube to grant thumbnail permissions.';
      } else if (thumbnailEligibility === 'channel_verification_required') {
        message = `Connected as ${channelTitle || 'your channel'}, but custom thumbnails are blocked until the channel is phone-verified.`;
      } else if (youtubeMeta.skipCustomThumbnails) {
        message = `Connected as ${channelTitle || 'your channel'}. Videos upload, but custom thumbnails are skipped.`;
      } else {
        message = `Connected as ${channelTitle || 'your channel'}. Custom thumbnails enabled.`;
      }

      if (channelId && channelConfig && channelConfig.youtubeChannelId !== channelId) {
        await prisma.channelConfig.update({
          where: { id: channelConfig.id },
          data: { youtubeChannelId: channelId },
        });
      }

      return {
        configured: true,
        authenticated: true,
        redirectUri,
        channelTitle,
        channelId,
        longUploadsStatus,
        grantedScopes,
        hasThumbnailScope: thumbnailScopeGranted,
        needsReauth,
        thumbnailEligibility,
        skipCustomThumbnails,
        customThumbnailsNote,
        verifyChannelUrl: VERIFY_CHANNEL_URL,
        message,
      };
    } catch (error) {
      logger.warn('YouTube connection status check failed', { error: formatYouTubeError(error) });
      const thumbnailEligibility: ThumbnailEligibility = needsReauth ? 'scope_missing' : 'blocked';
      return {
        configured: true,
        authenticated: true,
        redirectUri,
        grantedScopes,
        hasThumbnailScope: thumbnailScopeGranted,
        needsReauth: true,
        thumbnailEligibility,
        skipCustomThumbnails: !!youtubeMeta.skipCustomThumbnails,
        customThumbnailsNote: buildCustomThumbnailsNote(thumbnailEligibility),
        verifyChannelUrl: VERIFY_CHANNEL_URL,
        message: `Connected, but YouTube API check failed: ${formatYouTubeError(error)}. Try reconnecting.`,
      };
    }
  }

  private async shouldSkipThumbnailUpload(): Promise<{ skip: boolean; reason?: string }> {
    const status = await this.getConnectionStatus();
    if (status.thumbnailEligibility === 'scope_missing') {
      return {
        skip: true,
        reason: 'Missing OAuth thumbnail scope — reconnect YouTube in Settings.',
      };
    }
    if (status.thumbnailEligibility === 'channel_verification_required' || status.skipCustomThumbnails) {
      return {
        skip: true,
        reason: `Channel not eligible for custom thumbnails — verify at ${VERIFY_CHANNEL_URL}`,
      };
    }
    return { skip: false };
  }

  async uploadVideo(
    videoPath: string,
    thumbnailPath: string | null,
    metadata: ContentMetadata,
    scheduledAt?: Date
  ): Promise<YouTubeUploadResult> {
    const auth = await this.getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const resolvedVideo = resolveStoragePath(videoPath);
    if (!fs.existsSync(resolvedVideo)) {
      throw new Error(`Video file not found: ${resolvedVideo}`);
    }

    const status: Record<string, unknown> = {
      privacyStatus: scheduledAt ? 'private' : metadata.visibility,
      selfDeclaredMadeForKids: metadata.madeForKids,
    };

    if (scheduledAt) {
      status.publishAt = scheduledAt.toISOString();
      status.privacyStatus = 'private';
    }

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: '24',
        },
        status,
      },
      media: {
        body: fs.createReadStream(resolvedVideo),
      },
    });

    const videoId = response.data.id;
    if (!videoId) throw new Error('YouTube upload failed: no video ID returned');

    let thumbnailSet = false;
    let thumbnailSkipped = false;
    let thumbnailSkipReason: string | undefined;
    let thumbnailError: string | undefined;

    if (thumbnailPath) {
      const resolvedThumb = resolveStoragePath(thumbnailPath);
      if (fs.existsSync(resolvedThumb)) {
        const skipCheck = await this.shouldSkipThumbnailUpload();
        if (skipCheck.skip) {
          thumbnailSkipped = true;
          thumbnailSkipReason = skipCheck.reason;
          logger.warn(`Skipping custom thumbnail for ${videoId}: ${thumbnailSkipReason}`);
        } else {
          try {
            await youtube.thumbnails.set({
              videoId,
              media: { body: fs.createReadStream(resolvedThumb) },
            });
            thumbnailSet = true;
            await this.updateYouTubeMeta({
              skipCustomThumbnails: false,
              thumbnailBlockReason: undefined,
              thumbnailBlockedAt: undefined,
              lastThumbnailError: undefined,
            });
          } catch (error) {
            thumbnailError = formatYouTubeError(error);
            const eligibility = classifyThumbnailError(thumbnailError);
            await this.updateYouTubeMeta({
              skipCustomThumbnails: true,
              thumbnailBlockReason: thumbnailError,
              thumbnailBlockedAt: new Date().toISOString(),
              lastThumbnailError: thumbnailError,
            });
            const guidance = eligibility === 'channel_verification_required'
              ? ` Verify channel at ${VERIFY_CHANNEL_URL}`
              : '';
            logger.warn(`Video ${videoId} uploaded but custom thumbnail failed: ${thumbnailError}.${guidance}`);
          }
        }
      }
    }

    logger.info(`Video uploaded to YouTube: ${videoId}`, {
      thumbnailSet,
      thumbnailSkipped,
      thumbnailSkipReason,
      thumbnailError,
    });
    return { videoId, thumbnailSet, thumbnailSkipped, thumbnailSkipReason, thumbnailError };
  }

  async getAnalytics(videoId: string) {
    const auth = await this.getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: ['statistics', 'snippet'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) return null;

    return {
      views: parseInt(video.statistics?.viewCount || '0', 10),
      likes: parseInt(video.statistics?.likeCount || '0', 10),
      comments: parseInt(video.statistics?.commentCount || '0', 10),
      title: video.snippet?.title,
    };
  }

  isConfigured(): boolean {
    return !!(config.youtubeClientId && config.youtubeClientSecret);
  }

  async isAuthenticated(): Promise<boolean> {
    const channelConfig = await this.getChannelConfig();
    return !!channelConfig?.youtubeTokens;
  }
}

export const youtubeService = new YouTubeService();
export { VERIFY_CHANNEL_URL, VERIFY_CHANNEL_HELP_URL };
