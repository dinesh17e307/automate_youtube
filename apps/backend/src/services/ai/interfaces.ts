import type { TopicCandidate, Script, Scene, Character, ContentCategory } from '@kids-youtube/shared';

export interface LlmProvider {
  name: string;
  generateTopics(params: {
    categories: ContentCategory[];
    previousTopics: string[];
    seasonality?: string;
    performanceHints?: { category: string; avgRetention: number }[];
    count?: number;
  }): Promise<TopicCandidate[]>;
  generateScript(params: {
    topic: TopicCandidate;
    targetAge: string;
    durationMin: number;
    durationMax: number;
    language: string;
    visualStyle: string;
  }): Promise<Script>;
  generateScenes(params: {
    script: Script;
    characters: Character[];
    targetDuration: number;
    visualStyle: string;
  }): Promise<Scene[]>;
  generateShortScript(params: {
    longScript?: Script;
    category: ContentCategory;
    targetAge: string;
  }): Promise<Script>;
  validateContent(params: {
    script: Script;
    scenes: Scene[];
  }): Promise<{ passed: boolean; issues: string[] }>;
}

export interface ImageProvider {
  name: string;
  generateImage(prompt: string, options?: { width?: number; height?: number; style?: string }): Promise<string>;
  generateCharacterReference(character: Character, style: string): Promise<string>;
}

export interface TtsProvider {
  name: string;
  synthesize(text: string, voiceId: string, options?: { speed?: number }): Promise<string>;
}

export interface MusicProvider {
  name: string;
  generateBackgroundMusic(description: string, durationSeconds: number): Promise<string>;
  getSoundEffect(name: string): Promise<string | null>;
}

export interface VideoProvider {
  name: string;
  generateSceneVideo?(prompt: string, durationSeconds: number): Promise<string>;
}
