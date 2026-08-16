import type { LlmProvider } from '../interfaces';
import type { TopicCandidate, Script, Scene } from '@kids-youtube/shared';
import { MockLlmProvider } from './mock-llm';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { logProviderFallback } from '../provider-errors';

export class GeminiLlmProvider implements LlmProvider {
  name = 'gemini';
  private fallback = new MockLlmProvider();

  private get apiKey(): string {
    return config.geminiApiKey;
  }

  private async chat(system: string, user: string): Promise<string> {
    if (!this.apiKey) return '';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private async withFallback<T>(
    label: string,
    fn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (!this.apiKey) {
      logger.warn('GEMINI_API_KEY not configured, using mock LLM provider');
      return fallbackFn();
    }

    try {
      return await fn();
    } catch (error) {
      logProviderFallback('gemini', label, error);
      return fallbackFn();
    }
  }

  async generateTopics(params: Parameters<LlmProvider['generateTopics']>[0]): Promise<TopicCandidate[]> {
    return this.withFallback('topic generation', async () => {
      const result = await this.chat(
        'You are a kids YouTube content strategist. Generate topic ideas for children ages 2-6. Return JSON with key "topics" containing array of {title, category, description, score, reason}. Content must be original, age-appropriate, and never use copyrighted material.',
        `Generate ${params.count || 5} topic ideas. Categories: ${params.categories.join(', ')}. Avoid these previous topics: ${params.previousTopics.join(', ')}. Performance hints: ${JSON.stringify(params.performanceHints || [])}`
      );
      const parsed = JSON.parse(result);
      return parsed.topics || await this.fallback.generateTopics(params);
    }, () => this.fallback.generateTopics(params));
  }

  async generateScript(params: Parameters<LlmProvider['generateScript']>[0]): Promise<Script> {
    return this.withFallback('script generation', async () => {
      const result = await this.chat(
        'You are a children\'s content writer. Write original, cheerful scripts for kids videos. Simple English, short sentences, positive language, interactive elements. No scary, violent, or inappropriate content. Return JSON with keys: title, description, lyrics, learningObjective, tags (array), thumbnailPrompt, musicRequirements.',
        `Write a script for: "${params.topic.title}" (${params.topic.category}). Target age: ${params.targetAge}. Duration: ${params.durationMin}-${params.durationMax} seconds. Language: ${params.language}. Visual style: ${params.visualStyle}.`
      );
      return JSON.parse(result);
    }, () => this.fallback.generateScript(params));
  }

  async generateScenes(params: Parameters<LlmProvider['generateScenes']>[0]): Promise<Scene[]> {
    return this.withFallback('scene generation', async () => {
      const result = await this.chat(
        'You are a kids video director. Break scripts into scenes. Return JSON with key "scenes" containing array of {sceneNumber, title, durationSeconds, characters: [{characterId, name, action}], dialogue, background, music, cameraMovement, transition, visualPrompt}.',
        `Script: ${JSON.stringify(params.script)}. Characters: ${JSON.stringify(params.characters)}. Target duration: ${params.targetDuration}s. Style: ${params.visualStyle}.`
      );
      const parsed = JSON.parse(result);
      return parsed.scenes || await this.fallback.generateScenes(params);
    }, () => this.fallback.generateScenes(params));
  }

  async generateShortScript(params: Parameters<LlmProvider['generateShortScript']>[0]): Promise<Script> {
    return this.withFallback('short script generation', async () => {
      const result = await this.chat(
        'Create a 15-60 second YouTube Short script for kids. Original content only. Return JSON with keys: title, description, lyrics, learningObjective, tags, thumbnailPrompt, musicRequirements.',
        `Category: ${params.category}. Target age: ${params.targetAge}. ${params.longScript ? `Based on: ${params.longScript.title}` : 'Create standalone short.'}`
      );
      return JSON.parse(result);
    }, () => this.fallback.generateShortScript(params));
  }

  async validateContent(params: Parameters<LlmProvider['validateContent']>[0]): Promise<{ passed: boolean; issues: string[] }> {
    return this.withFallback('validation', async () => {
      const result = await this.chat(
        'You are a children\'s content safety reviewer. Check for age-appropriateness, violence, scary content, inappropriate language, personal data requests, copyright risks. Return JSON with keys: passed (boolean), issues (string array).',
        `Review this content:\nScript: ${JSON.stringify(params.script)}\nScenes: ${JSON.stringify(params.scenes)}`
      );
      return JSON.parse(result);
    }, () => this.fallback.validateContent(params));
  }
}
