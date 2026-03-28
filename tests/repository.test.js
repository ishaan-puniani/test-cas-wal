'use strict';

const { InMemoryWalletRepository } = require('../src/repository/InMemoryWalletRepository');

let repo;

beforeEach(() => { repo = new InMemoryWalletRepository(); });

// ── findAccount / createAccount ────────────────────────────────────────────────

describe('findAccount', () => {
  test('returns null for unknown account', async () => {
    expect(await repo.findAccount('GHOST')).toBeNull();
  });

  test('returns account after createAccount', async () => {
    await repo.createAccount('PLR1', { real_balance: 100, bonus_balance: 50 });
    const acct = await repo.findAccount('PLR1');
    expect(acct.real_balance).toBe(100);
    expect(acct.bonus_balance).toBe(50);
  });
});

describe('accountExists', () => {
  test('false for missing account', async () => {
    expect(await repo.accountExists('X')).toBe(false);
  });

  test('true after createAccount', async () => {
    await repo.createAccount('PLR1', { real_balance: 0 });
    expect(await repo.accountExists('PLR1')).toBe(true);
  });
});

// ── updateAccount ─────────────────────────────────────────────────────────────

describe('updateAccount', () => {
  test('merges patch into existing account', async () => {
    await repo.createAccount('PLR1', { real_balance: 200, bonus_balance: 0, blocked: false });
    const updated = await repo.updateAccount('PLR1', { real_balance: 150 });
    expect(updated.real_balance).toBe(150);
    expect(updated.bonus_balance).toBe(0);   // untouched
  });

  test('returns same object reference as findAccount', async () => {
    await repo.createAccount('PLR1', { real_balance: 100 });
    const updated = await repo.updateAccount('PLR1', { real_balance: 90 });
    const fetched = await repo.findAccount('PLR1');
    expect(updated).toBe(fetched);
  });
});

// ── sessions ──────────────────────────────────────────────────────────────────

describe('findSession / saveSession', () => {
  test('returns undefined for unknown session', async () => {
    expect(await repo.findSession('S1')).toBeUndefined();
  });

  test('returns account_id after saveSession', async () => {
    await repo.saveSession('S1', 'PLR1');
    expect(await repo.findSession('S1')).toBe('PLR1');
  });
});

// ── transactions ──────────────────────────────────────────────────────────────

describe('findTransaction', () => {
  test('returns null for unknown transaction', async () => {
    expect(await repo.findTransaction('T1')).toBeNull();
  });

  test('returns transaction after saveTransaction', async () => {
    await repo.saveTransaction({ transaction_id: 'T1', type: 'wager', account_id: 'PLR1', amount: 10, response: {} });
    const t = await repo.findTransaction('T1');
    expect(t.type).toBe('wager');
    expect(t.amount).toBe(10);
  });
});

describe('findWagerTransaction', () => {
  test('returns null for non-wager transaction', async () => {
    await repo.saveTransaction({ transaction_id: 'T1', type: 'result', account_id: 'PLR1', amount: 10, response: {} });
    expect(await repo.findWagerTransaction('T1')).toBeNull();
  });

  test('returns wager transaction by id', async () => {
    await repo.saveTransaction({ transaction_id: 'T1', type: 'wager', account_id: 'PLR1', amount: 10, response: {} });
    expect((await repo.findWagerTransaction('T1')).type).toBe('wager');
  });
});

describe('findRefundByOriginalId', () => {
  test('returns null when no refund exists', async () => {
    expect(await repo.findRefundByOriginalId('T1')).toBeNull();
  });

  test('returns refund record by original_transaction_id', async () => {
    await repo.saveTransaction({
      transaction_id: 'refund_T1', original_transaction_id: 'T1', type: 'refund', account_id: 'PLR1', amount: 10, response: {},
    });
    const r = await repo.findRefundByOriginalId('T1');
    expect(r.type).toBe('refund');
  });
});

// ── dump ──────────────────────────────────────────────────────────────────────

describe('dump', () => {
  test('returns full _data object', async () => {
    await repo.createAccount('PLR1', { real_balance: 100 });
    const data = await repo.dump();
    expect(data.accounts['PLR1'].real_balance).toBe(100);
    expect(data.sessions).toBeDefined();
    expect(data.transactions).toBeDefined();
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  test('clears all accounts, sessions, transactions', async () => {
    await repo.createAccount('PLR1', { real_balance: 100 });
    await repo.saveSession('S1', 'PLR1');
    await repo.saveTransaction({ transaction_id: 'T1', type: 'wager', account_id: 'PLR1', amount: 10, response: {} });

    await repo.reset();

    expect(await repo.findAccount('PLR1')).toBeNull();
    expect(await repo.findSession('S1')).toBeUndefined();
    expect(await repo.findTransaction('T1')).toBeNull();
  });

  test('preserves object references after reset', async () => {
    const dataBefore = repo._data;
    await repo.createAccount('PLR1', { real_balance: 100 });
    await repo.reset();
    expect(repo._data).toBe(dataBefore);                     // same top-level object
    expect(repo._data.accounts).toBe(dataBefore.accounts);  // same accounts object
  });
});
