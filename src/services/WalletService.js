'use strict';

const { balanceFields, txnId } = require('../helpers');
const { ValidationError, AuthError, BusinessError, DuplicateError } = require('../errors');

class WalletService {
  constructor(repository) {
    this.repo = repository;
  }

  async getAccount({ session_id, account_id }) {
    if (!session_id || !account_id)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    const existingSession = await this.repo.findSession(session_id);
    if (!existingSession)
      await this.repo.saveSession(session_id, account_id);
    else if (existingSession !== account_id)
      throw new AuthError(1003, 'Authentication Failed', 'authentication_failed');

    const acct = await this.repo.findAccount(account_id);
    if (!acct) throw new AuthError(1003, 'Authentication Failed', 'authentication_failed');

    return {
      account_id,
      currency:      acct.currency,
      language:      acct.language,
      country:       acct.country,
      city:          acct.city,
      session_id,
      real_balance:  acct.real_balance,
      bonus_balance: acct.bonus_balance,
    };
  }

  async getBalance({ session_id, account_id }) {
    if (!session_id || !account_id)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    if (await this.repo.findSession(session_id) !== account_id)
      throw new AuthError(1000, 'Not Logged On', 'session_invalid');

    const acct = await this.repo.findAccount(account_id);
    if (!acct) throw new AuthError(1000, 'Not Logged On', 'session_invalid');

    return balanceFields(acct);
  }

  async wager({ session_id, account_id, transaction_id, round_id, bet_amount }) {
    if (!session_id || !account_id || !transaction_id || !bet_amount)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    if (await this.repo.findSession(session_id) !== account_id)
      throw new AuthError(1000, 'Not Logged On', 'session_invalid');

    const acct = await this.repo.findAccount(account_id);
    if (!acct)        throw new AuthError(1000, 'Not Logged On', 'session_invalid');
    if (acct.blocked) throw new BusinessError(1035, 'Account Blocked', 'account_blocked');

    const existing = await this.repo.findTransaction(transaction_id);
    if (existing) {
      if (existing.account_id !== account_id || existing.amount !== parseFloat(bet_amount))
        throw new BusinessError(400, 'Transaction Parameter Mismatch', 'Transaction parameter mismatch');
      throw new DuplicateError(existing.response);
    }

    const bet = parseFloat(bet_amount);
    if (bet < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    if (acct.real_balance + acct.bonus_balance < bet)
      throw new BusinessError(1006, 'Out of Money', 'insufficient_funds');

    const updated    = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance - bet).toFixed(2)),
    });
    const wager_tx_id = txnId();
    const response = { wager_tx_id, real_money_bet: bet, bonus_money_bet: 0.0, ...balanceFields(updated) };
    await this.repo.saveTransaction({ transaction_id, type: 'wager', account_id, round_id, amount: bet, response });
    return response;
  }

  async result({ account_id, transaction_id, round_id, win_amount }) {
    if (!account_id || !transaction_id || !win_amount)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    const acct = await this.repo.findAccount(account_id);
    if (!acct) throw new BusinessError(1, 'Technical Error', 'internal_error');

    const existing = await this.repo.findTransaction(transaction_id);
    if (existing) {
      if (existing.account_id !== account_id || existing.amount !== parseFloat(win_amount))
        throw new BusinessError(400, 'Transaction Parameter Mismatch', 'Transaction parameter mismatch');
      throw new DuplicateError(existing.response);
    }

    const win     = parseFloat(win_amount);
    if (win < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    const updated = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance + win).toFixed(2)),
    });
    const result_tx_id = txnId();
    const response = { result_tx_id, real_money_win: win, bonus_win: 0.0, ...balanceFields(updated) };
    await this.repo.saveTransaction({ transaction_id, type: 'result', account_id, round_id, amount: win, response });
    return response;
  }

  async wagerAndResult({ session_id, account_id, transaction_id, round_id, bet_amount, win_amount }) {
    if (!session_id || !account_id || !transaction_id || !bet_amount || !win_amount)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    if (await this.repo.findSession(session_id) !== account_id)
      throw new AuthError(1000, 'Not Logged On', 'session_invalid');

    const acct = await this.repo.findAccount(account_id);
    if (!acct)        throw new AuthError(1000, 'Not Logged On', 'session_invalid');
    if (acct.blocked) throw new BusinessError(1035, 'Account Blocked', 'account_blocked');

    const existing = await this.repo.findTransaction(transaction_id);
    if (existing) throw new DuplicateError(existing.response);

    const bet = parseFloat(bet_amount);
    const win = parseFloat(win_amount);
    if (bet < 0 || win < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    if (acct.real_balance + acct.bonus_balance < bet)
      throw new BusinessError(1006, 'Out of Money', 'insufficient_funds');

    const updated      = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance - bet + win).toFixed(2)),
    });
    const wager_tx_id = txnId(), result_tx_id = txnId();
    const response = {
      wager_tx_id, result_tx_id,
      real_money_bet: bet, bonus_money_bet: 0.0,
      real_money_win: win, bonus_win: 0.0,
      ...balanceFields(updated),
    };
    await this.repo.saveTransaction({ transaction_id, type: 'wagerAndResult', account_id, round_id, amount: bet, response });
    return response;
  }

  async refund({ account_id, transaction_id, refund_amount }) {
    if (!account_id || !transaction_id)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    const acct = await this.repo.findAccount(account_id);
    if (!acct) throw new BusinessError(1, 'Technical Error', 'internal_error');

    const original = await this.repo.findWagerTransaction(transaction_id);
    if (!original) {
      const anyTxn = await this.repo.findTransaction(transaction_id);
      if (anyTxn) throw new BusinessError(5007, 'Refund not allowed over win transactions', 'refund_not_allowed_over_win');
      throw new BusinessError(102, 'Wager Not Found', 'wager_not_found');
    }

    const existingRefund = await this.repo.findRefundByOriginalId(transaction_id);
    if (existingRefund) throw new DuplicateError(existingRefund.response);

    const amount  = refund_amount ? parseFloat(refund_amount) : original.amount;
    if (amount < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    const updated = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance + amount).toFixed(2)),
    });
    const refund_tx_id = txnId();
    const response = { refund_tx_id, ...balanceFields(updated) };
    await this.repo.saveTransaction({
      transaction_id: 'refund_' + transaction_id,
      original_transaction_id: transaction_id,
      type: 'refund', account_id, amount, response,
    });
    return response;
  }

  async jackpot({ account_id, transaction_id, jackpot_amount }) {
    if (!account_id || !transaction_id || !jackpot_amount)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    const acct = await this.repo.findAccount(account_id);
    if (!acct) throw new BusinessError(1, 'Technical Error', 'internal_error');

    const existing = await this.repo.findTransaction(transaction_id);
    if (existing) {
      if (existing.account_id !== account_id)
        throw new BusinessError(400, 'Transaction Parameter Mismatch', 'Transaction parameter mismatch');
      throw new DuplicateError(existing.response);
    }

    const amount  = parseFloat(jackpot_amount);
    if (amount < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    const updated = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance + amount).toFixed(2)),
    });
    const wallet_tx_id = txnId();
    const response = { wallet_tx_id, real_money_win: amount, bonus_win: 0.0, ...balanceFields(updated) };
    await this.repo.saveTransaction({ transaction_id, type: 'jackpot', account_id, amount, response });
    return response;
  }

  async purchase({ account_id, transaction_id, purchase_amount }) {
    if (!account_id || !transaction_id || !purchase_amount)
      throw new ValidationError(1008, 'Parameter Required', 'missing_parameter');

    const acct = await this.repo.findAccount(account_id);
    if (!acct)        throw new BusinessError(1, 'Technical Error', 'internal_error');
    if (acct.blocked) throw new BusinessError(1035, 'Account Blocked', 'account_blocked');

    const existing = await this.repo.findTransaction(transaction_id);
    if (existing) throw new DuplicateError(existing.response);

    const amount = parseFloat(purchase_amount);
    if (amount < 0)
      throw new BusinessError(5002, 'Transaction amount cannot be negative', 'amount_invalid');
    if (acct.real_balance + acct.bonus_balance < amount)
      throw new BusinessError(1006, 'Out of Money', 'insufficient_funds');

    const updated = await this.repo.updateAccount(account_id, {
      real_balance: parseFloat((acct.real_balance - amount).toFixed(2)),
    });
    const purchase_tx_id = txnId();
    const response = { purchase_tx_id, real_money_bet: amount, bonus_money_bet: 0.0, ...balanceFields(updated) };
    await this.repo.saveTransaction({ transaction_id, type: 'purchase', account_id, amount, response });
    return response;
  }
}

module.exports = { WalletService };
