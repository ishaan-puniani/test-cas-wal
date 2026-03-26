#!/usr/bin/env node

const http = require('http');
const crypto = require('crypto');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.CA_SHARED_SECRET || 'default-secret';
const STRICT_MODE = process.env.STRICT_MODE !== 'false'; // default true

// In-memory stores
const accounts = new Map();
const transactions = new Map();
const rounds = new Map();
const accountLimits = new Map(); // Track wagers per day for limits

// Supported currencies
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'INR', 'COINS', 'CHIPS'];

// Initialize a test account
function initTestAccount() {
  const testAccount = 'PLR_78345';
  accounts.set(testAccount, {
    account_id: testAccount,
    currency: 'EUR',
    language: 'en_GB',
    country: 'SE',
    city: 'Stockholm',
    real_balance: 300.00,
    bonus_balance: 50.00,
    status: 'active', // 'active' or 'blocked'
    blocked_reason: null,
  });

  // Initialize limits for this account
  accountLimits.set(testAccount, {
    daily_wager_limit: 1000.00, // Max wager per day
    daily_loss_limit: 500.00, // Max loss per day
    session_time_limit: 120, // Minutes
    deposit_limit: 5000.00, // Max deposit per day
    daily_wagered: 0.00, // Today's total wagers
    daily_losses: 0.00, // Today's total losses
    session_start: Date.now(),
  });
}

/**
 * Verify HMAC signature from X-CA-Signature header
 */
function verifySignature(bodyString, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SHARED_SECRET);
  hmac.update(bodyString);
  const computed = hmac.digest('hex');
  return computed === signature;
}

/**
 * Validate currency is supported
 */
function validateCurrency(currency) {
  return SUPPORTED_CURRENCIES.includes(currency);
}

/**
 * Check if account is blocked
 */
function isAccountBlocked(account) {
  return account.status === 'blocked';
}

/**
 * Check responsible gaming limits
 */
function checkGamingLimits(accountId, betAmount) {
  const limits = accountLimits.get(accountId);
  if (!limits) return null; // No limits configured

  // Check daily wager limit
  if (limits.daily_wagered + betAmount > limits.daily_wager_limit) {
    return {
      code: 1019,
      status: 'Gaming Limit',
      message: `Daily wager limit (${limits.daily_wager_limit}) would be exceeded`,
    };
  }

  // Check session time limit (in minutes)
  const sessionElapsed = (Date.now() - limits.session_start) / 1000 / 60;
  if (sessionElapsed > limits.session_time_limit) {
    return {
      code: 1019,
      status: 'Gaming Limit',
      message: `Session time limit (${limits.session_time_limit} minutes) exceeded`,
    };
  }

  return null; // All limits OK
}

/**
 * Update account limits after wager
 */
function updateLimitsAfterWager(accountId, betAmount) {
  const limits = accountLimits.get(accountId);
  if (limits) {
    limits.daily_wagered += betAmount;
  }
}

/**
 * Update account limits after result
 */
function updateLimitsAfterResult(accountId, betAmount, winAmount) {
  const limits = accountLimits.get(accountId);
  if (limits) {
    const loss = betAmount - winAmount;
    if (loss > 0) {
      limits.daily_losses += loss;
    }
  }
}

/**
 * Parse and validate query parameters
 */
function parseParams(query) {
  const params = {};
  for (const key in query) {
    params[key] = query[key];
  }
  return params;
}

/**
 * Check if a required parameter is missing
 */
function validateRequired(params, required) {
  const missing = required.filter(p => !params[p]);
  return missing.length === 0 ? null : missing;
}

/**
 * GetAccount endpoint
 */
function handleGetAccount(params) {
  const required = ['session_id', 'account_id', 'device', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 1003,
      status: 'Authentication Failed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  return {
    code: 200,
    status: 'Success',
    account_id: account.account_id,
    currency: account.currency,
    language: account.language,
    country: account.country,
    city: account.city,
    session_id: params.session_id,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * GetBalance endpoint
 */
function handleGetBalance(params) {
  const required = ['session_id', 'account_id', 'device', 'game_id', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 1003,
      status: 'Authentication Failed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  return {
    code: 200,
    status: 'Success',
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * Wager endpoint
 */
function handleWager(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'round_id', 'game_id', 'bet_amount', 'device', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const betAmount = parseFloat(params.bet_amount);
  if (isNaN(betAmount) || betAmount < 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Invalid bet amount',
      api_version: params.api_version,
    };
  }

  // Check for duplicate transaction
  const existingTxn = transactions.get(params.transaction_id);
  if (existingTxn) {
    if (
      existingTxn.account_id === params.account_id &&
      existingTxn.round_id === params.round_id &&
      parseFloat(existingTxn.bet_amount) === betAmount
    ) {
      // Idempotent: return original response with current balance
      const account = accounts.get(params.account_id);
      return {
        code: 200,
        status: 'Success - duplicate request',
        wager_tx_id: existingTxn.wager_tx_id,
        balance: account.real_balance + account.bonus_balance,
        real_balance: account.real_balance,
        bonus_balance: account.bonus_balance,
        real_money_bet: existingTxn.real_money_bet,
        bonus_money_bet: existingTxn.bonus_money_bet,
        game_mode: 1,
        wallet_order: 'cash_money,bonus_money',
        api_version: params.api_version,
      };
    } else {
      // Parameter mismatch
      return {
        code: 400,
        status: 'Transaction Parameter Mismatch',
        message: 'Duplicate transaction_id with different parameters',
        api_version: params.api_version,
      };
    }
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  // Check if account is blocked (1035)
  if (isAccountBlocked(account)) {
    return {
      code: 1035,
      status: 'Account Blocked',
      message: `Account is blocked: ${account.blocked_reason || 'suspended'}`,
      api_version: params.api_version,
    };
  }

  // Check if currency is registered (1007)
  if (!validateCurrency(account.currency)) {
    return {
      code: 1007,
      status: 'Unknown Currency',
      message: `Currency ${account.currency} is not registered for this operator`,
      api_version: params.api_version,
    };
  }

  const totalBalance = account.real_balance + account.bonus_balance;
  if (totalBalance < betAmount) {
    return {
      code: 1006,
      status: 'Out of Money',
      message: 'Insufficient funds',
      api_version: params.api_version,
    };
  }

  // Check responsible gaming limits (1019)
  const limitError = checkGamingLimits(params.account_id, betAmount);
  if (limitError) {
    return {
      ...limitError,
      api_version: params.api_version,
    };
  }

  // Check if round is already closed
  const existingRound = rounds.get(params.round_id);
  if (existingRound && existingRound.status === 'completed') {
    return {
      code: 409,
      status: 'Round Closed',
      message: 'Round already completed',
      api_version: params.api_version,
    };
  }

  // Deduct wager (from real balance first, then bonus)
  let realBet = Math.min(account.real_balance, betAmount);
  let bonusBet = betAmount - realBet;

  account.real_balance -= realBet;
  account.bonus_balance -= bonusBet;

  // Update limits after successful wager
  updateLimitsAfterWager(params.account_id, betAmount);

  // Store transaction
  const wagerTxId = `WALL_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  transactions.set(params.transaction_id, {
    type: 'wager',
    account_id: params.account_id,
    transaction_id: params.transaction_id,
    round_id: params.round_id,
    bet_amount: betAmount,
    wager_tx_id: wagerTxId,
    real_money_bet: realBet,
    bonus_money_bet: bonusBet,
  });

  // Create/update round
  rounds.set(params.round_id, {
    round_id: params.round_id,
    account_id: params.account_id,
    status: 'open',
    wager_transaction_id: params.transaction_id,
  });

  return {
    code: 200,
    status: 'Success',
    wager_tx_id: wagerTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    real_money_bet: realBet,
    bonus_money_bet: bonusBet,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * Result endpoint
 */
function handleResult(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'round_id', 'game_id', 'win_amount', 'game_status', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const winAmount = parseFloat(params.win_amount);
  if (isNaN(winAmount) || winAmount < 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Invalid win amount',
      api_version: params.api_version,
    };
  }

  // Check for duplicate transaction
  const existingTxn = transactions.get(params.transaction_id);
  if (existingTxn && existingTxn.type === 'result') {
    if (
      existingTxn.account_id === params.account_id &&
      existingTxn.round_id === params.round_id &&
      parseFloat(existingTxn.win_amount) === winAmount
    ) {
      // Idempotent: return original response with current balance
      const account = accounts.get(params.account_id);
      return {
        code: 200,
        status: 'Success - duplicate request',
        result_tx_id: existingTxn.result_tx_id,
        balance: account.real_balance + account.bonus_balance,
        real_balance: account.real_balance,
        bonus_balance: account.bonus_balance,
        real_money_win: existingTxn.real_money_win,
        bonus_win: existingTxn.bonus_win,
        game_mode: 1,
        wallet_order: 'cash_money,bonus_money',
        api_version: params.api_version,
      };
    } else {
      return {
        code: 400,
        status: 'Transaction Parameter Mismatch',
        message: 'Duplicate transaction_id with different parameters',
        api_version: params.api_version,
      };
    }
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  // Check if round exists and status
  const round = rounds.get(params.round_id);
  if (!round) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Round not found',
      api_version: params.api_version,
    };
  }

  if (params.game_status === 'completed' && round.status === 'completed') {
    return {
      code: 409,
      status: 'Round Closed',
      message: 'Round already completed',
      api_version: params.api_version,
    };
  }

  // Credit win (to real balance first, then bonus)
  let realWin = Math.min(winAmount, 10000); // arbitrary max for demo
  let bonusWin = winAmount - realWin;

  account.real_balance += realWin;
  account.bonus_balance += bonusWin;

  // Store transaction
  const resultTxId = `WALL_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  transactions.set(params.transaction_id, {
    type: 'result',
    account_id: params.account_id,
    transaction_id: params.transaction_id,
    round_id: params.round_id,
    win_amount: winAmount,
    result_tx_id: resultTxId,
    real_money_win: realWin,
    bonus_win: bonusWin,
  });

  // Update round status if completed
  if (params.game_status === 'completed') {
    round.status = 'completed';
  }

  return {
    code: 200,
    status: 'Success',
    result_tx_id: resultTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    real_money_win: realWin,
    bonus_win: bonusWin,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * WagerAndResult endpoint
 */
function handleWagerAndResult(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'round_id', 'game_id', 'bet_amount', 'win_amount', 'game_status', 'device', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const betAmount = parseFloat(params.bet_amount);
  const winAmount = parseFloat(params.win_amount);

  if (isNaN(betAmount) || betAmount < 0 || isNaN(winAmount) || winAmount < 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Invalid bet or win amount',
      api_version: params.api_version,
    };
  }

  // Check for duplicate
  const existingTxn = transactions.get(params.transaction_id);
  if (existingTxn && existingTxn.type === 'wagerAndResult') {
    if (
      existingTxn.account_id === params.account_id &&
      existingTxn.round_id === params.round_id &&
      parseFloat(existingTxn.bet_amount) === betAmount &&
      parseFloat(existingTxn.win_amount) === winAmount
    ) {
      const account = accounts.get(params.account_id);
      return {
        code: 200,
        status: 'Success - duplicate request',
        wager_tx_id: existingTxn.wager_tx_id,
        result_tx_id: existingTxn.result_tx_id,
        balance: account.real_balance + account.bonus_balance,
        real_balance: account.real_balance,
        bonus_balance: account.bonus_balance,
        real_money_bet: existingTxn.real_money_bet,
        bonus_money_bet: existingTxn.bonus_money_bet,
        real_money_win: existingTxn.real_money_win,
        bonus_win: existingTxn.bonus_win,
        game_mode: 1,
        wallet_order: 'cash_money,bonus_money',
        api_version: params.api_version,
      };
    } else {
      return {
        code: 400,
        status: 'Transaction Parameter Mismatch',
        message: 'Duplicate transaction_id with different parameters',
        api_version: params.api_version,
      };
    }
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  const totalBalance = account.real_balance + account.bonus_balance;
  if (totalBalance < betAmount) {
    return {
      code: 1006,
      status: 'Out of Money',
      message: 'Insufficient funds',
      api_version: params.api_version,
    };
  }

  // Deduct wager
  let realBet = Math.min(account.real_balance, betAmount);
  let bonusBet = betAmount - realBet;
  account.real_balance -= realBet;
  account.bonus_balance -= bonusBet;

  // Credit win
  let realWin = Math.min(winAmount, 10000);
  let bonusWin = winAmount - realWin;
  account.real_balance += realWin;
  account.bonus_balance += bonusWin;

  // Store transaction
  const wagerTxId = `WALL_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const resultTxId = `WALL_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  transactions.set(params.transaction_id, {
    type: 'wagerAndResult',
    account_id: params.account_id,
    transaction_id: params.transaction_id,
    round_id: params.round_id,
    bet_amount: betAmount,
    win_amount: winAmount,
    wager_tx_id: wagerTxId,
    result_tx_id: resultTxId,
    real_money_bet: realBet,
    bonus_money_bet: bonusBet,
    real_money_win: realWin,
    bonus_win: bonusWin,
  });

  // Update round
  rounds.set(params.round_id, {
    round_id: params.round_id,
    account_id: params.account_id,
    status: params.game_status === 'completed' ? 'completed' : 'open',
  });

  return {
    code: 200,
    status: 'Success',
    wager_tx_id: wagerTxId,
    result_tx_id: resultTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    real_money_bet: realBet,
    bonus_money_bet: bonusBet,
    real_money_win: realWin,
    bonus_win: bonusWin,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * Refund endpoint
 */
function handleRefund(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'game_id', 'device', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  // Find the original wager
  const wagerTxn = transactions.get(params.transaction_id);
  if (!wagerTxn || wagerTxn.type !== 'wager') {
    return {
      code: 102,
      status: 'Wager Not Found',
      message: 'No wager matching the transaction_id',
      api_version: params.api_version,
    };
  }

  // Check if result already exists for this round
  const resultTxns = Array.from(transactions.values()).filter(
    t => t.type === 'result' && t.round_id === wagerTxn.round_id
  );
  if (resultTxns.length > 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Result already exists for this round',
      api_version: params.api_version,
    };
  }

  // Check for duplicate refund
  const existingRefund = transactions.get(`refund_${params.transaction_id}`);
  if (existingRefund) {
    const account = accounts.get(params.account_id);
    return {
      code: 200,
      status: 'Success - duplicate request',
      refund_tx_id: existingRefund.refund_tx_id,
      balance: account.real_balance + account.bonus_balance,
      real_balance: account.real_balance,
      bonus_balance: account.bonus_balance,
      game_mode: 1,
      wallet_order: 'cash_money,bonus_money',
      api_version: params.api_version,
    };
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 1,
      status: 'Technical Error',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  // Refund the wager
  account.real_balance += wagerTxn.real_money_bet;
  account.bonus_balance += wagerTxn.bonus_money_bet;

  const refundTxId = `WALL_RB_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  transactions.set(`refund_${params.transaction_id}`, {
    type: 'refund',
    refund_tx_id: refundTxId,
  });

  return {
    code: 200,
    status: 'Success',
    refund_tx_id: refundTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * Jackpot endpoint
 */
function handleJackpot(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'round_id', 'game_id', 'jackpot_amount', 'game_status', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const jackpotAmount = parseFloat(params.jackpot_amount);
  if (isNaN(jackpotAmount) || jackpotAmount < 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Invalid jackpot amount',
      api_version: params.api_version,
    };
  }

  // Check for duplicate
  const existingTxn = transactions.get(params.transaction_id);
  if (existingTxn && existingTxn.type === 'jackpot') {
    if (
      existingTxn.account_id === params.account_id &&
      existingTxn.round_id === params.round_id &&
      parseFloat(existingTxn.jackpot_amount) === jackpotAmount
    ) {
      const account = accounts.get(params.account_id);
      return {
        code: 200,
        status: 'Success - duplicate request',
        wallet_tx_id: existingTxn.wallet_tx_id,
        balance: account.real_balance + account.bonus_balance,
        real_balance: account.real_balance,
        bonus_balance: account.bonus_balance,
        real_money_win: existingTxn.real_money_win,
        bonus_win: existingTxn.bonus_win,
        api_version: params.api_version,
      };
    } else {
      return {
        code: 400,
        status: 'Transaction Parameter Mismatch',
        message: 'Duplicate transaction_id with different parameters',
        api_version: params.api_version,
      };
    }
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  // Credit jackpot (to real balance first)
  let realWin = Math.min(jackpotAmount, 50000);
  let bonusWin = jackpotAmount - realWin;

  account.real_balance += realWin;
  account.bonus_balance += bonusWin;

  const walletTxId = `WALL_JP_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  transactions.set(params.transaction_id, {
    type: 'jackpot',
    account_id: params.account_id,
    transaction_id: params.transaction_id,
    round_id: params.round_id,
    jackpot_amount: jackpotAmount,
    wallet_tx_id: walletTxId,
    real_money_win: realWin,
    bonus_win: bonusWin,
  });

  return {
    code: 200,
    status: 'Success',
    wallet_tx_id: walletTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    real_money_win: realWin,
    bonus_win: bonusWin,
    api_version: params.api_version,
  };
}

/**
 * Purchase endpoint
 */
function handlePurchase(params) {
  const required = ['session_id', 'account_id', 'transaction_id', 'purchase_amount', 'device', 'api_version'];
  const missing = validateRequired(params, required);
  if (missing) {
    return {
      code: 1008,
      status: 'Parameter Required',
      message: `Missing parameters: ${missing.join(', ')}`,
      api_version: params.api_version || '2.0',
    };
  }

  const purchaseAmount = parseFloat(params.purchase_amount);
  if (isNaN(purchaseAmount) || purchaseAmount < 0) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Invalid purchase amount',
      api_version: params.api_version,
    };
  }

  // Check for duplicate
  const existingTxn = transactions.get(params.transaction_id);
  if (existingTxn && existingTxn.type === 'purchase') {
    if (
      existingTxn.account_id === params.account_id &&
      parseFloat(existingTxn.purchase_amount) === purchaseAmount
    ) {
      const account = accounts.get(params.account_id);
      return {
        code: 200,
        status: 'Success - duplicate request',
        purchase_tx_id: existingTxn.purchase_tx_id,
        balance: account.real_balance + account.bonus_balance,
        real_balance: account.real_balance,
        bonus_balance: account.bonus_balance,
        real_money_bet: existingTxn.real_money_bet,
        bonus_money_bet: existingTxn.bonus_money_bet,
        game_mode: 1,
        wallet_order: 'cash_money,bonus_money',
        api_version: params.api_version,
      };
    } else {
      return {
        code: 400,
        status: 'Transaction Parameter Mismatch',
        message: 'Duplicate transaction_id with different parameters',
        api_version: params.api_version,
      };
    }
  }

  const account = accounts.get(params.account_id);
  if (!account) {
    return {
      code: 110,
      status: 'Operation Not Allowed',
      message: 'Account not found',
      api_version: params.api_version,
    };
  }

  const totalBalance = account.real_balance + account.bonus_balance;
  if (totalBalance < purchaseAmount) {
    return {
      code: 1006,
      status: 'Out of Money',
      message: 'Insufficient funds',
      api_version: params.api_version,
    };
  }

  // Deduct purchase
  let realAmount = Math.min(account.real_balance, purchaseAmount);
  let bonusAmount = purchaseAmount - realAmount;

  account.real_balance -= realAmount;
  account.bonus_balance -= bonusAmount;

  const purchaseTxId = `OP_TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  transactions.set(params.transaction_id, {
    type: 'purchase',
    account_id: params.account_id,
    transaction_id: params.transaction_id,
    purchase_amount: purchaseAmount,
    purchase_tx_id: purchaseTxId,
    real_money_bet: realAmount,
    bonus_money_bet: bonusAmount,
  });

  return {
    code: 200,
    status: 'Success',
    purchase_tx_id: purchaseTxId,
    balance: account.real_balance + account.bonus_balance,
    real_balance: account.real_balance,
    bonus_balance: account.bonus_balance,
    real_money_bet: realAmount,
    bonus_money_bet: bonusAmount,
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    api_version: params.api_version,
  };
}

/**
 * Main request handler
 */
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  res.setHeader('Content-Type', 'application/json');

  // Swagger UI endpoint
  if (pathname === '/api-docs' || pathname === '/swagger-ui') {
    res.setHeader('Content-Type', 'text/html');
    const swaggerUIHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>CloudAggregator Mock Wallet - API Docs</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
          <style>
            html {
              box-sizing: border-box;
              overflow: -moz-scrollbars-vertical;
              overflow-y: scroll;
            }
            *,
            *:before,
            *:after {
              box-sizing: inherit;
            }
            body {
              margin:0;
              padding:0;
            }
          </style>
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
          <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-standalone-preset.js"></script>
          <script>
            window.onload = function() {
              SwaggerUIBundle({
                url: "http://localhost:3000/swagger.json",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIStandalonePreset
                ],
                plugins: [
                  SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout"
              })
            }
          </script>
        </body>
      </html>
    `;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(swaggerUIHtml);
    return;
  }

  // Swagger JSON endpoint
  if (pathname === '/swagger.json') {
    try {
      const swaggerPath = path.join(__dirname, 'swagger.json');
      const swaggerContent = fs.readFileSync(swaggerPath, 'utf8');
      const swaggerObj = JSON.parse(swaggerContent);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(swaggerObj, null, 2));
      return;
    } catch (err) {
      console.error('Error reading swagger.json:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to load swagger spec' }));
      return;
    }
  }

  if (pathname === '/cloudagg') {
    const signature = req.headers['x-ca-signature'];

    // In STRICT_MODE, signature is required
    if (STRICT_MODE && !signature) {
      res.writeHead(401);
      res.end(JSON.stringify({
        code: 401,
        status: 'Unauthorized',
        message: 'X-CA-Signature header required in strict mode',
      }));
      return;
    }

    // Verify signature if present
    if (signature) {
      const bodyString = ''; // GET requests have empty body
      if (!verifySignature(bodyString, signature)) {
        res.writeHead(401);
        res.end(JSON.stringify({
          code: 401,
          status: 'Unauthorized',
          message: 'Invalid signature',
        }));
        return;
      }
    }

    const params = parseParams(query);
    const request = params.request;

    let response;
    switch (request) {
      case 'getaccount':
        response = handleGetAccount(params);
        break;
      case 'getbalance':
        response = handleGetBalance(params);
        break;
      case 'wager':
        response = handleWager(params);
        break;
      case 'result':
        response = handleResult(params);
        break;
      case 'wagerAndResult':
        response = handleWagerAndResult(params);
        break;
      case 'refund':
        response = handleRefund(params);
        break;
      case 'jackpot':
        response = handleJackpot(params);
        break;
      case 'purchase':
        response = handlePurchase(params);
        break;
      default:
        response = {
          code: 1008,
          status: 'Parameter Required',
          message: 'Unknown request type',
        };
    }

    res.writeHead(200);
    res.end(JSON.stringify(response));
  } else if (pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// Initialize test data
initTestAccount();

// Create and start server
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Mock Operator Wallet Server running on port ${PORT}`);
  console.log(`Strict Mode: ${STRICT_MODE}`);
  console.log(`Listening at http://localhost:${PORT}/cloudagg`);
});
