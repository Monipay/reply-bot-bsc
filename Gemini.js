/**
 * MoniBot BSC Reply Service - AI Module
 * 
 * Mirrors vp-social/gemini.js architecture:
 * - Uses Lovable AI via monibot-ai Edge Function
 * - Fallback templates for USDT/BSC context
 * - Rate limit backoff handling
 */

const MONIBOT_AI_URL = process.env.SUPABASE_URL 
  ? `${process.env.SUPABASE_URL}/functions/v1/monibot-ai`
  : 'https://vdaeojxonqmzejwiioaq.supabase.co/functions/v1/monibot-ai';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkYWVvanhvbnFtemVqd2lpb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3Mzk0NjksImV4cCI6MjA4NDMxNTQ2OX0.mzda_ZFMjtOybd47jTIwHlwWpDtv0LCdh4X5WaqjDKM';

let lastQuotaError = 0;
let backoffMs = 0;

export function initGemini() {
  console.log('✅ MoniBot AI initialized (Lovable AI Edge Function) [BSC Reply]');
}

// ============ Fallback Templates (BSC/USDT-specific) ============

const FALLBACK_TEMPLATES = {
  success: [
    "Transfer complete. USDT delivered to your MoniPay wallet on BNB Chain.",
    "Done. Your USDT just landed on BSC. Welcome onchain.",
    "USDT delivered via BNB Smart Chain. That's how MoniPay works.",
    "Sent. Another successful USDT transfer on BSC.",
  ],
  error_allowance: [
    "You need to approve your MoniBot USDT spending allowance first. Open MoniPay → Settings → MoniBot.",
    "Your USDT allowance isn't set up yet. Go to MoniPay Settings to approve spending on BSC.",
  ],
  error_balance: [
    "Not enough USDT in your wallet. Fund your MoniPay BSC account and try again.",
    "Insufficient USDT balance. Top up your MoniPay wallet on BNB Chain first.",
  ],
  error_target: [
    "That monitag doesn't exist. Double-check the spelling or ask the recipient to create a MoniPay account.",
    "Monitag not found. The recipient needs a MoniPay account.",
  ],
  limit_reached: [
    "Campaign is full. All spots have been claimed. Follow MoniBot for the next one.",
    "Too late — this campaign hit its limit. Stay tuned for the next USDT drop.",
  ],
  error_blockchain: [
    "Transaction failed due to a BSC network issue. Try again in a few minutes.",
    "Temporary BNB Chain hiccup. Please retry shortly.",
  ],
  error_duplicate_grant: [
    "You've already claimed from this campaign. One per person.",
    "Already sent USDT to you for this campaign. Check your balance.",
  ],
  error_treasury_empty: [
    "Campaign USDT funds are depleted. Check back for the next one.",
    "This campaign's budget is exhausted. More USDT drops coming soon.",
  ],
  max_retries: [
    "We couldn't process this after multiple attempts. Check your MoniPay account.",
  ],
  skip_no_paytag: [
    "Drop your monitag to claim USDT. Need a MoniPay account? Create one first.",
    "Reply with your monitag to receive USDT. No monitag = no transfer.",
  ],
  skip_campaign_inactive: [
    "This campaign has ended. Follow MoniBot for future USDT drops.",
  ],
  skip_duplicate: [
    "You already received USDT from this campaign. Check your MoniPay balance.",
  ],
  skip_invalid_syntax: [
    "Couldn't parse that. Use: @monibot send $5 usdt to monitag",
    "Invalid format. Try: @monibot send $X usdt to monitag",
  ],
  skip_sender_not_found: [
    "You need a MoniPay account first. Create your monitag to use social payments.",
  ],
  default: [
    "Check your MoniPay account for transaction details.",
    "Transaction processed on BNB Chain. See your MoniPay account for the receipt.",
  ]
};

function getRandomFallback(type) {
  const templates = FALLBACK_TEMPLATES[type] || FALLBACK_TEMPLATES.default;
  return templates[Math.floor(Math.random() * templates.length)];
}

function getTemplateTypeFromTx(tx) {
  const outcome = tx.tx_hash || '';
  const status = tx.status || '';
  
  if (status === 'limit_reached') return 'limit_reached';
  if (outcome.startsWith('0x')) return 'success';
  if (outcome === 'LIMIT_REACHED') return 'limit_reached';
  if (outcome === 'ERROR_ALLOWANCE') return 'error_allowance';
  if (outcome === 'ERROR_BALANCE') return 'error_balance';
  if (outcome === 'ERROR_TARGET_NOT_FOUND') return 'error_target';
  if (outcome === 'ERROR_DUPLICATE_GRANT') return 'error_duplicate_grant';
  if (outcome === 'ERROR_TREASURY_EMPTY') return 'error_treasury_empty';
  if (outcome.includes('ERROR_BLOCKCHAIN')) return 'error_blockchain';
  if (outcome.includes('MAX_RETRIES')) return 'max_retries';
  if (outcome === 'SKIP_NO_PAYTAG') return 'skip_no_paytag';
  if (outcome === 'SKIP_CAMPAIGN_INACTIVE') return 'skip_campaign_inactive';
  if (outcome.includes('SKIP_DUPLICATE')) return 'skip_duplicate';
  if (outcome === 'SKIP_ALREADY_ONCHAIN') return 'skip_duplicate';
  if (outcome === 'SKIP_INVALID_SYNTAX') return 'skip_invalid_syntax';
  if (outcome === 'ERROR_SENDER_NOT_FOUND') return 'skip_sender_not_found';
  
  return 'default';
}

// ============ Edge Function Caller ============

async function callMoniBotAI(action, context) {
  const now = Date.now();
  if (backoffMs > 0 && now < lastQuotaError + backoffMs) {
    const remainingMs = (lastQuotaError + backoffMs) - now;
    console.log(`  ⏳ In backoff period, ${Math.ceil(remainingMs / 1000)}s remaining.`);
    return null;
  }

  try {
    const response = await fetch(MONIBOT_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action, context }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ MoniBot AI error (${response.status}):`, errorText);
      
      if (response.status === 429 || response.status === 402) {
        backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 60000, 300000);
        lastQuotaError = now;
        console.log(`  ⏳ Backoff set to ${Math.ceil(backoffMs / 1000)}s`);
      }
      
      return null;
    }

    const data = await response.json();
    
    if (data.text && !data.fallback) {
      backoffMs = 0;
    }
    
    return data.text;
  } catch (error) {
    console.error('  ❌ MoniBot AI request failed:', error.message);
    return null;
  }
}

// ============ Reply Generation ============

export async function generateReplyWithBackoff(tx) {
  const context = {
    ...tx,
    recipient_tag: tx.recipient_pay_tag || 'unknown',
    payer_tag: tx.payer_pay_tag || 'MoniBot',
    type: tx.type || 'p2p_command',
    status: tx.status || 'completed',
    chain: 'BSC',
    token: 'USDT'
  };
  
  const result = await callMoniBotAI('generate-reply', context);
  const baseText = result || getRandomFallback(getTemplateTypeFromTx(tx));

  if (tx?.tx_hash && String(tx.tx_hash).startsWith('0x')) {
    const recipientLabel = tx.recipient_pay_tag ? `monitag: ${tx.recipient_pay_tag}` : '';
    const shortHash = tx.tx_hash.substring(0, 18) + '...';
    const suffix = recipientLabel ? ` → ${recipientLabel}` : '';
    return `${baseText}${suffix}\n\nTx: ${shortHash}`;
  }

  return baseText;
}
