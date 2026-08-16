import type { LlmProvider } from '../interfaces';
import { OpenAiLlmProvider } from './openai-llm';
import { GeminiLlmProvider } from './gemini-llm';
import { MockLlmProvider } from './mock-llm';

export function createLlmProvider(name: string): LlmProvider {
  switch (name) {
    case 'openai':
      return new OpenAiLlmProvider();
    case 'gemini':
      return new GeminiLlmProvider();
    default:
      return new MockLlmProvider();
  }
}
