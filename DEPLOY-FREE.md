# Free Hosting — $0/month on Render

The app is now optimized for **free tier** hosting. No Redis, no Docker, no paid services required.

## What changed for free tier

| Before | After (free tier) |
|--------|-------------------|
| Redis + BullMQ ($10/mo) | PostgreSQL job queue (free) |
| Separate worker process | Inline worker in API process |
| Docker + system FFmpeg | Bundled FFmpeg npm package |
| 2–5 min videos | 60–90 sec videos (less memory) |
| node-cron scheduler | HTTP cron endpoints |
| Separate frontend host | Dashboard served from same URL |

---

## Option A: Render Free ($0) — easiest

### 1. Create free PostgreSQL on Neon
1. Go to [neon.tech](https://neon.tech) → Sign up (free)
2. Create project → copy **connection string**
3. Paste as `DATABASE_URL` (keep `?sslmode=require`)

### 2. Deploy on Render
1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect your GitHub repo
3. When asked for blueprint file, use **`render-free.yaml`**
   - Or rename `render-free.yaml` → `render.yaml` before deploying
4. Set these env vars when prompted:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon connection string |
| `OPENAI_API_KEY` | Your OpenAI key |
| `CORS_ORIGIN` | `https://kids-youtube.onrender.com` (your Render URL) |
| `FRONTEND_URL` | Same as above |
| `CRON_SECRET` | Auto-generated — copy it for step 3 |

5. Click **Apply** and wait for deploy (~5 min)

### 3. Set up free cron (keeps app awake + runs daily pipeline)

Render free services **sleep after 15 min**. Use [cron-job.org](https://cron-job.org) (free):

**Job 1 — Keep alive (every 10 minutes):**
```
URL: https://YOUR-APP.onrender.com/api/cron/keep-alive?secret=YOUR_CRON_SECRET
Schedule: */10 * * * *
```

**Job 2 — Daily content (midnight UTC):**
```
URL: https://YOUR-APP.onrender.com/api/cron/daily-pipeline?secret=YOUR_CRON_SECRET
Method: POST
Schedule: 0 0 * * *
```

**Job 3 — Analytics (every 6 hours):**
```
URL: https://YOUR-APP.onrender.com/api/cron/analytics?secret=YOUR_CRON_SECRET
Method: POST
Schedule: 0 */6 * * *
```

### 4. Done!
Open `https://YOUR-APP.onrender.com` — dashboard and API on one URL.

---

## Option B: Vercel frontend + Render free API

If you want Vercel's CDN for the dashboard:

1. Deploy API on Render (steps above) with `SERVE_FRONTEND=false`
2. Deploy frontend on Vercel:
   - Root: `apps/frontend`
   - Env: `VITE_API_URL=https://YOUR-APP.onrender.com`
3. Set `CORS_ORIGIN=https://your-app.vercel.app` on Render

---

## Option C: Oracle Cloud VM ($0 forever)

For always-on (no sleep), use the VM guide in the previous sections with `docker-compose.prod.yml`.

---

## Free tier limits

| Limit | Value | Workaround |
|-------|-------|------------|
| Render sleep | 15 min idle | cron-job.org pings every 10 min |
| Video length | 60–90 sec | Set `FREE_TIER=false` on paid plan |
| Storage | Ephemeral | Videos reset on redeploy — use YouTube upload |
| Cold start | ~30 sec | First request after sleep is slow |
| Memory | 512 MB | Shorter videos, 3 scenes instead of 5 |

---

## Environment variables (free tier)

```env
FREE_TIER=true
SERVE_FRONTEND=true
INLINE_WORKER=true
DATABASE_URL=postgresql://...@neon.tech/kids_youtube?sslmode=require
OPENAI_API_KEY=sk-...
CRON_SECRET=your-random-secret
CORS_ORIGIN=https://your-app.onrender.com
FRONTEND_URL=https://your-app.onrender.com
```

---

## Local development (no Redis needed)

```bash
docker compose up -d    # PostgreSQL only
cp .env.example .env
npm install
npm run db:push -w @kids-youtube/backend
npm run dev
```

---

## Troubleshooting

**App sleeps and jobs don't run**
→ Set up cron-job.org keep-alive (step 3 above)

**"Cron not configured"**
→ Set `CRON_SECRET` env var on Render

**Video generation fails**
→ Check Render logs. Free tier has 512MB RAM — videos are capped at 90 sec.

**Database connection error**
→ Use Neon connection string with `?sslmode=require`

**Frontend shows blank page**
→ Ensure `SERVE_FRONTEND=true` and build includes frontend (`npm run build:free`)
