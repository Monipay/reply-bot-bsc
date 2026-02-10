/**
 * MoniBot BSC Reply Service - Database Module
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

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
  // First get current retry_count
  const { data } = await supabase
    .from('monibot_transactions')
    .select('retry_count')
    .eq('id', id)
    .maybeSingle();

  const currentRetry = (data?.retry_count || 0) + 1;
  const update = { retry_count: currentRetry, error_reason: errorReason };

  // If max retries reached, also mark as replied
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
