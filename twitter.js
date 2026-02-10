/**
 * MoniBot BSC Reply Service - Twitter Module (inference.sh)
 */

import { execSync } from 'child_process';

const NON_RECOVERABLE = ['403', '404', 'Forbidden', 'Not Found', 'Duplicate', 'duplicate content'];

/**
 * Post a reply to a tweet via inference.sh CLI
 */
export function postReply(tweetId, text) {
  const input = JSON.stringify({
    text,
    reply: { in_reply_to_tweet_id: tweetId }
  });

  // Escape single quotes in input for shell safety
  const escapedInput = input.replace(/'/g, "'\\''");
  const command = `infsh app run x/post-create --input '${escapedInput}'`;

  try {
    console.log(`   🐦 Posting reply to tweet ${tweetId}...`);
    const result = execSync(command, { encoding: 'utf-8', timeout: 30000 });

    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      // If output isn't JSON but command succeeded, treat as success
      console.log(`   ℹ️ Non-JSON response: ${result.substring(0, 100)}`);
      return { success: true, tweetId: null };
    }

    const newTweetId = parsed?.data?.id || parsed?.id || null;
    return { success: true, tweetId: newTweetId };

  } catch (error) {
    const msg = error.message || '';
    const stderr = error.stderr?.toString() || '';
    const fullError = `${msg} ${stderr}`.substring(0, 300);

    console.error(`   ❌ inference.sh error: ${fullError}`);

    const isNonRecoverable = NON_RECOVERABLE.some(key =>
      fullError.toLowerCase().includes(key.toLowerCase())
    );

    if (isNonRecoverable) {
      const reason = fullError.includes('403') || fullError.includes('Forbidden')
        ? 'TWEET_UNAVAILABLE'
        : fullError.includes('404') || fullError.includes('Not Found')
          ? 'TWEET_NOT_FOUND'
          : 'DUPLICATE_CONTENT';
      return { success: false, nonRecoverable: true, error: reason };
    }

    return { success: false, nonRecoverable: false, error: fullError.substring(0, 200) };
  }
}
