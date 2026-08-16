/** Resolve the public app URL for OAuth redirects (Render, Vercel, local). */
export function resolvePublicUrl(): string | undefined {
  const candidates = [
    process.env.YOUTUBE_REDIRECT_URI?.replace(/\/api\/youtube\/callback\/?$/, ''),
    process.env.RENDER_EXTERNAL_URL,
    process.env.APP_URL,
    process.env.PUBLIC_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN?.split(',')[0]?.trim(),
  ];

  for (const url of candidates) {
    if (!url) continue;
    const normalized = url.replace(/\/$/, '');
    if (!normalized.includes('localhost') && !normalized.includes('127.0.0.1')) {
      return normalized;
    }
  }

  return undefined;
}

export function resolveYoutubeRedirectUri(): string {
  if (process.env.YOUTUBE_REDIRECT_URI) {
    return process.env.YOUTUBE_REDIRECT_URI;
  }

  const publicUrl = resolvePublicUrl();
  if (publicUrl) {
    return `${publicUrl}/api/youtube/callback`;
  }

  const port = process.env.PORT || '3001';
  return `http://localhost:${port}/api/youtube/callback`;
}

export function resolveFrontendUrl(): string {
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }

  const publicUrl = resolvePublicUrl();
  if (publicUrl) return publicUrl;

  return process.env.FRONTEND_URL || 'http://localhost:5173';
}
