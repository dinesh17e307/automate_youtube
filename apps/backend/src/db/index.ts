import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error' as never, (e: unknown) => logger.error('Prisma error', e));
prisma.$on('warn' as never, (e: unknown) => logger.warn('Prisma warning', e));

export async function ensureDefaultConfig() {
  const existing = await prisma.channelConfig.findFirst();
  if (!existing) {
    await prisma.channelConfig.create({
      data: {
        videoDurationMin: config.defaultVideoDurationMin,
        videoDurationMax: config.defaultVideoDurationMax,
      },
    });
    logger.info('Created default channel configuration');
  } else if (config.freeTier) {
    // Cap durations on free tier to save memory/time
    await prisma.channelConfig.update({
      where: { id: existing.id },
      data: {
        videoDurationMin: Math.min(existing.videoDurationMin, config.defaultVideoDurationMin),
        videoDurationMax: Math.min(existing.videoDurationMax, config.defaultVideoDurationMax),
      },
    });
  }
}

export async function ensureDefaultCharacters() {
  const count = await prisma.character.count();
  if (count === 0) {
    await prisma.character.createMany({
      data: [
        {
          name: 'Bunny',
          description: 'A friendly cartoon rabbit who loves to sing and dance',
          appearance: 'Cute white cartoon rabbit with pink ears and large friendly eyes',
          clothing: 'Blue shirt with yellow star',
          colors: 'White, pink, blue, yellow',
          personality: 'Happy, curious and friendly',
          voiceId: 'bunny',
          voiceDescription: 'Child-friendly, high-energy female voice',
        },
        {
          name: 'Ellie',
          description: 'A gentle baby elephant who teaches counting and colors',
          appearance: 'Small gray baby elephant with big floppy ears and a tiny trunk',
          clothing: 'Red bow on head',
          colors: 'Gray, red, pink',
          personality: 'Gentle, patient and encouraging',
          voiceId: 'ellie',
          voiceDescription: 'Deep but friendly, warm voice',
        },
        {
          name: 'Sunny',
          description: 'A cheerful sun character who introduces topics',
          appearance: 'Bright yellow sun with a smiling face and orange rays',
          clothing: 'None',
          colors: 'Yellow, orange',
          personality: 'Energetic, welcoming and enthusiastic',
          voiceId: 'sunny',
          voiceDescription: 'Friendly adult narrator voice',
        },
      ],
    });
    logger.info('Created default characters');
  }
}
