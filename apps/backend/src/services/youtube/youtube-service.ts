import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { ContentMetadata } from '@kids-youtube/shared';

function resolveStoragePath(urlPath: string): string {
  if (urlPath.startsWith('/storage/')) {
    return path.join(config.storagePath, urlPath.replace('/storage/', ''));
  }
  return urlPath;
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
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
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
    logger.info('YouTube OAuth tokens saved');
  }

  private async getAuthenticatedClient() {
    const channelConfig = await prisma.channelConfig.findFirst();
    if (!channelConfig?.youtubeTokens) {
      throw new Error('YouTube not authenticated. Visit /api/youtube/auth to connect.');
    }
    this.oauth2Client.setCredentials(channelConfig.youtubeTokens as Record<string, string>);
    return this.oauth2Client;
  }

  async uploadVideo(
    videoPath: string,
    thumbnailPath: string | null,
    metadata: ContentMetadata,
    scheduledAt?: Date
  ): Promise<string> {
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

    if (thumbnailPath) {
      const resolvedThumb = resolveStoragePath(thumbnailPath);
      if (fs.existsSync(resolvedThumb)) {
        await youtube.thumbnails.set({
          videoId,
          media: { body: fs.createReadStream(resolvedThumb) },
        });
      }
    }

    logger.info(`Video uploaded to YouTube: ${videoId}`);
    return videoId;
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
