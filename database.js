/**
 * MoniBot BSC Reply Service - Database Module
 */

import { createClient } from '@supabase/supabase-js';
import { replyToTweet } from './twitter.js';
import { generateReplyWithBackoff } from './gemini.js';

let supabase;

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

/**
 * Initialize the Supabase client
 */
export function initSupabase() {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  console.log('✅ Supabase initialized [BSC Reply Bot]');
}

/**
 * Get the Supabase client instance
 */
export function getSupabase() {
  return supabase;
}

/**
 * Get unreplied BSC transactions
 */
export async function getUnrepliedTransactions() {
  const { data, error } = await supabase
    .from('monibot_transactions')
    .select('*')
    .eq('chain', 'BSC')
    .eq('replied', false)
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('❌ DB query error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Mark transaction as replied
 */
export async function markReplied(id, errorReason = null) {
  const update = { replied: true };
  if (errorReason) update.error_reason = errorReason;

  const { error } = await supabase
    .from('monibot_transactions')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error(`❌ Failed to mark ${id} as replied:`, error.message);
  }
}

/**
 * Increment retry count
 */
export async function incrementRetry(id, errorReason) {
  const { data } = await supabase
    .from('monibot_transactions')
    .select('retry_count')
    .eq('id', id)
    .maybeSingle();

  const currentRetry = (data?.retry_count || 0) + 1;
  const update = { retry_count: currentRetry, error_reason: errorReason };

  if (currentRetry >= MAX_RETRIES) {
    update.replied = true;
  }

  const { error } = await supabase
    .from('monibot_transactions')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error(`❌ Failed to increment retry for ${id}:`, error.message);
  }
}

/**
 * Process the social reply queue - polls unreplied BSC transactions,
 * generates AI replies, and posts them to Twitter.
 */
export async function processSocialQueue() {
  const transactions = await getUnrepliedTransactions();

  if (transactions.length === 0) return 0;

  console.log(`📋 [BSC] Processing ${transactions.length} unreplied transaction(s)...`);
  let processed = 0;

  for (const tx of transactions) {
    try {
      if (!tx.tweet_id) {
        console.log(`  ⏭ Skipping ${tx.id} — no tweet_id`);
        await markReplied(tx.id, 'SKIP_NO_TWEET_ID');
        continue;
      }

      console.log(`  🔄 Replying to tweet ${tx.tweet_id} | type=${tx.type} | ${tx.recipient_pay_tag || 'unknown'}`);

      const replyText = await generateReplyWithBackoff(tx);
      const replyTweetId = await replyToTweet(tx.tweet_id, replyText);

      console.log(`  ✅ Reply posted: ${replyTweetId}`);
      await markReplied(tx.id);
      processed++;

      // Rate limit pause between replies
      await new Promise(r => setTimeout(r, 3000));
    } catch (error) {
      console.error(`  ❌ Failed to reply for tx ${tx.id}:`, error.message);

      if (error.code === 429 || error.message?.includes('429')) {
        console.log('  🚫 Rate limited. Stopping this cycle.');
        break;
      }

      await incrementRetry(tx.id, error.message?.substring(0, 200));
    }
  }

  console.log(`📊 [BSC] Cycle complete: ${processed}/${transactions.length} replied`);
  return processed;
}
