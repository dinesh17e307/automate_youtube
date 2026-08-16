import OpenAI from 'openai';
import type { LlmProvider } from '../interfaces';
import type { TopicCandidate, Script, Scene, Character, ContentCategory } from '@kids-youtube/shared';
import { MockLlmProvider } from './mock-llm';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

export class OpenAiLlmProvider implements LlmProvider {
  name = 'openai';
  private client: OpenAI | null;
  private fallback: MockLlmProvider;

  constructor() {
    this.client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
    this.fallback = new MockLlmProvider();
    if (!this.client) {
      logger.warn('OpenAI API key not configured, using mock LLM provider');
    }
  }

  private async chat(system: string, user: string): Promise<string> {
    if (!this.client) return '';
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });
    return response.choices[0]?.message?.content || '';
  }

  async generateTopics(params: Parameters<LlmProvider['generateTopics']>[0]): Promise<TopicCandidate[]> {
    if (!this.client) return this.fallback.generateTopics(params);

    try {
      const result = await this.chat(
        'You are a kids YouTube content strategist. Generate topic ideas for children ages 2-6. Return JSON with key "topics" containing array of {title, category, description, score, reason}. Content must be original, age-appropriate, and never use copyrighted material.',
        `Generate ${params.count || 5} topic ideas. Categories: ${params.categories.join(', ')}. Avoid these previous topics: ${params.previousTopics.join(', ')}. Performance hints: ${JSON.stringify(params.performanceHints || [])}`
      );
      const parsed = JSON.parse(result);
      return parsed.topics || await this.fallback.generateTopics(params);
    } catch (error) {
      logger.error('OpenAI topic generation failed, using fallback', error);
      return this.fallback.generateTopics(params);
    }
  }

  async generateScript(params: Parameters<LlmProvider['generateScript']>[0]): Promise<Script> {
    if (!this.client) return this.fallback.generateScript(params);

    try {
      const result = await this.chat(
        'You are a children\'s content writer. Write original, cheerful scripts for kids videos. Simple English, short sentences, positive language, interactive elements. No scary, violent, or inappropriate content. Return JSON with keys: title, description, lyrics, learningObjective, tags (array), thumbnailPrompt, musicRequirements.',
        `Write a script for: "${params.topic.title}" (${params.topic.category}). Target age: ${params.targetAge}. Duration: ${params.durationMin}-${params.durationMax} seconds. Language: ${params.language}. Visual style: ${params.visualStyle}.`
      );
      return JSON.parse(result);
    } catch (error) {
      logger.error('OpenAI script generation failed, using fallback', error);
      return this.fallback.generateScript(params);
    }
  }

  async generateScenes(params: Parameters<LlmProvider['generateScenes']>[0]): Promise<Scene[]> {
    if (!this.client) return this.fallback.generateScenes(params);

    try {
      const result = await this.chat(
        'You are a kids video director. Break scripts into scenes. Return JSON with key "scenes" containing array of {sceneNumber, title, durationSeconds, characters: [{characterId, name, action}], dialogue, background, music, cameraMovement, transition, visualPrompt}.',
        `Script: ${JSON.stringify(params.script)}. Characters: ${JSON.stringify(params.characters)}. Target duration: ${params.targetDuration}s. Style: ${params.visualStyle}.`
      );
      const parsed = JSON.parse(result);
      return parsed.scenes || await this.fallback.generateScenes(params);
    } catch (error) {
      logger.error('OpenAI scene generation failed, using fallback', error);
      return this.fallback.generateScenes(params);
    }
  }

  async generateShortScript(params: Parameters<LlmProvider['generateShortScript']>[0]): Promise<Script> {
    if (!this.client) return this.fallback.generateShortScript(params);

    try {
      const result = await this.chat(
        'Create a 15-60 second YouTube Short script for kids. Original content only. Return JSON with keys: title, description, lyrics, learningObjective, tags, thumbnailPrompt, musicRequirements.',
        `Category: ${params.category}. Target age: ${params.targetAge}. ${params.longScript ? `Based on: ${params.longScript.title}` : 'Create standalone short.'}`
      );
      return JSON.parse(result);
    } catch (error) {
      logger.error('OpenAI short script generation failed, using fallback', error);
      return this.fallback.generateShortScript(params);
    }
  }

  async validateContent(params: Parameters<LlmProvider['validateContent']>[0]): Promise<{ passed: boolean; issues: string[] }> {
    if (!this.client) return this.fallback.validateContent(params);

    try {
      const result = await this.chat(
        'You are a children\'s content safety reviewer. Check for age-appropriateness, violence, scary content, inappropriate language, personal data requests, copyright risks. Return JSON with keys: passed (boolean), issues (string array).',
        `Review this content:\nScript: ${JSON.stringify(params.script)}\nScenes: ${JSON.stringify(params.scenes)}`
      );
      return JSON.parse(result);
    } catch (error) {
      logger.error('OpenAI validation failed, using fallback', error);
      return this.fallback.validateContent(params);
    }
  }
}

export function createLlmProvider(name: string): LlmProvider {
  switch (name) {
    case 'openai':
      return new OpenAiLlmProvider();
    default:
      return new MockLlmProvider();
  }
}
