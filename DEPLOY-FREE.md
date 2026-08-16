# Free Hosting Guide ($0/month)

Render costs ~$25/mo because this app needs **FFmpeg, background workers, PostgreSQL, and Redis**. Here are **real free options** that can run the full pipeline.

## Honest comparison

| Option | Cost | Full pipeline? | Difficulty | Best for |
|--------|------|----------------|------------|----------|
| **Oracle Cloud VM** | $0 forever | Yes | Medium | Best free choice |
| **Split free tier** | $0 | Yes | Medium | No credit card for VM |
| **Fly.io** | $0 allowance* | Partial | Easy | Small tests only |
| **Your own PC** | $0 | Yes | Easy | Personal use |
| **Vercel / Netlify** | $0 | Frontend only | Easy | Dashboard UI only |
| **Render free** | $0 | No | — | Spins down, no Docker/FFmpeg |

\* Fly.io gives ~$5/mo credit; video rendering may exceed limits.

**Nothing is “free unlimited cloud” for FFmpeg video generation** — but Oracle Cloud’s always-free VM is the closest thing.

---

## Option 1: Oracle Cloud (recommended — $0 forever)

Oracle gives you a **free ARM VM forever** (4 CPUs, 24 GB RAM). That’s enough to run everything.

### What you get free
- 1–4 ARM VMs (Always Free)
- 200 GB storage
- Public IP address
- No monthly bill (credit card required for verification only)

### Step-by-step

#### 1. Create Oracle account
1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Sign up (credit card for verification — won’t be charged on Always Free resources)

#### 2. Create a VM
1. **Compute** → **Instances** → **Create instance**
2. Name: `kids-youtube`
3. Image: **Ubuntu 22.04** (or 24.04)
4. Shape: **Ampere** → `VM.Standard.A1.Flex` → **1 OCPU, 6 GB RAM** (free)
5. Networking: assign a **public IP**
6. Download your **SSH private key**
7. Create

#### 3. Open firewall ports
In Oracle Console → **Networking** → **Virtual Cloud Networks** → your VCN → **Security Lists**:
- Add **Ingress**: TCP port **80** from `0.0.0.0/0`
- Add **Ingress**: TCP port **443** from `0.0.0.0/0` (if using HTTPS later)

On the VM itself:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
```

#### 4. Install Docker on the VM
SSH in:
```bash
ssh -i your-key.pem ubuntu@YOUR_VM_IP
```

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in, then:
sudo apt-get install -y docker-compose-plugin git

# Clone your repo
git clone https://github.com/dinesh17e307/automate_youtube.git
cd automate_youtube
git checkout cursor/kids-youtube-automation-d6db
```

#### 5. Configure environment
```bash
cp .env.example .env
nano .env
```

Set at minimum:
```env
OPENAI_API_KEY=sk-your-key-here
POSTGRES_PASSWORD=choose-a-strong-password

# Replace YOUR_VM_IP with your Oracle public IP
CORS_ORIGIN=http://YOUR_VM_IP
FRONTEND_URL=http://YOUR_VM_IP
YOUTUBE_REDIRECT_URI=http://YOUR_VM_IP/api/youtube/callback
```

#### 6. Deploy
```bash
chmod +x scripts/deploy-free-vm.sh
./scripts/deploy-free-vm.sh
```

#### 7. Open in browser
```
http://YOUR_VM_IP
```

Health check: `http://YOUR_VM_IP/api/health`

### Optional: free HTTPS with Cloudflare
1. Point a domain to your VM IP in Cloudflare DNS
2. Use Cloudflare proxy (orange cloud) for free SSL
3. Update `CORS_ORIGIN` and `FRONTEND_URL` to `https://yourdomain.com`

---

## Option 2: Split free services (no VM)

Use separate free tiers — good if you don’t want to manage a server.

```
Vercel (frontend)  →  Fly.io (API+worker)  →  Neon (DB) + Upstash (Redis)
     FREE                  ~$5 credit/mo           FREE         FREE
```

### A. Database — Neon (free PostgreSQL)
1. [neon.tech](https://neon.tech) → Sign up
2. Create project → copy connection string
3. Use as `DATABASE_URL`

Free tier: 0.5 GB storage, enough to start.

### B. Redis — Upstash (free)
1. [upstash.com](https://upstash.com) → Create Redis database
2. Copy `REDIS_URL` (use the `rediss://` TLS URL)

Free tier: 10,000 commands/day.

### C. Backend — Fly.io
```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch --no-deploy   # uses fly.toml in repo
fly secrets set DATABASE_URL="postgresql://..." REDIS_URL="rediss://..." OPENAI_API_KEY="sk-..."
fly secrets set CORS_ORIGIN="https://your-app.vercel.app" FRONTEND_URL="https://your-app.vercel.app"
fly deploy
```

> **Warning:** Fly’s free 512MB VM may struggle with FFmpeg video rendering. Upgrade to 1GB ($) if renders fail.

### D. Frontend — Vercel (free)
1. [vercel.com](https://vercel.com) → Import repo
2. Root directory: `apps/frontend`
3. Environment variable:
   ```
   VITE_API_URL=https://kids-youtube-api.fly.dev
   ```
4. Deploy

---

## Option 3: Run on your own computer ($0)

For personal/testing use, run locally and expose with a tunnel:

```bash
docker compose up -d          # Postgres + Redis
npm run dev                   # API + dashboard
npm run worker                # Job processor
```

**Expose to internet (free tunnel):**
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — free, stable URL
- [ngrok](https://ngrok.com) — free tier with random URL

Your PC must stay on for the daily pipeline to run.

---

## Option 4: Other free VPS trials

| Provider | Free period | Notes |
|----------|-------------|-------|
| Google Cloud | e2-micro always free* | 1 tiny VM, tight on RAM for FFmpeg |
| AWS | 12 months free | t2.micro, 1 GB RAM — may OOM on video render |
| Azure | 12 months free | B1s VM |
| GitHub Codespaces | 60 hrs/mo | Not suitable — no persistent workers |

\* Only in certain regions; check current Google Cloud free tier docs.

---

## What does NOT work for free

| Platform | Why not |
|----------|---------|
| **Render free** | Web services spin down after 15 min; no background workers |
| **Vercel** | Serverless only — no FFmpeg, no long jobs, 10s timeout |
| **Netlify Functions** | Same as Vercel — no video processing |
| **GitHub Pages** | Static files only — no backend |
| **Heroku free** | Discontinued in 2022 |
| **Railway free** | Removed; now $5/mo minimum |

---

## Recommended path

| Your situation | Do this |
|----------------|---------|
| Want $0 forever, full automation | **Oracle Cloud VM** + `docker-compose.prod.yml` |
| No server management | **Neon + Upstash + Fly.io + Vercel** (may hit limits) |
| Just testing locally | **docker compose** on your PC |
| Already have a domain | Oracle VM + **Cloudflare** for free HTTPS |

---

## Quick deploy on Oracle (copy-paste)

```bash
# On your Oracle Ubuntu VM after cloning the repo:
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and YOUR_VM_IP in CORS_ORIGIN

chmod +x scripts/deploy-free-vm.sh
./scripts/deploy-free-vm.sh
```

That's it — dashboard at `http://YOUR_VM_IP`, daily pipeline runs automatically.

---

## Troubleshooting (free VM)

**Out of memory during video render**
```bash
# Add 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Can't reach the site**
- Check Oracle security list allows port 80
- Run `docker compose -f docker-compose.prod.yml ps` — all services should be healthy

**Jobs stuck**
- Check Redis: `docker compose -f docker-compose.prod.yml logs redis`
- Check worker in API logs: `docker compose -f docker-compose.prod.yml logs api`
