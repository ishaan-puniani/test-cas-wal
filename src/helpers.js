'use strict';

const API_VERSION = '2.0';

function ok(extra)                   { return { code: 200, status: 'Success', api_version: API_VERSION, ...extra }; }
function dup(extra)                  { return { code: 200, status: 'Success - duplicate request', api_version: API_VERSION, ...extra }; }
function err(code, status, message)  { return { code, status, message, api_version: API_VERSION }; }

function balanceFields(acct) {
  const real  = parseFloat(acct.real_balance)  || 0;
  const bonus = parseFloat(acct.bonus_balance) || 0;
  return {
    balance:       parseFloat((real + bonus).toFixed(2)),
    real_balance:  real,
    bonus_balance: bonus,
    game_mode:     acct.game_mode,
    wallet_order:  acct.wallet_order,
  };
}

const { randomBytes } = require('crypto');
function txnId() {
  return 'WALL_TXN_' + randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { API_VERSION, ok, dup, err, balanceFields, txnId };
