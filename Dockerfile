# Backend image with FFmpeg for video rendering
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (workspace root)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci --include=dev

# Copy source
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
COPY tsconfig.json ./

# Build shared + backend, generate Prisma client
RUN npm run build -w @kids-youtube/shared \
  && npm run db:generate -w @kids-youtube/backend \
  && npm run build -w @kids-youtube/backend

# Persistent media storage (attach a Render disk at /app/storage in production)
ENV NODE_ENV=production
ENV STORAGE_PATH=/app/storage
RUN mkdir -p /app/storage/images /app/storage/audio /app/storage/videos /app/storage/thumbnails /app/storage/temp

WORKDIR /app/apps/backend

RUN chmod +x scripts/start-production.sh

EXPOSE 3001

# Runs API + background worker in one container (shared storage disk)
CMD ["./scripts/start-production.sh"]
