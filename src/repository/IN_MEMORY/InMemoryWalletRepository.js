'use strict';

const { WalletRepository } = require('../WalletRepository');

class InMemoryWalletRepository extends WalletRepository {
  constructor() {
    super();
    this._data = { accounts: {}, sessions: {}, transactions: [] };
  }

  async findAccount(accountId)   { return this._data.accounts[accountId] ?? null; }
  async accountExists(accountId) { return accountId in this._data.accounts; }

  async createAccount(accountId, data) {
    this._data.accounts[accountId] = { ...data };
    return this._data.accounts[accountId];
  }

  async updateAccount(accountId, patch) {
    Object.assign(this._data.accounts[accountId], patch);
    return this._data.accounts[accountId];
  }

  async findSession(sessionId)             { return this._data.sessions[sessionId]; }
  async saveSession(sessionId, accountId)  { this._data.sessions[sessionId] = accountId; }

  async findTransaction(transactionId) {
    return this._data.transactions.find(t => t.transaction_id === transactionId) ?? null;
  }

  async findWagerTransaction(transactionId) {
    return this._data.transactions.find(
      t => t.transaction_id === transactionId && t.type === 'wager'
    ) ?? null;
  }

  async findRefundByOriginalId(originalTransactionId) {
    return this._data.transactions.find(
      t => t.original_transaction_id === originalTransactionId && t.type === 'refund'
    ) ?? null;
  }

  async saveTransaction(record) { this._data.transactions.push(record); }

  async dump() { return this._data; }

  async reset() {
    const { accounts, sessions, transactions } = this._data;
    for (const k of Object.keys(accounts))  delete accounts[k];
    for (const k of Object.keys(sessions))  delete sessions[k];
    transactions.length = 0;
  }
}

module.exports = { InMemoryWalletRepository };
