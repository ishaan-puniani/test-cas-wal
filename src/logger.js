'use strict';

function logCloudagg(req, response) {
  const q  = req.query;
  const ts = new Date().toISOString();
  const isErr = response.code !== 200;
  const tag = isErr
    ? '✗ ERROR'
    : response.status === 'Success - duplicate request' ? '⟳ DUPLICATE' : '✓ OK';

  console.log(
    `\n[${ts}] ${tag} | op=${q.request || 'unknown'} | account=${q.account_id || '-'} | session=${q.session_id || '-'} | txn=${q.transaction_id || '-'} | round=${q.round_id || '-'}` +
    (q.bet_amount       ? ` | bet=${q.bet_amount}`           : '') +
    (q.win_amount       ? ` | win=${q.win_amount}`           : '') +
    (q.jackpot_amount   ? ` | jackpot=${q.jackpot_amount}`   : '') +
    (q.refund_amount    ? ` | refund=${q.refund_amount}`     : '') +
    (q.purchase_amount  ? ` | purchase=${q.purchase_amount}` : '') +
    `\n  → code=${response.code} status="${response.status}"` +
    (response.message         ? ` message="${response.message}"`              : '') +
    (response.balance        != null ? ` balance=${response.balance}`         : '') +
    (response.real_balance   != null ? ` real=${response.real_balance}`       : '') +
    (response.bonus_balance  != null ? ` bonus=${response.bonus_balance}`     : '') +
    (response.wager_tx_id    ? ` wager_tx_id=${response.wager_tx_id}`         : '') +
    (response.result_tx_id   ? ` result_tx_id=${response.result_tx_id}`       : '') +
    (response.refund_tx_id   ? ` refund_tx_id=${response.refund_tx_id}`       : '') +
    (response.wallet_tx_id   ? ` wallet_tx_id=${response.wallet_tx_id}`       : '') +
    (response.purchase_tx_id ? ` purchase_tx_id=${response.purchase_tx_id}`   : '')
  );
}

module.exports = { logCloudagg };
