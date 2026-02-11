/**
 * MoniBot BSC Reply Service - Twitter Module (OAuth 2.0)
 * 
 * Mirrors vp-social/twitter-oauth2.js architecture:
 * - OAuth 2.0 with refresh token stored in bot_settings
 * - Uses a separate key for BSC to avoid conflicts with Base vp-social
 * - Rate limit logging with color-coded status
 */

import { TwitterApi } from 'twitter-api-v2';
import { getSupabase } from './database.js';

let twitterClient;

// ============ Rate Limit Logging ============

function logRateLimits(endpoint, rateLimit) {
  if (!rateLimit) return;
  
  const remaining = rateLimit.remaining;
  const limit = rateLimit.limit;
  const resetTime = rateLimit.reset ? new Date(rateLimit.reset * 1000) : null;
  const resetIn = resetTime ? Math.round((resetTime - Date.now()) / 1000 / 60) : '?';
  
  const emoji = remaining <= 5 ? '🔴' : remaining <= 15 ? '🟡' : '🟢';
  
  console.log(`📊 [${endpoint}] Rate Limit: ${emoji} ${remaining}/${limit} remaining | Resets in ${resetIn} min`);
  
  if (remaining <= 5) {
    console.warn(`⚠️ WARNING: Very low rate limit on ${endpoint}! Only ${remaining} requests left.`);
  }
}

function logTwitterError(operation, error) {
  console.error(`\n❌ Twitter API Error in ${operation}:`);
  console.error(`   Message: ${error.message}`);
  
  if (error.code) console.error(`   Code: ${error.code}`);
  if (error.data) console.error(`   Data:`, JSON.stringify(error.data, null, 2));
  
  if (error.code === 429 || error.data?.status === 429 || error.message?.includes('429')) {
    console.error(`   🚫 RATE LIMITED!`);
    if (error.rateLimit) {
      const resetIn = error.rateLimit.reset 
        ? Math.round((new Date(error.rateLimit.reset * 1000) - Date.now()) / 1000 / 60) 
        : '?';
      console.error(`   ⏰ Resets in: ${resetIn} minutes`);
    }
  }
  
  if (error.code === 401 || error.code === 403) {
    console.error(`   🔐 Authentication/Authorization issue.`);
  }
}

// ============ Token Management ============

async function getStoredRefreshToken() {
  const supabase = getSupabase();
  // Use a separate key for BSC reply bot to avoid conflicting with Base vp-social
  const { data } = await supabase
    .from('bot_settings')
    .select('value')
    .eq('key', 'twitter_refresh_token_bsc')
    .maybeSingle();
  
  // Fallback to shared token if BSC-specific doesn't exist
  if (!data?.value) {
    const { data: shared } = await supabase
      .from('bot_settings')
      .select('value')
      .eq('key', 'twitter_refresh_token')
      .maybeSingle();
    return shared?.value;
  }
  
  return data?.value;
}

async function updateStoredRefreshToken(newToken) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('bot_settings')
    .upsert({ key: 'twitter_refresh_token_bsc', value: newToken }, { onConflict: 'key' });
  
  if (error) console.error('❌ Failed to update BSC Twitter Refresh Token:', error);
}

// ============ Initialization ============

export async function initTwitterOAuth2() {
  const refreshToken = await getStoredRefreshToken();
  
  if (!refreshToken) {
    console.error('❌ ERROR: Twitter Refresh Token missing. Cannot authenticate BSC Reply Bot.');
    console.error('   Add twitter_refresh_token_bsc (or twitter_refresh_token) to bot_settings table.');
    return;
  }

  const tempClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  });

  try {
    const { client: refreshedClient, refreshToken: newRefreshToken } = await tempClient.refreshOAuth2Token(refreshToken);
    
    twitterClient = refreshedClient;
    await updateStoredRefreshToken(newRefreshToken);
    
    console.log('✅ Twitter OAuth 2.0 initialized [BSC Reply Bot]');
  } catch (error) {
    console.error('❌ Failed to refresh Twitter token:', error.message);
    console.error('   Ensure TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET are set.');
  }
}

// ============ Posting ============

export async function replyToTweet(tweetId, text) {
  if (!twitterClient) throw new Error('Twitter client not initialized.');
  
  try {
    const result = await twitterClient.v2.tweet(text, { reply: { in_reply_to_tweet_id: tweetId } });
    logRateLimits('POST /tweets (reply)', result.rateLimit);
    return result.data.id;
  } catch (error) {
    logTwitterError('replyToTweet', error);
    throw error;
  }
}

export { twitterClient };
