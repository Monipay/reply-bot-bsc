# MoniBot BSC Reply Service v2.0

Twitter reply agent for MoniBot's BSC deployment. Polls `monibot_transactions` for unreplied BSC records and posts AI-generated replies via **twitter-api-v2** (OAuth 2.0).

## Architecture

```
Supabase (monibot_transactions) → Filter (chain='BSC', replied=false) → AI Reply (Edge Function) → Twitter OAuth 2.0
```

## v2.0 Changes (from v1.0)

- **Replaced `inference.sh` CLI with `twitter-api-v2`** (OAuth 2.0 with DB-stored refresh token)
- **AI replies via Lovable AI Edge Function** instead of static templates
- **Rate limit monitoring** with color-coded status logging
- **90-minute auto-restart** for OAuth token refresh (same as vp-social)
- **Error classification** matching vp-social patterns (403 skip, retry logic)

## Prerequisites

- Node.js 18+
- Twitter OAuth 2.0 app (Client ID + Client Secret)
- Refresh token stored in `bot_settings` table (key: `twitter_refresh_token_bsc`)
- Supabase project with `monibot_transactions` table

## Setup

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
npm install
npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (bypasses RLS) |
| `TWITTER_CLIENT_ID` | ✅ | Twitter OAuth 2.0 Client ID |
| `TWITTER_CLIENT_SECRET` | ✅ | Twitter OAuth 2.0 Client Secret |
| `PORT` | ❌ | HTTP port (default: 3000) |
| `POLL_INTERVAL_MS` | ❌ | Poll frequency (default: 30000) |

## Token Storage

The refresh token is stored in the `bot_settings` table:
- Key: `twitter_refresh_token_bsc` (falls back to `twitter_refresh_token` if not found)
- Auto-refreshed every 90 minutes via process restart

## Network Routing

- **Campaigns**: BSC worker only processes campaigns with `network='bsc'`
- **P2P**: BSC worker only processes tweets with BSC keywords (usdt/bnb/bsc/binance)
- **Replies**: This service only replies to transactions with `chain='BSC'`

## Railway Deployment

1. Connect this directory as a Railway service
2. Set environment variables
3. Health check: `GET /health`
4. No inference.sh required — uses npm `twitter-api-v2` directly
