/**
 * MoniBot BSC Reply Service v2.0
 * 
 * Rebuilt to mirror vp-social architecture:
 * - Uses twitter-api-v2 with OAuth 2.0 (refresh token stored in DB)
 * - Polls monibot_transactions for chain='BSC' unreplied records
 * - Generates AI replies via monibot-ai Edge Function
 * - Proper rate limit handling and error classification
 */

import 'dotenv/config';
import express from 'express';
import { initSupabase, processSocialQueue } from './database.js';
import { initTwitterOAuth2 } from './twitter.js';
import { initGemini } from './gemini.js';

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);
const AUTO_RESTART_MS = 90 * 60 * 1000; // 90 minutes

let processedCount = 0;
let errorCount = 0;
let cycleCount = 0;
let lastPoll = null;

// ============ Express Health Check ============

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    chain: 'BSC',
    auth: 'oauth2',
    lastPoll,
    cycleCount,
    processedCount,
    errorCount
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MoniBot BSC Reply Service v2.0 running on port ${PORT}`);
});

// ============ Initialization ============

console.log('┌─────────────────────────────────────────────────┐');
console.log('│      MoniBot BSC Reply Service v2.0            │');
console.log('│    OAuth 2.0 + AI Replies (USDT/BSC)           │');
console.log('└─────────────────────────────────────────────────┘\n');

// 1. Initialize Supabase first (needed for OAuth token storage)
initSupabase();

// 2. Initialize Twitter OAuth 2.0
await initTwitterOAuth2();

// 3. Initialize AI (Lovable AI via Edge Function)
initGemini();

console.log(`\n📋 Configuration:`);
console.log(`   Poll Interval:    ${POLL_INTERVAL}ms`);
console.log(`   Auto-Restart:     ${AUTO_RESTART_MS / 60000} minutes`);
console.log('');

// ============ Main Poll Loop ============

async function pollAndProcess() {
  cycleCount++;
  lastPoll = new Date().toISOString();
  
  try {
    const processed = await processSocialQueue();
    processedCount += processed;
  } catch (error) {
    console.error('❌ Poll error:', error.message);
    errorCount++;
  }
}

// ============ Auto-Restart (90 min) ============

setTimeout(() => {
  console.log('\n🔄 90-minute auto-restart triggered (OAuth token refresh)...');
  console.log(`📊 Completed ${cycleCount} poll cycles, ${processedCount} replies posted.`);
  process.exit(0);
}, AUTO_RESTART_MS);

// ============ Graceful Shutdown ============

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down...');
  console.log(`📊 ${cycleCount} cycles, ${processedCount} replies.`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down...');
  console.log(`📊 ${cycleCount} cycles, ${processedCount} replies.`);
  process.exit(0);
});

// ============ Start ============

console.log('🚀 BSC Reply Service is now live!\n');

pollAndProcess();
setInterval(pollAndProcess, POLL_INTERVAL);
