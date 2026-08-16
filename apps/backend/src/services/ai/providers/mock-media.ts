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

/** PPM image — FFmpeg-compatible, no native deps */
function createPpmBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }
  return Buffer.concat([header, pixels]);
}

const PALETTE: [number, number, number][] = [
  [255, 107, 107], [78, 205, 196], [69, 183, 209], [150, 206, 180], [255, 234, 167],
];

export class MockImageProvider implements ImageProvider {
  name = 'mock';

  async generateImage(prompt: string, options?: { width?: number; height?: number }): Promise<string> {
    const dir = path.join(config.storagePath, 'images');
    await ensureDir(dir);
    const filename = `${uuid()}.ppm`;
    const filepath = path.join(dir, filename);

    let w = options?.width || 1920;
    let h = options?.height || 1080;
    if (config.freeTier) {
      w = Math.min(w, 854);
      h = Math.min(h, 480);
    }

    const [r, g, b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const buffer = createPpmBuffer(w, h, r, g, b);
    await fs.writeFile(filepath, buffer);
    logger.debug(`Generated PPM image ${w}x${h}: ${prompt.substring(0, 40)}...`);
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
