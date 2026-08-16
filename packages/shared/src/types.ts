import type {
  CONTENT_CATEGORIES,
  PIPELINE_STAGES,
  CONTENT_STATUSES,
  AUTOMATION_MODES,
} from './constants';

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type AutomationMode = (typeof AUTOMATION_MODES)[number];
export type ContentType = 'long' | 'short';

export interface ChannelConfig {
  id: string;
  channelName: string;
  targetAge: string;
  contentCategories: ContentCategory[];
  longVideoTime: string;
  shortVideoTime: string;
  videoDurationMin: number;
  videoDurationMax: number;
  visualStyle: string;
  voiceStyle: string;
  language: string;
  automationMode: AutomationMode;
  aiProviders: AiProviderConfig;
  youtubeChannelId?: string;
  timezone: string;
}

export interface AiProviderConfig {
  llm: string;
  image: string;
  video: string;
  tts: string;
  music: string;
}

export interface TopicCandidate {
  title: string;
  category: ContentCategory;
  description: string;
  score: number;
  reason: string;
}

export interface Script {
  title: string;
  description: string;
  lyrics: string;
  learningObjective: string;
  tags: string[];
  thumbnailPrompt: string;
  musicRequirements: string;
}

export interface SceneCharacter {
  characterId: string;
  name: string;
  action: string;
}

export interface Scene {
  sceneNumber: number;
  title: string;
  durationSeconds: number;
  characters: SceneCharacter[];
  dialogue: string;
  narrator?: string;
  background: string;
  music: string;
  cameraMovement?: string;
  transition?: string;
  visualPrompt: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  appearance: string;
  clothing: string;
  colors: string;
  personality: string;
  referenceImageUrl?: string;
  voiceId: string;
  voiceDescription: string;
}

export interface ContentMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  madeForKids: boolean;
  visibility: 'public' | 'private' | 'unlisted';
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  overallScore: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AnalyticsData {
  views: number;
  watchTimeMinutes: number;
  averageViewDuration: number;
  impressions: number;
  ctr: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  audienceRetention?: number[];
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  category: ContentCategory;
  status: ContentStatus;
  currentStage: PipelineStage;
  script?: Script;
  scenes?: Scene[];
  characters?: Character[];
  metadata?: ContentMetadata;
  videoUrl?: string;
  thumbnailUrl?: string;
  youtubeVideoId?: string;
  publishDate?: string;
  scheduledAt?: string;
  analytics?: AnalyticsData;
  parentContentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStatus {
  today: {
    longVideo: ContentItem | null;
    short: ContentItem | null;
  };
  calendar: CalendarEntry[];
  recentContent: ContentItem[];
}

export interface CalendarEntry {
  date: string;
  dayOfWeek: string;
  longVideo?: { title: string; category: ContentCategory; status: ContentStatus };
  short?: { title: string; category: ContentCategory; status: ContentStatus };
}

export interface DashboardStats {
  totalVideos: number;
  totalShorts: number;
  publishedToday: number;
  failedJobs: number;
  pendingApproval: number;
  totalViews: number;
  topCategories: { category: ContentCategory; avgRetention: number }[];
}
