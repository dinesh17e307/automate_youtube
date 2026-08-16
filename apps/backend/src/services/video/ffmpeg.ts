import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../../utils/logger';

let ffmpegReady = false;

export function initFfmpeg(): boolean {
  if (ffmpegReady) return true;

  try {
    // Bundled binary — works on Render free tier without system FFmpeg
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg') as { path: string };
    ffmpeg.setFfmpegPath(installer.path);
    ffmpegReady = true;
    logger.info('FFmpeg initialized from bundled binary');
    return true;
  } catch {
    logger.warn('Bundled FFmpeg not available, trying system ffmpeg');
    ffmpegReady = true;
    return true;
  }
}

export { ffmpeg };
