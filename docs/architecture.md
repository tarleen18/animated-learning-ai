# Architecture Overview — Text-to-Animation Platform

## High-level components

- Frontend (Next.js)
  - Compose prompt, display storyboard, preview scenes, trigger renders
  - Handles authentication and local preview

- API (Next.js API routes)
  - `POST /api/lesson` — generate storyboard (calls OpenAI)
  - `POST /api/render` — enqueue render job or call render worker
  - Authentication, rate-limiting, usage accounting

- Background workers
  - Job queue using Redis + BullMQ
  - Worker processes: `render-video` (FFmpeg), `asset-generation` (image models)
  - Worker is horizontally scalable

- Storage
  - Object storage (S3 or S3-compatible) for images and rendered MP4s
  - Database (Postgres) for users, jobs, metadata

- External services
  - OpenAI (structured outputs) for storyboard generation
  - Stripe for billing
  - CDN for serving videos and assets
  - Monitoring: Sentry + logs

## Data flow (simplified)
1. User submits prompt → `/api/lesson`
2. Server validates model response; returns storyboard JSON to user
3. User requests render → `/api/render`
4. API enqueues `render-video` job in Redis queue
5. Worker picks job, generates slides and FFmpeg renders MP4
6. Worker uploads MP4 to S3 and updates job status in DB
7. Frontend polls job status or receives webhook, then provides download URL

## Scalability & cost
- Use small workers for preview generation and larger instances for full FFmpeg renders
- Cache validated storyboards for repeated prompts
- Apply per-user rate limits and quotas via middleware

## Security
- Keep API keys in vault (.env.local for local dev; secrets manager in prod)
- Validate all outputs with JSON schema
- Scan/limit user uploads and generated content to avoid abuse

## Tech choices (MVP)
- Next.js for frontend + API
- Redis + BullMQ for job queue
- Node worker using `fluent-ffmpeg` for render
- Postgres for metadata; S3 for assets
- NextAuth for authentication (or Auth0)
- Stripe for billing and quotas

---
