# Kids YouTube Automation Platform

A fully automated YouTube content generation and publishing platform for kids channels. Generates **1 long video + 1 Short per day** with minimal human intervention.

## Architecture

```
Admin Dashboard (React)
        │
Content Scheduler (node-cron + BullMQ)
        │
AI Generator (Topic → Script → Scenes)
        │
┌───────┼───────┐
Image   TTS   Music
        │
Video Renderer (FFmpeg)
        │
Content Validator
        │
YouTube API (Upload + Schedule)
        │
Analytics Feedback Loop
```

## Features

- **Daily automated pipeline** — generates long videos and Shorts on a schedule
- **AI content generation** — topics, scripts, scenes with pluggable LLM providers (OpenAI / mock)
- **Character consistency** — reusable character library with reference images and voices
- **Video composition** — FFmpeg-based rendering with subtitles, music, and transitions
- **Content safety validation** — age-appropriateness, copyright, language checks
- **YouTube integration** — upload, thumbnail, metadata, scheduling, Made for Kids
- **Admin dashboard** — monitor pipeline, content calendar, approval mode, settings
- **Analytics feedback loop** — collects YouTube stats to improve future content
- **Job queue** — BullMQ with retries, failure handling, and idempotent jobs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL, Prisma ORM |
| Queue | Redis, BullMQ |
| Video | FFmpeg |
| AI | Pluggable providers (OpenAI, mock) |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL and Redis)
- FFmpeg installed on the host system

### Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Build shared package
npm run build -w @kids-youtube/shared

# Run database migrations
npm run db:push -w @kids-youtube/backend

# Start all services (API + frontend)
npm run dev

# In separate terminals:
npm run worker    # Background job processor
npm run scheduler # Daily cron scheduler
```

### Access

- **Dashboard**: http://localhost:5173
- **API**: http://localhost:3001
- **Health check**: http://localhost:3001/api/health

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for step-by-step hosting instructions.

| Platform | What to deploy |
|----------|----------------|
| **Render** (recommended) | Full stack via `render.yaml` — API, worker, DB, Redis, frontend |
| **Vercel** | Frontend only (`apps/frontend`) — set `VITE_API_URL` to your Render API |
| **Docker / VPS** | `docker build` + managed Postgres/Redis |

## Configuration

All settings are configurable from the admin dashboard (Settings page) or via environment variables:

| Setting | Description | Default |
|---------|-------------|---------|
| Channel Name | YouTube channel name | Kids Learning Channel |
| Target Age | Audience age range | 2-6 |
| Long Video Time | Daily publish time (UTC) | 18:00 |
| Short Time | Daily Short publish time (UTC) | 20:00 |
| Automation Mode | `fully_automatic` or `approval` | fully_automatic |
| AI Providers | LLM, Image, TTS, Music | mock (no API keys needed) |

### YouTube Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env`
5. Connect via Settings → YouTube Integration

### OpenAI Setup (optional)

Set `OPENAI_API_KEY` in `.env` and select `openai` as the LLM provider in Settings for real AI-generated content.

## Pipeline Stages

Each piece of content flows through these stages:

```
Idea → Script → Scenes → Characters → Voice → Music → Rendering → Thumbnail → Validation → Upload → Published
```

Failed content is retried automatically (up to 3 times). One failure does not block the next day's pipeline.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/status` | Dashboard overview |
| GET | `/api/dashboard/calendar` | Content calendar |
| GET | `/api/dashboard/content` | List content |
| POST | `/api/dashboard/content/generate` | Generate new content |
| POST | `/api/dashboard/content/:id/approve` | Approve content |
| POST | `/api/dashboard/pipeline/trigger` | Trigger daily pipeline |
| GET/PUT | `/api/config` | Channel configuration |
| GET | `/api/youtube/auth` | YouTube OAuth URL |
| GET | `/api/youtube/characters` | Character library |

## Project Structure

```
├── apps/
│   ├── backend/          # Express API, workers, scheduler
│   │   ├── prisma/       # Database schema
│   │   └── src/
│   │       ├── services/
│   │       │   ├── ai/           # Pluggable AI providers
│   │       │   ├── pipeline/     # Content pipeline orchestrator
│   │       │   ├── video/          # FFmpeg video renderer
│   │       │   ├── validation/     # Content safety checks
│   │       │   └── youtube/        # YouTube API integration
│   │       ├── queues/             # BullMQ job queues
│   │       └── routes/             # API routes
│   └── frontend/         # React admin dashboard
├── packages/
│   └── shared/           # Shared types and constants
├── docker-compose.yml
└── .env.example
```

## License

MIT
