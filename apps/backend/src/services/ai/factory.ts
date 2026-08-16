import { createLlmProvider } from './providers/llm-factory';
import { createImageProvider, createTtsProvider, createMusicProvider } from './providers/mock-media';
import { prisma } from '../../db';
import type { LlmProvider, ImageProvider, TtsProvider, MusicProvider } from './interfaces';

export interface AiProviders {
  llm: LlmProvider;
  image: ImageProvider;
  tts: TtsProvider;
  music: MusicProvider;
}

let cachedProviders: AiProviders | null = null;

export async function getAiProviders(): Promise<AiProviders> {
  if (cachedProviders) return cachedProviders;

  const channelConfig = await prisma.channelConfig.findFirst();
  const llmName = channelConfig?.llmProvider || 'mock';
  const imageName = channelConfig?.imageProvider || 'mock';
  const ttsName = channelConfig?.ttsProvider || 'mock';
  const musicName = channelConfig?.musicProvider || 'mock';

  cachedProviders = {
    llm: createLlmProvider(llmName),
    image: createImageProvider(imageName),
    tts: createTtsProvider(ttsName),
    music: createMusicProvider(musicName),
  };

  return cachedProviders;
}

export function clearProviderCache() {
  cachedProviders = null;
}
