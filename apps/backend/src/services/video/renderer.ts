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

const FFMPEG_TIMEOUT_MS = config.freeTier ? 120_000 : 300_000;

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
  if (config.freeTier) {
    return format === 'short' ? { width: 480, height: 854 } : { width: 854, height: 480 };
  }
  return format === 'short' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

function runFfmpeg(command: ffmpeg.FfmpegCommand, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { command.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`FFmpeg timeout after ${FFMPEG_TIMEOUT_MS / 1000}s (${label})`));
    }, FFMPEG_TIMEOUT_MS);

    command
      .on('end', () => { clearTimeout(timer); resolve(); })
      .on('error', (err) => { clearTimeout(timer); reject(err); })
      .run();
  });
}

export async function renderVideo(options: RenderOptions): Promise<string> {
  initFfmpeg();
  const { scenes, sceneImages, voiceFiles, musicFile, format } = options;
  const { width, height } = getDimensions(format);
  const outputDir = options.outputDir || path.join(config.storagePath, 'videos');
  await ensureDir(outputDir);

  const outputFilename = `${uuid()}.mp4`;
  const outputPath = path.join(outputDir, outputFilename);
  const tempDir = path.join(config.storagePath, 'temp', uuid());
  await ensureDir(tempDir);

  logger.info(`Rendering ${scenes.length} scenes at ${width}x${height} (freeTier=${config.freeTier})`);

  try {
    const segmentPaths: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imagePath = resolveStoragePath(sceneImages[i] || sceneImages[0]);
      const voicePath = voiceFiles[i] ? resolveStoragePath(voiceFiles[i]) : null;
      const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
      const duration = Math.min(scene.durationSeconds, config.freeTier ? 20 : scene.durationSeconds);

      // Free tier: skip drawtext — requires fonts not available on Render
      const videoFilters = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x87CEEB`,
      ];

      let cmd = ffmpeg(imagePath)
        .inputOptions(['-loop 1'])
        .duration(duration)
        .videoFilters(videoFilters)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'stillimage',
          '-pix_fmt', 'yuv420p',
          '-r', '24',
        ]);

      if (voicePath) {
        cmd = cmd.input(voicePath).outputOptions(['-c:a', 'aac', '-b:a', '96k', '-shortest']);
      } else {
        cmd = cmd.outputOptions(['-an']);
      }

      cmd.output(segmentPath);
      await runFfmpeg(cmd, `segment ${i + 1}/${scenes.length}`);
      segmentPaths.push(segmentPath);
      logger.info(`Rendered segment ${i + 1}/${scenes.length}`);
    }

    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatContent = segmentPaths.map((p) => `file '${p}'`).join('\n');
    await fs.writeFile(concatListPath, concatContent);

    const concatPath = path.join(tempDir, 'concatenated.mp4');

    const concatCmd = ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(concatPath);

    await runFfmpeg(concatCmd, 'concat');

    if (musicFile) {
      const musicPath = resolveStoragePath(musicFile);
      try {
        const mixCmd = ffmpeg()
          .input(concatPath)
          .input(musicPath)
          .complexFilter([
            '[1:a]volume=0.12[music]',
            '[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]',
          ])
          .outputOptions(['-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest'])
          .output(outputPath);
        await runFfmpeg(mixCmd, 'music mix');
      } catch {
        logger.warn('Music mix failed, using video without background music');
        await fs.copyFile(concatPath, outputPath);
      }
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

  const thumbCmd = ffmpeg(resolvedImage)
    .videoFilters([
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
    ])
    .outputOptions(['-frames:v', '1', '-q:v', '5'])
    .output(outputPath);

  await runFfmpeg(thumbCmd, 'thumbnail');
  return `/storage/thumbnails/${filename}`;
}
