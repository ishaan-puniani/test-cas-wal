'use strict';

const mongoose = require('mongoose');
const { WalletRepository } = require('../WalletRepository');

// ── Schemas ──────────────────────────────────────────────────────────────────

const accountSchema = new mongoose.Schema(
  {
    _id:            String,   // accountId is the primary key
    real_balance:   { type: Number, default: 0 },
    bonus_balance:  { type: Number, default: 0 },
    currency:       { type: String, default: 'EUR' },
    language:       { type: String, default: 'en' },
    country:        { type: String, default: '' },
    city:           { type: String, default: '' },
    game_mode:      { type: Number, default: 1 },
    wallet_order:   { type: String, default: 'cash_money,bonus_money' },
    blocked:        { type: Boolean, default: false },
  },
  { versionKey: false }
);

const sessionSchema = new mongoose.Schema(
  {
    _id:        String,   // sessionId is the primary key
    account_id: { type: String, required: true },
  },
  { versionKey: false }
);

const transactionSchema = new mongoose.Schema(
  {
    transaction_id:          { type: String, required: true, index: true },
    original_transaction_id: { type: String, index: true },
    type:                    { type: String, required: true },  // wager | result | refund | jackpot | purchase | wagerAndResult
    account_id:              String,
    amount:                  Number,
    currency:                String,
    round_id:                String,
    session_id:              String,
    created_at:              { type: Date, default: Date.now },
  },
  { versionKey: false, strict: false }   // strict:false so extra call fields survive
);

// Prevent model re-registration during hot-reload / test runs
const Account     = mongoose.models.WalletAccount     || mongoose.model('WalletAccount',     accountSchema,     'wallet_accounts');
const Session     = mongoose.models.WalletSession     || mongoose.model('WalletSession',     sessionSchema,     'wallet_sessions');
const Transaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', transactionSchema, 'wallet_transactions');

// ── Repository ────────────────────────────────────────────────────────────────

class MongoWalletRepository extends WalletRepository {
  // ── Accounts ──

  async findAccount(accountId) {
    const doc = await Account.findById(accountId).lean();
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  }

  async accountExists(accountId) {
    return !!(await Account.exists({ _id: accountId }));
  }

  async createAccount(accountId, data) {
    const doc = await Account.create({ _id: accountId, ...data });
    const { _id, ...rest } = doc.toObject();
    return rest;
  }

  async updateAccount(accountId, patch) {
    const doc = await Account.findByIdAndUpdate(
      accountId,
      { $set: patch },
      { new: true, lean: true }
    );
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  }

  // ── Sessions ──

  async findSession(sessionId) {
    const doc = await Session.findById(sessionId).lean();
    return doc ? doc.account_id : undefined;
  }

  async saveSession(sessionId, accountId) {
    await Session.findByIdAndUpdate(
      sessionId,
      { _id: sessionId, account_id: accountId },
      { upsert: true, new: true }
    );
  }

  // ── Transactions ──

  async findTransaction(transactionId) {
    return await Transaction.findOne({ transaction_id: transactionId }).lean() ?? null;
  }

  async findWagerTransaction(transactionId) {
    return await Transaction.findOne({ transaction_id: transactionId, type: 'wager' }).lean() ?? null;
  }

  async findRefundByOriginalId(originalTransactionId) {
    return await Transaction.findOne({ original_transaction_id: originalTransactionId, type: 'refund' }).lean() ?? null;
  }

  async saveTransaction(record) {
    await Transaction.create(record);
  }

  // ── Maintenance ──

  async dump() {
    const [accounts, sessions, transactions] = await Promise.all([
      Account.find().lean(),
      Session.find().lean(),
      Transaction.find().sort({ created_at: 1 }).lean(),
    ]);

    const accountsMap = {};
    for (const { _id, ...rest } of accounts) accountsMap[_id] = rest;

    const sessionsMap = {};
    for (const { _id, account_id } of sessions) sessionsMap[_id] = account_id;

    return { accounts: accountsMap, sessions: sessionsMap, transactions };
  }

  async reset() {
    await Promise.all([
      Account.deleteMany({}),
      Session.deleteMany({}),
      Transaction.deleteMany({}),
    ]);
  }
}

module.exports = { MongoWalletRepository };
