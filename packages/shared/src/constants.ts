export const CONTENT_CATEGORIES = [
  'nursery_rhymes',
  'kids_songs',
  'educational_rhymes',
  'alphabet_learning',
  'numbers_counting',
  'colors',
  'shapes',
  'animals',
  'fruits_vegetables',
  'good_habits',
  'moral_stories',
  'simple_science',
  'general_knowledge',
  'action_songs',
  'bedtime_stories',
  'festival_seasonal',
] as const;

export const PIPELINE_STAGES = [
  'idea',
  'script',
  'scenes',
  'characters',
  'voice',
  'music',
  'rendering',
  'thumbnail',
  'validation',
  'uploaded',
  'published',
] as const;

export const CONTENT_STATUSES = [
  'pending',
  'generating',
  'completed',
  'failed',
  'scheduled',
  'published',
  'rejected',
  'awaiting_approval',
] as const;

export const AUTOMATION_MODES = ['fully_automatic', 'approval'] as const;

export const VIDEO_FORMATS = {
  long: { width: 1920, height: 1080, aspectRatio: '16:9' },
  short: { width: 1080, height: 1920, aspectRatio: '9:16' },
} as const;

export const DEFAULT_SCHEDULE = {
  longVideoTime: '18:00',
  shortVideoTime: '20:00',
  timezone: 'UTC',
} as const;
