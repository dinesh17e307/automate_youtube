# Deployment Guide

This app needs **long-running workers**, **FFmpeg**, **PostgreSQL**, and **Redis** — so **Render is the recommended host**. Vercel works for the **frontend only**.

## Architecture on Render

```
┌─────────────────────┐     ┌──────────────────────┐
│  Frontend (Static)  │────▶│  API + Worker (Docker)│
│  kids-youtube-       │     │  FFmpeg, BullMQ,      │
│  frontend.onrender   │     │  persistent disk       │
└─────────────────────┘     └──────────┬─────────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                     PostgreSQL      Redis      10GB Disk
```

---

## Option 1: Render (recommended — full stack)

### Step 1 — Push code to GitHub

Make sure your repo is on GitHub (already done if you cloned from there).

### Step 2 — Create Render Blueprint

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Blueprint**
3. Connect your GitHub repo (`automate_youtube`)
4. Render detects `render.yaml` and shows 4 resources:
   - `kids-youtube-api` (Docker web service)
   - `kids-youtube-frontend` (static site)
   - `kids-youtube-redis` (Key Value / Redis)
   - `kids-youtube-db` (PostgreSQL)
5. Click **Apply**

### Step 3 — Set environment variables

After services are created, open **kids-youtube-api** → **Environment** and add:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your OpenAI key |
| `CORS_ORIGIN` | `https://kids-youtube-frontend.onrender.com` (your frontend URL) |
| `FRONTEND_URL` | Same as above |
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID (optional) |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth secret (optional) |
| `YOUTUBE_REDIRECT_URI` | `https://kids-youtube-api.onrender.com/api/youtube/callback` |

Then open **kids-youtube-frontend** → **Environment** and add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://kids-youtube-api.onrender.com` (your API URL, no trailing slash) |

> **Important:** After setting `VITE_API_URL`, trigger a **manual redeploy** of the frontend so Vite bakes the URL into the build.

### Step 4 — Verify

1. API health: `https://kids-youtube-api.onrender.com/api/health`
2. Dashboard: `https://kids-youtube-frontend.onrender.com`
3. Click **Run Daily Pipeline** to test generation

### Render pricing (approximate)

| Service | Plan | Cost |
|---------|------|------|
| API (Docker) | Starter | ~$7/mo |
| Frontend (Static) | Free | $0 |
| PostgreSQL | Basic 256MB | ~$6/mo |
| Redis (Key Value) | Starter | ~$10/mo |
| Persistent disk (10GB) | — | ~$2.50/mo |

Free tier is **not** suitable for this app (no FFmpeg Docker, no persistent workers). Budget ~$25/mo for a working deployment.

### YouTube OAuth on Render

In [Google Cloud Console](https://console.cloud.google.com):

1. APIs & Services → Credentials → your OAuth client
2. Add **Authorized redirect URI**:
   ```
   https://kids-youtube-api.onrender.com/api/youtube/callback
   ```
3. Add **Authorized JavaScript origin**:
   ```
   https://kids-youtube-frontend.onrender.com
   ```

---

## Option 2: Vercel (frontend) + Render (backend)

Use this if you prefer Vercel's CDN for the dashboard.

### Backend on Render

Deploy only the API using the Dockerfile:

1. Render → **New +** → **Web Service**
2. Connect repo, set **Runtime: Docker**
3. Add PostgreSQL and Redis (Upstash free tier works too: [upstash.com](https://upstash.com))
4. Set all env vars from the table above
5. Attach a **persistent disk** at `/app/storage` (10GB)

### Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `apps/frontend`
4. Framework preset: **Vite**
5. Add environment variable:
   ```
   VITE_API_URL = https://kids-youtube-api.onrender.com
   ```
6. Deploy

7. Update Render API env:
   ```
   CORS_ORIGIN = https://your-app.vercel.app
   FRONTEND_URL = https://your-app.vercel.app
   ```

> Vercel cannot run the backend, workers, FFmpeg, or Redis. It only hosts the React dashboard.

---

## Option 3: Manual Docker deploy (any VPS)

Works on DigitalOcean, Hetzner, AWS EC2, etc.

```bash
# On your server
git clone https://github.com/dinesh17e307/automate_youtube.git
cd automate_youtube
cp .env.example .env
# Edit .env with production values

# Start Postgres + Redis (or use managed services)
docker compose up -d

# Build and run
docker build -t kids-youtube .
docker run -d \
  --name kids-youtube-api \
  -p 3001:3001 \
  --env-file .env \
  -v kids-youtube-storage:/app/storage \
  kids-youtube

# Build frontend
npm ci
npm run build -w @kids-youtube/shared
VITE_API_URL=https://your-server.com npm run build -w @kids-youtube/frontend

# Serve frontend with nginx or Caddy pointing to apps/frontend/dist
```

---

## Environment variables reference

### API (`kids-youtube-api`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Render) |
| `REDIS_URL` | Yes | Redis connection string (auto-set by Render) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for content generation |
| `CORS_ORIGIN` | Yes | Frontend URL(s), comma-separated |
| `FRONTEND_URL` | Yes | Primary frontend URL |
| `STORAGE_PATH` | No | `/app/storage` (default in Docker) |
| `YOUTUBE_CLIENT_ID` | No | YouTube OAuth |
| `YOUTUBE_CLIENT_SECRET` | No | YouTube OAuth |
| `YOUTUBE_REDIRECT_URI` | No | `https://<api-url>/api/youtube/callback` |
| `CRON_DAILY_PIPELINE` | No | `"0 0 * * *"` (midnight UTC) |
| `CRON_ANALYTICS` | No | `"0 */6 * * *"` (every 6 hours) |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend URL, e.g. `https://kids-youtube-api.onrender.com` |

---

## Troubleshooting

### "Failed to fetch" on dashboard
- Check `VITE_API_URL` is set and frontend was redeployed after setting it
- Check `CORS_ORIGIN` on API matches your frontend URL exactly (no trailing slash)

### Video generation fails
- FFmpeg is included in the Docker image — make sure you're using **Docker** runtime, not Node native
- Check API logs on Render for FFmpeg errors

### Jobs stuck in "generating"
- Redis must be running and `REDIS_URL` must be correct
- The worker runs inside the API container — check API logs for worker startup message

### YouTube OAuth redirect error
- `YOUTUBE_REDIRECT_URI` must exactly match Google Cloud Console
- Must use `https://` in production (not `http://`)

### Storage fills up
- Render disk is 10GB by default — increase in Render dashboard or add S3 integration later
- Old temp files are cleaned after each render

---

## Post-deploy checklist

- [ ] API health check returns `{"status":"ok"}`
- [ ] Dashboard loads and shows stats
- [ ] Manual pipeline trigger generates a video
- [ ] YouTube OAuth connected (if publishing)
- [ ] `CORS_ORIGIN` and `VITE_API_URL` match your live URLs
- [ ] OpenAI key set and LLM provider is `openai` in Settings
