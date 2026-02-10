/**
 * MoniBot BSC Reply Service
 * Polls Supabase for unreplied BSC transactions and posts replies via inference.sh
 */

import 'dotenv/config';
import express from 'express';
import { getUnrepliedTransactions, markReplied, incrementRetry } from './database.js';
import { generateReply } from './replyGenerator.js';
import { postReply } from './twitter.js';

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

let processedCount = 0;
let errorCount = 0;
let lastPoll = null;
let running = true;

// ============ Express Health Check ============

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    chain: 'BSC',
    database: 'connected',
    lastPoll,
    processedCount,
    errorCount
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MoniBot BSC Reply Service running on port ${PORT}`);
});

// ============ Main Poll Loop ============

async function pollAndProcess() {
  while (running) {
    try {
      lastPoll = new Date().toISOString();
      console.log(`\n⏱️  [${lastPoll}] Polling for unreplied BSC transactions...`);

      const transactions = await getUnrepliedTransactions();

      if (!transactions || transactions.length === 0) {
        console.log('   No unreplied transactions found.');
      } else {
        console.log(`   Found ${transactions.length} transaction(s) to reply to.`);

        for (const tx of transactions) {
          await processTransaction(tx);
        }
      }
    } catch (error) {
      console.error('❌ Poll error:', error.message);
      errorCount++;
    }

    await sleep(POLL_INTERVAL);
  }
}

async function processTransaction(tx) {
  try {
    console.log(`\n📝 Processing: ${tx.id.substring(0, 8)} | type=${tx.type} | hash=${tx.tx_hash?.substring(0, 12)}...`);

    if (!tx.tweet_id) {
      console.log('   ⏭️ No tweet_id, marking as replied.');
      await markReplied(tx.id, 'NO_TWEET_ID');
      return;
    }

    // Skip error/skip hashes that don't need replies
    if (tx.tx_hash?.startsWith('SKIP_') || tx.tx_hash?.startsWith('ERROR_')) {
      console.log(`   ⏭️ Skip/error hash (${tx.tx_hash}), marking replied.`);
      await markReplied(tx.id, `SKIP_${tx.tx_hash}`);
      return;
    }

    const replyText = generateReply(tx);
    console.log(`   💬 Reply: "${replyText}"`);

    const result = await postReply(tx.tweet_id, replyText);

    if (result.success) {
      await markReplied(tx.id);
      processedCount++;
      console.log(`   ✅ Reply posted! Tweet ID: ${result.tweetId}`);
    } else if (result.nonRecoverable) {
      await markReplied(tx.id, result.error);
      errorCount++;
      console.log(`   ⛔ Non-recoverable error: ${result.error}`);
    } else {
      await incrementRetry(tx.id, result.error);
      errorCount++;
      console.log(`   🔄 Recoverable error, retry incremented: ${result.error}`);
    }
  } catch (error) {
    console.error(`   ❌ Error processing ${tx.id}:`, error.message);
    await incrementRetry(tx.id, error.message);
    errorCount++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Graceful Shutdown ============

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down...');
  running = false;
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down...');
  running = false;
});

// ============ Start ============

console.log('🤖 MoniBot BSC Reply Service starting...');
console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
pollAndProcess();
