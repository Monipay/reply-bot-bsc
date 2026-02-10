# MoniBot BSC Reply Service

Lightweight Twitter reply service for MoniBot's BSC deployment. Polls Supabase for unreplied BSC transactions and posts replies via **inference.sh**.

## Architecture

```
Supabase (monibot_transactions) → Poll (chain='BSC', replied=false) → Generate Reply → inference.sh → Twitter
```

## Prerequisites

- Node.js 18+
- inference.sh CLI installed (`curl -fsSL https://cli.inference.sh | sh`)
- OAuth connection to @monibot configured in inference.sh
- Supabase project with `monibot_transactions` table (with `chain` column)

## Setup

```bash
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
npm install
npm start
```

## Railway Deployment

1. Connect this directory as a Railway service
2. Set environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)
3. Uses Dockerfile which installs inference.sh CLI
4. Health check: `GET /health`

## How It Works

1. Polls every 30s for BSC transactions where `replied=false` and `retry_count < 3`
2. Generates unique reply from 10+ templates per category (all mention BSC/BNB Chain, use USDT)
3. Posts via `infsh app run x/post-create`
4. Marks `replied=true` on success, increments `retry_count` on failure
5. Non-recoverable errors (403, 404, duplicates) are skipped immediately

## Reply Categories

- **Successful Grants** - USDT grant confirmations
- **Successful P2P** - USDT transfer confirmations
- **Target Not Found** - Unregistered recipient
- **Insufficient Balance** - Low USDT balance
- **Allowance Not Approved** - USDT spending not authorized
- **Limit Reached** - Campaign full
