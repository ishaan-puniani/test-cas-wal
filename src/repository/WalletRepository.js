'use strict';

// Abstract port — implement with InMemoryWalletRepository for dev/test,
// or ExternalWalletRepository (axios) for production REST calls.
class WalletRepository {
  // Accounts
  async findAccount(accountId)          { throw new Error('not implemented'); }
  async accountExists(accountId)        { throw new Error('not implemented'); }
  async createAccount(accountId, data)  { throw new Error('not implemented'); }
  async updateAccount(accountId, patch) { throw new Error('not implemented'); } // returns updated account

  // Sessions
  async findSession(sessionId)              { throw new Error('not implemented'); } // returns accountId or undefined
  async saveSession(sessionId, accountId)   { throw new Error('not implemented'); }

  // Transactions
  async findTransaction(transactionId)                  { throw new Error('not implemented'); }
  async findWagerTransaction(transactionId)             { throw new Error('not implemented'); }
  async findRefundByOriginalId(originalTransactionId)   { throw new Error('not implemented'); }
  async saveTransaction(record)                         { throw new Error('not implemented'); }

  // Maintenance
  async dump()  { throw new Error('not implemented'); }
  async reset() { throw new Error('not implemented'); }
}

module.exports = { WalletRepository };
