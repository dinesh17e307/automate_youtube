import { prisma } from '../../db';
import { getAiProviders } from '../ai/factory';
import { renderVideo, generateThumbnail } from '../video/renderer';
import { contentValidator } from '../validation/content-validator';
import { youtubeService } from '../youtube/youtube-service';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import type { Script, Scene, Character, ContentMetadata, ContentCategory } from '@kids-youtube/shared';
import { CONTENT_CATEGORIES } from '@kids-youtube/shared';
import type { ContentGenerationJob, DailyPipelineJob } from '../../queues';

export class PipelineService {
  async runDailyPipeline(job: DailyPipelineJob): Promise<void> {
    const date = job.date || new Date().toISOString().split('T')[0];
    logger.info(`Starting daily pipeline for ${date}`);

    const channelConfig = await prisma.channelConfig.findFirst();
    if (!channelConfig) throw new Error('Channel configuration not found');

    const contentType = job.contentType || 'both';

    if (contentType === 'long' || contentType === 'both') {
      const existingLong = await prisma.content.findFirst({
        where: {
          type: 'long',
          createdAt: { gte: new Date(`${date}T00:00:00Z`) },
        },
      });

      if (!existingLong) {
        const longContent = await this.createContent('long');
        await this.processContent(longContent.id);
      } else {
        logger.info(`Long video already exists for ${date}`);
      }
    }

    if (contentType === 'short' || contentType === 'both') {
      const existingShort = await prisma.content.findFirst({
        where: {
          type: 'short',
          createdAt: { gte: new Date(`${date}T00:00:00Z`) },
        },
      });

      if (!existingShort) {
        const shortContent = await this.createContent('short');
        await this.processContent(shortContent.id);
      } else {
        logger.info(`Short already exists for ${date}`);
      }
    }
  }

  async createContent(type: 'long' | 'short', parentContentId?: string) {
    const content = await prisma.content.create({
      data: {
        type,
        title: `Generating ${type} video...`,
        category: 'kids_songs',
        status: 'generating',
        currentStage: 'idea',
        parentContentId,
      },
    });

    await this.logJob(content.id, 'create', 'completed', `Created ${type} content`);
    return content;
  }

  async processContent(contentId: string): Promise<void> {
    try {
      await this.generateTopic(contentId);
      await this.generateScript(contentId);
      await this.generateScenes(contentId);
      await this.generateCharacters(contentId);
      await this.generateVoice(contentId);
      await this.generateMusic(contentId);
      await this.renderVideo(contentId);
      await this.generateThumbnail(contentId);
      await this.validateContent(contentId);

      const channelConfig = await prisma.channelConfig.findFirst();
      if (channelConfig?.automationMode === 'approval') {
        await this.updateStage(contentId, 'validation', 'awaiting_approval');
        logger.info(`Content ${contentId} awaiting admin approval`);
      } else {
        await this.uploadToYouTube(contentId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Pipeline failed for ${contentId}`, { error: message });

      await prisma.content.update({
        where: { id: contentId },
        data: {
          status: 'failed',
          errorMessage: message,
          retryCount: { increment: 1 },
        },
      });

      await this.logJob(contentId, 'pipeline', 'failed', message);
      throw error;
    }
  }

  async generateTopic(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'idea');
    const providers = await getAiProviders();
    const channelConfig = await prisma.channelConfig.findFirstOrThrow();

    const previousTopics = await prisma.topicHistory.findMany({
      orderBy: { usedAt: 'desc' },
      take: 50,
      select: { title: true },
    });

    const analytics = await prisma.analytics.findMany({
      include: { content: true },
      orderBy: { views: 'desc' },
      take: 20,
    });

    const performanceHints = analytics.map((a: { content: { category: string }; averageViewDuration: number }) => ({
      category: a.content.category,
      avgRetention: a.averageViewDuration / 100,
    }));

    const categories = (channelConfig.contentCategories as ContentCategory[]) || [...CONTENT_CATEGORIES];

    const topics = await providers.llm.generateTopics({
      categories,
      previousTopics: previousTopics.map((t: { title: string }) => t.title),
      performanceHints,
      count: 5,
    });

    const selected = topics[0];
    if (!selected) throw new Error('No topics generated');

    await prisma.content.update({
      where: { id: contentId },
      data: { title: selected.title, category: selected.category },
    });

    await prisma.topicHistory.create({
      data: { title: selected.title, category: selected.category, contentId },
    });

    await this.logJob(contentId, 'topic', 'completed', `Selected: ${selected.title}`);
  }

  async generateScript(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'script');
    const providers = await getAiProviders();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const channelConfig = await prisma.channelConfig.findFirstOrThrow();

    const topic = {
      title: content.title,
      category: content.category as ContentCategory,
      description: '',
      score: 1,
      reason: '',
    };

    let script: Script;

    if (content.type === 'short') {
      let longScript: Script | undefined;
      if (content.parentContentId) {
        const parent = await prisma.content.findUnique({ where: { id: content.parentContentId } });
        longScript = parent?.script as unknown as Script | undefined;
      }
      script = await providers.llm.generateShortScript({
        longScript,
        category: content.category as ContentCategory,
        targetAge: channelConfig.targetAge,
      });
    } else {
      script = await providers.llm.generateScript({
        topic,
        targetAge: channelConfig.targetAge,
        durationMin: channelConfig.videoDurationMin,
        durationMax: channelConfig.videoDurationMax,
        language: channelConfig.language,
        visualStyle: channelConfig.visualStyle,
      });
    }

    await prisma.content.update({
      where: { id: contentId },
      data: { script: script as object, title: script.title },
    });

    await this.logJob(contentId, 'script', 'completed', `Script: ${script.title}`);
  }

  async generateScenes(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'scenes');
    const providers = await getAiProviders();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const channelConfig = await prisma.channelConfig.findFirstOrThrow();
    const script = content.script as unknown as Script;

    const dbCharacters = await prisma.character.findMany();
    const characters: Character[] = dbCharacters.map((c: {
      id: string; name: string; description: string; appearance: string;
      clothing: string; colors: string; personality: string;
      referenceImageUrl: string | null; voiceId: string; voiceDescription: string;
    }) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      appearance: c.appearance,
      clothing: c.clothing,
      colors: c.colors,
      personality: c.personality,
      referenceImageUrl: c.referenceImageUrl || undefined,
      voiceId: c.voiceId,
      voiceDescription: c.voiceDescription,
    }));

    const targetDuration = content.type === 'short' ? 30 : channelConfig.videoDurationMax;

    const scenes = await providers.llm.generateScenes({
      script,
      characters,
      targetDuration,
      visualStyle: channelConfig.visualStyle,
    });

    await prisma.content.update({
      where: { id: contentId },
      data: { scenes: scenes as object },
    });

    await this.logJob(contentId, 'scenes', 'completed', `${scenes.length} scenes generated`);
  }

  async generateCharacters(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'characters');
    const providers = await getAiProviders();
    const channelConfig = await prisma.channelConfig.findFirstOrThrow();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const scenes = content.scenes as unknown as Scene[];

    const characterNames = new Set<string>();
    for (const scene of scenes) {
      for (const char of scene.characters) {
        characterNames.add(char.name);
      }
    }

    for (const name of characterNames) {
      const character = await prisma.character.findUnique({ where: { name } });
      if (character && !character.referenceImageUrl) {
        const charData: Character = {
          id: character.id,
          name: character.name,
          description: character.description,
          appearance: character.appearance,
          clothing: character.clothing,
          colors: character.colors,
          personality: character.personality,
          voiceId: character.voiceId,
          voiceDescription: character.voiceDescription,
        };

        const imageUrl = await providers.image.generateCharacterReference(
          charData,
          channelConfig.visualStyle
        );

        await prisma.character.update({
          where: { id: character.id },
          data: { referenceImageUrl: imageUrl },
        });
      }

      if (character) {
        await prisma.contentCharacter.upsert({
          where: { contentId_characterId: { contentId, characterId: character.id } },
          create: { contentId, characterId: character.id },
          update: {},
        });
      }
    }

    await this.logJob(contentId, 'characters', 'completed', `${characterNames.size} characters linked`);
  }

  async generateVoice(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'voice');
    const providers = await getAiProviders();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const scenes = content.scenes as unknown as Scene[];

    const voiceFiles: string[] = [];
    for (const scene of scenes) {
      const character = scene.characters[0];
      const voiceId = character
        ? (await prisma.character.findFirst({ where: { name: character.name } }))?.voiceId || 'sunny'
        : 'sunny';

      const audioUrl = await providers.tts.synthesize(scene.dialogue, voiceId);
      voiceFiles.push(audioUrl);
    }

    const scenesWithAudio = scenes.map((s, i) => ({ ...s, audioUrl: voiceFiles[i] }));
    await prisma.content.update({
      where: { id: contentId },
      data: { scenes: scenesWithAudio as object },
    });

    await this.logJob(contentId, 'voice', 'completed', `${voiceFiles.length} voice files generated`);
  }

  async generateMusic(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'music');
    const providers = await getAiProviders();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const script = content.script as unknown as Script;
    const scenes = content.scenes as unknown as Scene[];

    const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    const musicUrl = await providers.music.generateBackgroundMusic(
      script.musicRequirements,
      totalDuration
    );

    await prisma.content.update({
      where: { id: contentId },
      data: { audioUrl: musicUrl },
    });

    await this.logJob(contentId, 'music', 'completed', 'Background music generated');
  }

  async renderVideo(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'rendering');
    const providers = await getAiProviders();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const scenes = content.scenes as unknown as (Scene & { audioUrl?: string })[];
    const script = content.script as unknown as Script;

    // Cap scene count and duration on free tier
    const maxScenes = config.freeTier ? 3 : scenes.length;
    const renderScenes = scenes.slice(0, maxScenes).map((s) => ({
      ...s,
      durationSeconds: config.freeTier ? Math.min(s.durationSeconds, 15) : s.durationSeconds,
    }));

    const sceneImages: string[] = [];
    for (const scene of renderScenes) {
      const size = content.type === 'short'
        ? { width: 480, height: 854 }
        : { width: 854, height: 480 };
      const imageUrl = await providers.image.generateImage(
        scene.visualPrompt,
        config.freeTier ? size : (content.type === 'short' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 })
      );
      sceneImages.push(imageUrl);
    }

    const voiceFiles = renderScenes.map((s) => s.audioUrl || '');

    const videoUrl = await renderVideo({
      scenes: renderScenes,
      sceneImages,
      voiceFiles,
      musicFile: content.audioUrl || undefined,
      script,
      format: content.type as 'long' | 'short',
    });

    await prisma.content.update({
      where: { id: contentId },
      data: { videoUrl, status: 'completed' },
    });

    await this.logJob(contentId, 'rendering', 'completed', `Video rendered: ${videoUrl}`);
  }

  async generateThumbnail(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'thumbnail');
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const script = content.script as unknown as Script;
    const scenes = content.scenes as unknown as Scene[];

    const providers = await getAiProviders();
    const thumbImage = await providers.image.generateImage(
      script.thumbnailPrompt,
      content.type === 'short' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
    );

    const thumbnailUrl = await generateThumbnail(
      thumbImage,
      script.title,
      content.type as 'long' | 'short'
    );

    await prisma.content.update({
      where: { id: contentId },
      data: { thumbnailUrl },
    });

    await this.logJob(contentId, 'thumbnail', 'completed', `Thumbnail: ${thumbnailUrl}`);
  }

  async validateContent(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'validation');
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const script = content.script as unknown as Script;
    const scenes = content.scenes as unknown as Scene[];

    const result = await contentValidator.validate(script, scenes);

    if (!result.passed) {
      const errors = result.checks.filter((c) => !c.passed && c.severity === 'error');
      throw new Error(`Content validation failed: ${errors.map((e) => e.message).join('; ')}`);
    }

    await this.logJob(contentId, 'validation', 'completed', `Score: ${(result.overallScore * 100).toFixed(0)}%`);
  }

  async uploadToYouTube(contentId: string): Promise<void> {
    await this.updateStage(contentId, 'uploaded');
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    const script = content.script as unknown as Script;
    const channelConfig = await prisma.channelConfig.findFirstOrThrow();

    const isAuthenticated = await youtubeService.isAuthenticated();
    if (!isAuthenticated) {
      logger.warn('YouTube not authenticated, marking as scheduled without upload');
      await prisma.content.update({
        where: { id: contentId },
        data: { status: 'scheduled', currentStage: 'uploaded' },
      });
      return;
    }

    const metadata: ContentMetadata = {
      title: script.title,
      description: script.description,
      tags: script.tags,
      category: 'Education',
      madeForKids: true,
      visibility: 'public',
    };

    const [hours, minutes] = (content.type === 'short'
      ? channelConfig.shortVideoTime
      : channelConfig.longVideoTime
    ).split(':').map(Number);

    const scheduledAt = new Date();
    scheduledAt.setUTCHours(hours, minutes, 0, 0);
    if (scheduledAt <= new Date()) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    const youtubeVideoId = await youtubeService.uploadVideo(
      content.videoUrl!,
      content.thumbnailUrl,
      metadata,
      scheduledAt
    );

    await prisma.content.update({
      where: { id: contentId },
      data: {
        youtubeVideoId,
        status: 'scheduled',
        scheduledAt,
        publishDate: scheduledAt,
        currentStage: 'published',
      },
    });

    await this.logJob(contentId, 'upload', 'completed', `YouTube ID: ${youtubeVideoId}`);
  }

  async approveContent(contentId: string): Promise<void> {
    await this.uploadToYouTube(contentId);
  }

  async resumeFromRendering(contentId: string): Promise<void> {
    try {
      await prisma.content.update({
        where: { id: contentId },
        data: { status: 'generating', errorMessage: null },
      });
      await this.renderVideo(contentId);
      await this.generateThumbnail(contentId);
      await this.validateContent(contentId);
      const channelConfig = await prisma.channelConfig.findFirst();
      if (channelConfig?.automationMode === 'approval') {
        await this.updateStage(contentId, 'validation', 'awaiting_approval');
      } else {
        await this.uploadToYouTube(contentId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await prisma.content.update({
        where: { id: contentId },
        data: { status: 'failed', errorMessage: message, retryCount: { increment: 1 } },
      });
      throw error;
    }
  }

  async regenerateStage(contentId: string, stage: string): Promise<void> {
    const stageHandlers: Record<string, () => Promise<void>> = {
      script: () => this.generateScript(contentId),
      scenes: () => this.generateScenes(contentId),
      characters: () => this.generateCharacters(contentId),
      voice: () => this.generateVoice(contentId),
      rendering: () => this.renderVideo(contentId),
      thumbnail: () => this.generateThumbnail(contentId),
    };

    const handler = stageHandlers[stage];
    if (!handler) throw new Error(`Cannot regenerate stage: ${stage}`);

    await handler();

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    if (content.status === 'awaiting_approval') {
      await this.validateContent(contentId);
    }
  }

  private async updateStage(contentId: string, stage: string, status?: string) {
    await prisma.content.update({
      where: { id: contentId },
      data: {
        currentStage: stage,
        ...(status ? { status } : {}),
      },
    });
  }

  private async logJob(contentId: string, jobType: string, status: string, message?: string) {
    await prisma.jobLog.create({
      data: { contentId, jobType, status, message },
    });
  }
}

export const pipelineService = new PipelineService();

export async function handleContentGeneration(job: ContentGenerationJob) {
  if (job.stage === 'rendering') {
    await pipelineService.resumeFromRendering(job.contentId);
    return;
  }
  await pipelineService.processContent(job.contentId);
}

export async function handleDailyPipeline(job: DailyPipelineJob) {
  await pipelineService.runDailyPipeline(job);
}

export async function handleAnalytics() {
  const published = await prisma.content.findMany({
    where: { youtubeVideoId: { not: null }, status: { in: ['scheduled', 'published'] } },
    include: { analytics: true },
  });

  for (const content of published) {
    if (!content.youtubeVideoId) continue;

    try {
      const stats = await youtubeService.getAnalytics(content.youtubeVideoId);
      if (!stats) continue;

      await prisma.analytics.upsert({
        where: { contentId: content.id },
        create: {
          contentId: content.id,
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
        },
        update: {
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
          collectedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error(`Analytics collection failed for ${content.id}`, error);
    }
  }
}
