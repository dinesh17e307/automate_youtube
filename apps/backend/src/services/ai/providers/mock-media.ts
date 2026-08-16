import type { ImageProvider, TtsProvider, MusicProvider } from '../interfaces';
import type { Character } from '@kids-youtube/shared';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export class MockImageProvider implements ImageProvider {
  name = 'mock';

  async generateImage(prompt: string, options?: { width?: number; height?: number }): Promise<string> {
    const dir = path.join(config.storagePath, 'images');
    await ensureDir(dir);
    const filename = `${uuid()}.svg`;
    const filepath = path.join(dir, filename);

    const w = options?.width || 1920;
    const h = options?.height || 1080;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    const bg = colors[Math.floor(Math.random() * colors.length)];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" fill="${bg}"/>
      <circle cx="${w / 2}" cy="${h / 2 - 50}" r="120" fill="#FFF" opacity="0.9"/>
      <text x="${w / 2}" y="${h / 2 + 150}" text-anchor="middle" font-family="Arial" font-size="32" fill="#333">
        Kids Content Scene
      </text>
      <text x="${w / 2}" y="${h / 2 + 200}" text-anchor="middle" font-family="Arial" font-size="18" fill="#666">
        ${prompt.substring(0, 60).replace(/[<>&]/g, '')}...
      </text>
    </svg>`;

    await fs.writeFile(filepath, svg);
    return `/storage/images/${filename}`;
  }

  async generateCharacterReference(character: Character, style: string): Promise<string> {
    return this.generateImage(`${style}, character reference: ${character.appearance}, ${character.clothing}`, { width: 512, height: 512 });
  }
}

export class MockTtsProvider implements TtsProvider {
  name = 'mock';

  async synthesize(text: string, voiceId: string): Promise<string> {
    const dir = path.join(config.storagePath, 'audio');
    await ensureDir(dir);
    const filename = `${uuid()}.wav`;
    const filepath = path.join(dir, filename);

    const duration = Math.max(text.length * 0.06, 1);
    const sampleRate = 22050;
    const numSamples = Math.floor(duration * sampleRate);
    const buffer = Buffer.alloc(44 + numSamples * 2);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = voiceId === 'ellie' ? 150 : voiceId === 'bunny' ? 300 : 220;
      const sample = Math.sin(2 * Math.PI * freq * t) * 0.3 * (1 - t / duration);
      buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
    }

    await fs.writeFile(filepath, buffer);
    logger.debug(`Generated mock TTS audio for voice ${voiceId}: ${text.substring(0, 50)}...`);
    return `/storage/audio/${filename}`;
  }
}

export class MockMusicProvider implements MusicProvider {
  name = 'mock';

  async generateBackgroundMusic(description: string, durationSeconds: number): Promise<string> {
    const dir = path.join(config.storagePath, 'audio');
    await ensureDir(dir);
    const filename = `music_${uuid()}.wav`;
    const filepath = path.join(dir, filename);

    const sampleRate = 22050;
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const buffer = Buffer.alloc(44 + numSamples * 2);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    const notes = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(t * 2) % notes.length;
      const sample = Math.sin(2 * Math.PI * notes[noteIdx] * t) * 0.15;
      buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
    }

    await fs.writeFile(filepath, buffer);
    logger.debug(`Generated mock background music: ${description}`);
    return `/storage/audio/${filename}`;
  }

  async getSoundEffect(name: string): Promise<string | null> {
    logger.debug(`Sound effect requested: ${name}`);
    return null;
  }
}

export function createImageProvider(name: string): ImageProvider {
  return new MockImageProvider();
}

export function createTtsProvider(name: string): TtsProvider {
  return new MockTtsProvider();
}

export function createMusicProvider(name: string): MusicProvider {
  return new MockMusicProvider();
}
