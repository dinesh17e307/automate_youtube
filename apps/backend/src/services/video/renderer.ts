import { ffmpeg, initFfmpeg } from './ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Scene, Script } from '@kids-youtube/shared';
import { config } from '../../config';
import { logger } from '../../utils/logger';

interface RenderOptions {
  scenes: Scene[];
  sceneImages: string[];
  voiceFiles: string[];
  musicFile?: string;
  script: Script;
  format: 'long' | 'short';
  outputDir?: string;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function resolveStoragePath(urlPath: string): string {
  if (urlPath.startsWith('/storage/')) {
    return path.join(config.storagePath, urlPath.replace('/storage/', ''));
  }
  return urlPath;
}

function getDimensions(format: 'long' | 'short') {
  return format === 'short'
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .substring(0, 80);
}

export async function renderVideo(options: RenderOptions): Promise<string> {
  initFfmpeg();
  const { scenes, sceneImages, voiceFiles, musicFile, script, format } = options;
  const { width, height } = getDimensions(format);
  const outputDir = options.outputDir || path.join(config.storagePath, 'videos');
  await ensureDir(outputDir);

  const outputFilename = `${uuid()}.mp4`;
  const outputPath = path.join(outputDir, outputFilename);
  const tempDir = path.join(config.storagePath, 'temp', uuid());
  await ensureDir(tempDir);

  try {
    const segmentPaths: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imagePath = resolveStoragePath(sceneImages[i] || sceneImages[0]);
      const voicePath = voiceFiles[i] ? resolveStoragePath(voiceFiles[i]) : null;
      const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
      const duration = scene.durationSeconds;

      const subtitle = escapeDrawtext(scene.dialogue);

      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg(imagePath)
          .inputOptions(['-loop 1'])
          .duration(duration)
          .videoFilters([
            `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x87CEEB`,
            `drawtext=text='${subtitle}':fontsize=${format === 'short' ? 36 : 28}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-120`,
          ])
          .outputOptions(['-c:v libx264', '-tune stillimage', '-pix_fmt yuv420p', '-r 30']);

        if (voicePath) {
          cmd = cmd.input(voicePath).outputOptions(['-c:a aac', '-b:a 128k', '-shortest']);
        } else {
          cmd = cmd.outputOptions(['-an']);
        }

        cmd
          .output(segmentPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      segmentPaths.push(segmentPath);
    }

    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatContent = segmentPaths.map((p) => `file '${p}'`).join('\n');
    await fs.writeFile(concatListPath, concatContent);

    const concatPath = path.join(tempDir, 'concatenated.mp4');

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(concatPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    if (musicFile) {
      const musicPath = resolveStoragePath(musicFile);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatPath)
          .input(musicPath)
          .complexFilter([
            '[1:a]volume=0.15[music]',
            '[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]',
          ])
          .outputOptions(['-map 0:v', '-map [aout]', '-c:v copy', '-c:a aac', '-shortest'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', () => {
            fs.copyFile(concatPath, outputPath).then(() => resolve()).catch(reject);
          })
          .run();
      });
    } else {
      await fs.copyFile(concatPath, outputPath);
    }

    logger.info(`Video rendered: ${outputFilename} (${format})`);
    return `/storage/videos/${outputFilename}`;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generateThumbnail(
  imagePath: string,
  title: string,
  format: 'long' | 'short' = 'long'
): Promise<string> {
  initFfmpeg();
  const { width, height } = getDimensions(format);
  const outputDir = path.join(config.storagePath, 'thumbnails');
  await ensureDir(outputDir);

  const filename = `thumb_${uuid()}.jpg`;
  const outputPath = path.join(outputDir, filename);
  const resolvedImage = resolveStoragePath(imagePath);
  const shortTitle = escapeDrawtext(title.split('|')[0].trim().substring(0, 30));

  await new Promise<void>((resolve, reject) => {
    ffmpeg(resolvedImage)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        `drawtext=text='${shortTitle}':fontsize=${format === 'short' ? 48 : 56}:fontcolor=yellow:borderw=4:bordercolor=black:x=(w-text_w)/2:y=80`,
      ])
      .outputOptions(['-frames:v 1', '-q:v 2'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  return `/storage/thumbnails/${filename}`;
}
