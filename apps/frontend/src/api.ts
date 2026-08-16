export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

/** Resolve storage/media paths when frontend is hosted separately from the API */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'API request failed');
  }
  return res.json();
}

export const api = {
  getDashboard: () => fetchApi<DashboardStatus>('/dashboard/status'),
  getCalendar: (days = 7) => fetchApi<CalendarEntry[]>(`/dashboard/calendar?days=${days}`),
  getContent: (params?: { status?: string; type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    return fetchApi<{ contents: ContentItem[]; total: number }>(`/dashboard/content?${query}`);
  },
  getContentById: (id: string) => fetchApi<ContentDetail>(`/dashboard/content/${id}`),
  generateContent: (type: 'long' | 'short') =>
    fetchApi('/dashboard/content/generate', { method: 'POST', body: JSON.stringify({ type }) }),
  approveContent: (id: string) =>
    fetchApi(`/dashboard/content/${id}/approve`, { method: 'POST' }),
  regenerateStage: (id: string, stage: string) =>
    fetchApi(`/dashboard/content/${id}/regenerate/${stage}`, { method: 'POST' }),
  retryContent: (id: string) =>
    fetchApi(`/dashboard/content/${id}/retry`, { method: 'POST' }),
  triggerPipeline: () =>
    fetchApi('/dashboard/pipeline/trigger', { method: 'POST' }),
  getConfig: () => fetchApi<ChannelConfig>('/config'),
  getSystemStatus: () => fetchApi<SystemStatus>('/config/system-status'),
  updateConfig: (data: Partial<ChannelConfig>) =>
    fetchApi<ChannelConfig>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  getYouTubeStatus: () => fetchApi<{ configured: boolean; authenticated: boolean; redirectUri?: string; setupHint?: string }>('/youtube/status'),
  getYouTubeAuth: () => fetchApi<{ authUrl: string }>('/youtube/auth'),
  getCharacters: () => fetchApi<Character[]>('/youtube/characters'),
};

export interface ContentItem {
  id: string;
  type: string;
  title: string;
  category: string;
  status: string;
  currentStage: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  youtubeVideoId?: string;
  scheduledAt?: string;
  createdAt: string;
  analytics?: { views: number; likes: number; comments: number };
}

export interface ContentDetail extends ContentItem {
  errorMessage?: string;
  script?: Record<string, unknown>;
  scenes?: Record<string, unknown>[];
  jobLogs?: { jobType: string; status: string; message?: string; createdAt: string }[];
}

export interface DashboardStatus {
  today: { longVideo: ContentItem | null; short: ContentItem | null };
  recentContent: ContentItem[];
  stats: {
    totalVideos: number;
    totalShorts: number;
    publishedToday: number;
    failedJobs: number;
    pendingApproval: number;
    totalViews: number;
  };
  queueStats: { name: string; waiting: number; active: number; completed: number; failed: number }[];
}

export interface CalendarEntry {
  date: string;
  dayOfWeek: string;
  longVideo?: ContentItem;
  short?: ContentItem;
}

export interface ChannelConfig {
  id: string;
  channelName: string;
  targetAge: string;
  contentCategories: string[];
  longVideoTime: string;
  shortVideoTime: string;
  videoDurationMin: number;
  videoDurationMax: number;
  visualStyle: string;
  voiceStyle: string;
  language: string;
  automationMode: string;
  llmProvider: string;
  imageProvider: string;
  ttsProvider: string;
  musicProvider: string;
  timezone: string;
  youtubeConnected: boolean;
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

export interface SystemStatus {
  hosting: {
    freeTier: boolean;
    environment: string;
    memoryLimit: string;
    storageNote: string;
    cronConfigured: boolean;
  };
  openai: {
    configured: boolean;
    activeProvider: string;
    status: 'ok' | 'error' | 'not_configured' | 'mock';
    message: string;
    limitsNote: string;
    usageUrl: string;
  };
  pipeline: {
    jobsPending: number;
    jobsProcessing: number;
    jobsFailed: number;
    stuckRendering: number;
    recentErrors: { contentId: string; title: string; error: string; stage: string }[];
  };
  freeTierLimits: {
    maxVideoSeconds: number;
    maxScenes: number;
    renderResolution: string;
    renderTimeoutSeconds: number;
    whyStuck: string[];
  };
}
