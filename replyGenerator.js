/**
 * MoniBot BSC Reply Service - Reply Generator
 * All templates use USDT (not BUSD) for BSC network
 */

const recentReplies = [];
const MAX_RECENT = 50;

// ============ Template Banks ============

const GRANT_SUCCESS = [
  'Transfer confirmed on BSC. USDT delivered to your wallet',
  'Grant processed on BNB Chain. Check your balance',
  'Payment complete. Your USDT just landed via BSC',
  'Done on BNB Chain. Funds in your wallet now',
  'BSC grant executed. USDT sent successfully',
  'Processed on BNB Chain. Your USDT has arrived',
  'Grant delivered via BSC network. Wallet updated',
  'USDT transfer complete on BNB Chain',
  'BSC transaction confirmed. Grant received',
  'Funds dispatched on BNB Chain. Check your wallet',
  'Grant settled on BSC. USDT in your account',
  'BNB Chain delivery complete. Funds available now',
];

const P2P_SUCCESS = [
  'Sent on BSC. USDT transferred successfully',
  'Payment complete on BNB Chain. Recipient notified',
  'Transfer done. USDT moved via BSC network',
  'Processed on BNB Chain. Payment delivered',
  'BSC transfer confirmed. USDT sent',
  'Payment settled on BNB Chain. All clear',
  'USDT delivered via BSC. Transaction complete',
  'Transfer executed on BNB Chain successfully',
  'BSC payment processed. Funds moved',
  'Sent via BNB Chain. USDT received on the other end',
  'BSC transfer settled. Payment confirmed',
  'USDT payment routed through BNB Chain. Done',
];

const ERROR_TARGET_NOT_FOUND = [
  'Recipient not found in MoniPay. They need to create an account first',
  'That username does not exist yet. Ask them to sign up',
  'No MoniPay account for that username. Registration required',
  'User not registered on MoniPay. Account needed before receiving',
  'Unknown recipient. They should create a MoniPay wallet first',
  'Recipient has no MoniPay profile. Sign-up needed',
  'That monitag is not registered yet. Invite them to join',
  'No wallet found for that user. MoniPay account required',
  'Recipient unregistered. They can sign up to receive payments',
  'Cannot find that user on MoniPay. Account creation needed',
];

const ERROR_BALANCE = [
  'Insufficient USDT balance on BSC. Add funds to your wallet and try again',
  'Not enough balance for this transaction. Top up your wallet',
  'Balance too low. Deposit USDT to complete this payment',
  'USDT balance insufficient on BNB Chain. Fund your wallet first',
  'Not enough USDT. Add more to your BSC wallet',
  'Transaction failed - low balance. Deposit USDT and retry',
  'Wallet balance too low on BSC. Top up to proceed',
  'Insufficient funds on BNB Chain. Add USDT to continue',
  'Cannot complete - USDT balance short on BSC',
  'Need more USDT in your wallet. Deposit and try again',
];

const ERROR_ALLOWANCE = [
  'Allowance not approved on BSC. Visit your dashboard to enable spending',
  'You need to approve USDT spending first. Check your settings',
  'Approval required on BNB Chain. Go to dashboard to authorize',
  'USDT spending not authorized on BSC. Approve in your wallet',
  'Transaction needs approval. Enable USDT allowance on BSC',
  'Allowance too low on BNB Chain. Increase your approval limit',
  'Spending not permitted yet. Approve USDT in your dashboard',
  'BSC allowance needed. Authorize USDT spending to proceed',
  'No approval set on BNB Chain. Visit settings to enable',
  'USDT not approved for transactions. Set allowance first',
];

const ERROR_LIMIT = [
  'Campaign filled. You were too late for this one',
  'All spots taken. Better luck on the next campaign',
  'Campaign complete. Follow for upcoming opportunities',
  'This campaign has ended. Stay tuned for the next one',
  'Limit reached. Campaign fully distributed',
  'Campaign closed. All grants have been claimed',
  'Too late for this round. Watch for new campaigns',
  'Grant pool exhausted. Next campaign coming soon',
  'All grants distributed for this campaign',
  'Campaign maxed out. Keep an eye out for more',
];

const ERROR_GENERIC = [
  'Transaction could not be completed on BSC. Try again later',
  'Something went wrong on BNB Chain. Please retry',
  'BSC transaction failed. Give it another shot',
  'Error processing on BNB Chain. Try again shortly',
  'Transaction unsuccessful on BSC. Retry in a moment',
];

// ============ Generator Logic ============

function getTemplates(tx) {
  const hash = tx.tx_hash || '';
  const isSuccess = !hash.startsWith('ERROR_') && !hash.startsWith('SKIP_') && !hash.startsWith('LIMIT_');

  if (isSuccess && tx.type === 'grant') return GRANT_SUCCESS;
  if (isSuccess && tx.type === 'p2p_command') return P2P_SUCCESS;
  if (hash.includes('TARGET_NOT_FOUND') || hash.includes('SENDER_NOT_FOUND')) return ERROR_TARGET_NOT_FOUND;
  if (hash.includes('BALANCE')) return ERROR_BALANCE;
  if (hash.includes('ALLOWANCE')) return ERROR_ALLOWANCE;
  if (hash.includes('LIMIT_REACHED')) return ERROR_LIMIT;
  return ERROR_GENERIC;
}

function similarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const word of setA) if (setB.has(word)) overlap++;
  return overlap / Math.max(setA.size, setB.size);
}

function isUnique(text) {
  return !recentReplies.some(r => similarity(r, text) > 0.7);
}

function addToRecent(text) {
  recentReplies.push(text);
  if (recentReplies.length > MAX_RECENT) recentReplies.shift();
}

export function generateReply(tx) {
  const templates = getTemplates(tx);
  const shuffled = [...templates].sort(() => Math.random() - 0.5);

  for (const template of shuffled) {
    if (isUnique(template)) {
      addToRecent(template);
      return template;
    }
  }

  // Fallback: add tx hash suffix for uniqueness
  const base = shuffled[0];
  const suffix = tx.tx_hash ? ` TX: ...${tx.tx_hash.slice(-4)}` : ` [${Date.now().toString(36)}]`;
  const unique = base + suffix;
  addToRecent(unique);
  return unique;
}
