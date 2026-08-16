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
]);

export interface YouTubeUploadResult {
  videoId: string;
  thumbnailSet: boolean;
  thumbnailError?: string;
}

export interface YouTubeConnectionStatus {
  configured: boolean;
  authenticated: boolean;
  redirectUri: string;
  channelTitle?: string;
  grantedScopes: string[];
  hasThumbnailScope: boolean;
  needsReauth: boolean;
  customThumbnailsNote: string;
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

function formatYouTubeError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    const message = response?.data?.error?.message;
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'Unknown YouTube API error';
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
      await prisma.channelConfig.update({
        where: { id: channelConfig.id },
        data: { youtubeTokens: tokens as object },
      });
    }
    this.oauth2Client.setCredentials(tokens);
    logger.info('YouTube OAuth tokens saved', {
      scopes: parseGrantedScopes(tokens as Record<string, unknown>),
    });
  }

  private async getAuthenticatedClient() {
    const channelConfig = await prisma.channelConfig.findFirst();
    if (!channelConfig?.youtubeTokens) {
      throw new Error('YouTube not authenticated. Visit /api/youtube/auth to connect.');
    }
    this.oauth2Client.setCredentials(channelConfig.youtubeTokens as Record<string, string>);
    return this.oauth2Client;
  }

  async getConnectionStatus(): Promise<YouTubeConnectionStatus> {
    const redirectUri = config.youtubeRedirectUri;
    const configured = this.isConfigured();
    const authenticated = await this.isAuthenticated();

    const customThumbnailsNote =
      'Custom thumbnails require the youtube.force-ssl OAuth scope and a verified YouTube channel. ' +
      'If uploads fail on thumbnails, reconnect YouTube and verify your channel at studio.youtube.com.';

    if (!configured) {
      return {
        configured: false,
        authenticated: false,
        redirectUri,
        grantedScopes: [],
        hasThumbnailScope: false,
        needsReauth: false,
        customThumbnailsNote,
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
        customThumbnailsNote,
        message: 'Connect your YouTube account to enable uploads.',
      };
    }

    const channelConfig = await prisma.channelConfig.findFirst();
    const grantedScopes = parseGrantedScopes(channelConfig?.youtubeTokens as Record<string, unknown>);
    const thumbnailScopeGranted = hasThumbnailScope(grantedScopes);
    const needsReauth = grantedScopes.length === 0 || !thumbnailScopeGranted;

    try {
      const auth = await this.getAuthenticatedClient();
      const youtube = google.youtube({ version: 'v3', auth });
      const response = await youtube.channels.list({
        part: ['snippet'],
        mine: true,
      });
      const channelTitle = response.data.items?.[0]?.snippet?.title || undefined;

      return {
        configured: true,
        authenticated: true,
        redirectUri,
        channelTitle,
        grantedScopes,
        hasThumbnailScope: thumbnailScopeGranted,
        needsReauth,
        customThumbnailsNote,
        message: needsReauth
          ? 'Reconnect YouTube to grant thumbnail permissions (youtube.force-ssl scope).'
          : thumbnailScopeGranted
            ? `Connected as ${channelTitle || 'your channel'}.`
            : 'Connected, but thumbnail scope is missing — reconnect YouTube.',
      };
    } catch (error) {
      logger.warn('YouTube connection status check failed', { error: formatYouTubeError(error) });
      return {
        configured: true,
        authenticated: true,
        redirectUri,
        grantedScopes,
        hasThumbnailScope: thumbnailScopeGranted,
        needsReauth: true,
        customThumbnailsNote,
        message: `Connected, but YouTube API check failed: ${formatYouTubeError(error)}. Try reconnecting.`,
      };
    }
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
    let thumbnailError: string | undefined;

    if (thumbnailPath) {
      const resolvedThumb = resolveStoragePath(thumbnailPath);
      if (fs.existsSync(resolvedThumb)) {
        try {
          await youtube.thumbnails.set({
            videoId,
            media: { body: fs.createReadStream(resolvedThumb) },
          });
          thumbnailSet = true;
        } catch (error) {
          thumbnailError = formatYouTubeError(error);
          logger.warn(`Video ${videoId} uploaded but custom thumbnail failed: ${thumbnailError}`);
        }
      }
    }

    logger.info(`Video uploaded to YouTube: ${videoId}`, { thumbnailSet, thumbnailError });
    return { videoId, thumbnailSet, thumbnailError };
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
    const channelConfig = await prisma.channelConfig.findFirst();
    return !!channelConfig?.youtubeTokens;
  }
}

export const youtubeService = new YouTubeService();
