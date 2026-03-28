/**
 * Integration tests for the CloudAggregator mock operator wallet server.
 *
 * Test Strategy
 * ─────────────
 * Each test group resets the in-memory store before running so tests are
 * fully independent. The sequence inside each group mirrors real integration
 * flows:  create-data utilities  →  add-in-simulation-queue  →  /cloudagg
 *
 * Coverage targets
 * ─────────────────
 * • /create-data  — all 6 operations, positive + validation errors
 * • /cloudagg     — all 8 operations, positive + every documented error code
 * • Simulation    — all 8 operations via queue (success + error injection)
 * • /whats-in-data, /clear-simulations
 * • Idempotency   — duplicate transaction_id handling for every txn op
 */

'use strict';

const request = require('supertest');
const { app, resetStore, IN_MEMORY_WALLET_DATA } = require('../index');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const PLR      = 'PLR_TEST_01';
const SESSION  = 'SES_TEST_01';
const SESSION2 = 'SES_TEST_02';
const BASE_URL = '';        // supertest uses the app directly

function qs(params) {
  return '?' + Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// Helpers for common sequences
async function createAccount(extra = {}) {
  return request(app).get('/create-data' + qs({
    request: 'create_account',
    account_id: PLR,
    real_balance: 500,
    bonus_balance: 100,
    currency: 'EUR',
    language: 'en_GB',
    game_mode: 1,
    wallet_order: 'cash_money,bonus_money',
    ...extra,
  }));
}

async function createSession(sid = SESSION, aid = PLR) {
  return request(app).get('/create-data' + qs({
    request: 'create_session',
    session_id: sid,
    account_id: aid,
  }));
}

function txnId(prefix = 'TXN') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. /whats-in-data
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /whats-in-data', () => {
  beforeEach(resetStore);

  test('returns 200 with data snapshot', async () => {
    const res = await request(app).get('/whats-in-data');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data).toHaveProperty('accounts');
    expect(res.body.data).toHaveProperty('sessions');
    expect(res.body.data).toHaveProperty('transactions');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /create-data — create_account
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=create_account', () => {
  beforeEach(resetStore);

  test('✓ creates account with full params', async () => {
    const res = await createAccount();
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.account.real_balance).toBe(500);
    expect(res.body.account.bonus_balance).toBe(100);
    expect(res.body.account.currency).toBe('EUR');
    expect(res.body.account.blocked).toBe(false);
  });

  test('✓ creates account with defaults (minimal params)', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'create_account', account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.account.real_balance).toBe(0);
    expect(res.body.account.currency).toBe('EUR');
  });

  test('✓ creates blocked account', async () => {
    const res = await createAccount({ blocked: 'true' });
    expect(res.body.code).toBe(200);
    expect(res.body.account.blocked).toBe(true);
  });

  test('✗ 1008 — missing account_id', async () => {
    const res = await request(app).get('/create-data?request=create_account');
    expect(res.body.code).toBe(1008);
  });

  test('✗ 409 — duplicate account', async () => {
    await createAccount();
    const res = await createAccount();
    expect(res.body.code).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /create-data — create_session
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=create_session', () => {
  beforeEach(resetStore);

  test('✓ maps session to account', async () => {
    await createAccount();
    const res = await createSession();
    expect(res.body.code).toBe(200);
    expect(res.body.message).toMatch(SESSION);
  });

  test('✗ 1008 — missing session_id', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'create_session', account_id: PLR,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1008 — missing account_id', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'create_session', session_id: SESSION,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 404 — account does not exist', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'create_session', session_id: SESSION, account_id: 'NO_SUCH',
    }));
    expect(res.body.code).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. /create-data — set_real_balance
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=set_real_balance', () => {
  beforeEach(resetStore);

  test('✓ sets real balance', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'set_real_balance', account_id: PLR, real_balance: 999,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(999);
  });

  test('✓ sets real balance to zero', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'set_real_balance', account_id: PLR, real_balance: 0,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });

  test('✗ 404 — unknown account', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'set_real_balance', account_id: 'GHOST', real_balance: 10,
    }));
    expect(res.body.code).toBe(404);
  });

  test('✗ 1008 — missing account_id', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'set_real_balance', real_balance: 100,
    }));
    expect(res.body.code).toBe(1008);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. /create-data — set_bonus_balance
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=set_bonus_balance', () => {
  beforeEach(resetStore);

  test('✓ sets bonus balance', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'set_bonus_balance', account_id: PLR, bonus_balance: 75,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.bonus_balance).toBe(75);
  });

  test('✗ 404 — unknown account', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'set_bonus_balance', account_id: 'GHOST', bonus_balance: 10,
    }));
    expect(res.body.code).toBe(404);
  });

  test('✗ 1008 — missing bonus_balance', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'set_bonus_balance', account_id: PLR,
    }));
    expect(res.body.code).toBe(1008);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. /create-data — block_account
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=block_account', () => {
  beforeEach(resetStore);

  test('✓ blocks account', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'block_account', account_id: PLR, blocked: 'true',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.message).toMatch(/blocked=true/);
  });

  test('✓ unblocks account', async () => {
    await createAccount({ blocked: 'true' });
    const res = await request(app).get('/create-data' + qs({
      request: 'block_account', account_id: PLR, blocked: 'false',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.message).toMatch(/blocked=false/);
  });

  test('✗ 404 — unknown account', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'block_account', account_id: 'GHOST', blocked: 'true',
    }));
    expect(res.body.code).toBe(404);
  });

  test('✗ 1008 — missing account_id', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'block_account', blocked: 'true',
    }));
    expect(res.body.code).toBe(1008);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. /create-data — set_wallet_order
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data?request=set_wallet_order', () => {
  beforeEach(resetStore);

  test('✓ sets wallet order to bonus_money first', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'set_wallet_order', account_id: PLR, wallet_order: 'bonus_money,cash_money',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.wallet_order).toBe('bonus_money,cash_money');
  });

  test('✗ 1008 — missing wallet_order', async () => {
    await createAccount();
    const res = await request(app).get('/create-data' + qs({
      request: 'set_wallet_order', account_id: PLR,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 404 — unknown account', async () => {
    const res = await request(app).get('/create-data' + qs({
      request: 'set_wallet_order', account_id: 'GHOST', wallet_order: 'cash_money,bonus_money',
    }));
    expect(res.body.code).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. /create-data — unknown request type
// ─────────────────────────────────────────────────────────────────────────────
describe('/create-data unknown request', () => {
  test('✗ 1008 — unknown request type', async () => {
    const res = await request(app).get('/create-data?request=do_magic');
    expect(res.body.code).toBe(1008);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. /cloudagg — getaccount (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=getaccount (live)', () => {
  beforeEach(resetStore);

  test('✓ returns account data for valid session', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.account_id).toBe(PLR);
    expect(res.body.currency).toBe('EUR');
    expect(res.body.real_balance).toBe(500);
  });

  test('✓ auto-registers session on first getaccount', async () => {
    await createAccount();
    await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    // Second call uses same session — should still succeed
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
  });

  test('✗ 1008 — missing session_id', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', account_id: PLR,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1003 — session belongs to different account (auth mismatch)', async () => {
    await createAccount();
    await createAccount({ account_id: 'PLR_OTHER' });
    // Register SESSION → PLR
    await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    // Try SESSION → PLR_OTHER
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: 'PLR_OTHER',
    }));
    expect(res.body.code).toBe(1003);
  });

  test('✗ 1003 — account does not exist', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: 'GHOST',
    }));
    expect(res.body.code).toBe(1003);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. /cloudagg — getbalance (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=getbalance (live)', () => {
  beforeEach(resetStore);

  test('✓ returns balance for valid session', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.balance).toBe(600);
    expect(res.body.real_balance).toBe(500);
    expect(res.body.bonus_balance).toBe(100);
  });

  test('✓ balance = real_balance + bonus_balance invariant', async () => {
    await createAccount({ real_balance: 123.45, bonus_balance: 67.89 });
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.balance).toBeCloseTo(123.45 + 67.89, 2);
  });

  test('✗ 1008 — missing params', async () => {
    const res = await request(app).get('/cloudagg?request=getbalance');
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1000 — session not registered', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: 'NO_SESSION', account_id: PLR,
    }));
    expect(res.body.code).toBe(1000);
  });

  test('✗ 1000 — session belongs to different account', async () => {
    await createAccount();
    await createSession(); // SESSION → PLR
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: 'WRONG_PLAYER',
    }));
    expect(res.body.code).toBe(1000);
  });

  test('✗ 1000 — session registered but account data deleted', async () => {
    await createAccount();
    await createSession();
    delete IN_MEMORY_WALLET_DATA.accounts[PLR];
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. /cloudagg — wager (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=wager (live)', () => {
  beforeEach(resetStore);

  test('✓ deducts bet from real balance', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(490);
    expect(res.body.balance).toBe(590);
    expect(res.body.wager_tx_id).toBeDefined();
  });

  test('✓ idempotent — duplicate transaction_id returns same response', async () => {
    await createAccount();
    await createSession();
    const wId = txnId('W');
    const first = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: 10,
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: 10,
    }));
    expect(dup.body.code).toBe(200);
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.wager_tx_id).toBe(first.body.wager_tx_id);
    // Balance should not be deducted twice
    const bal = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(bal.body.real_balance).toBe(490);
  });

  test('✗ 400 — duplicate transaction_id with different bet_amount', async () => {
    await createAccount();
    await createSession();
    const wId = txnId('W');
    await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: 10,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: 999,
    }));
    expect(res.body.code).toBe(400);
  });

  test('✗ 1008 — missing transaction_id', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1000 — session not registered', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: 'GHOST_SES', account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(1000);
  });

  test('✗ 1006 — insufficient funds', async () => {
    await createAccount({ real_balance: 0, bonus_balance: 0 });
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 50,
    }));
    expect(res.body.code).toBe(1006);
  });

  test('✗ 1035 — account blocked', async () => {
    await createAccount({ blocked: 'true' });
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 5,
    }));
    expect(res.body.code).toBe(1035);
  });

  test('✗ 5002 — negative bet amount', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: -10,
    }));
    expect(res.body.code).toBe(5002);
  });

  test('✗ 1000 — session registered but account data deleted', async () => {
    await createAccount();
    await createSession();
    delete IN_MEMORY_WALLET_DATA.accounts[PLR];
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. /cloudagg — result (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=result (live)', () => {
  beforeEach(resetStore);

  async function setupWager(betAmount = 10) {
    await createAccount();
    await createSession();
    const wId = txnId('W');
    await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: betAmount,
    }));
    return wId;
  }

  test('✓ credits win amount', async () => {
    await setupWager(10);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_1',
      win_amount: 20, game_status: 'completed',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(510); // 500 - 10 wager + 20 win
    expect(res.body.result_tx_id).toBeDefined();
  });

  test('✓ zero win (loss) — still success', async () => {
    await setupWager(10);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_1',
      win_amount: 0, game_status: 'completed',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(490); // 500 - 10, no win
  });

  test('✓ idempotent — duplicate result returns same response', async () => {
    await setupWager(10);
    const rId = txnId('R');
    const first = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: rId, round_id: 'RND_1',
      win_amount: 15, game_status: 'completed',
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: rId, round_id: 'RND_1',
      win_amount: 15, game_status: 'completed',
    }));
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.result_tx_id).toBe(first.body.result_tx_id);
  });

  test('✗ 400 — duplicate txn_id with different win_amount', async () => {
    await setupWager(10);
    const rId = txnId('R');
    await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: rId, round_id: 'RND_1', win_amount: 15, game_status: 'completed',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: rId, round_id: 'RND_1', win_amount: 999, game_status: 'completed',
    }));
    expect(res.body.code).toBe(400);
  });

  test('✗ 1008 — missing win_amount', async () => {
    await setupWager(10);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_1', game_status: 'completed',
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✓ result accepted even with expired session (critical rule)', async () => {
    await createAccount();
    // No session created — result must still work
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_X',
      win_amount: 5, game_status: 'completed',
    }));
    // Should not return 1000 – result is always accepted
    expect(res.body.code).not.toBe(1000);
  });

  test('✗ 1 — account does not exist', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: 'GHOST',
      transaction_id: txnId('R'), win_amount: 10, game_status: 'completed',
    }));
    expect(res.body.code).toBe(1);
  });

  test('✗ 5002 — negative win amount', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), win_amount: -5, game_status: 'completed',
    }));
    expect(res.body.code).toBe(5002);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. /cloudagg — wagerAndResult (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=wagerAndResult (live)', () => {
  beforeEach(resetStore);

  test('✓ win — balance increases by (win - bet)', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1',
      bet_amount: 10, win_amount: 25,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(515); // 500 - 10 + 25
    expect(res.body.wager_tx_id).toBeDefined();
    expect(res.body.result_tx_id).toBeDefined();
  });

  test('✓ loss — balance decreases by bet', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1',
      bet_amount: 10, win_amount: 0,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(490);
  });

  test('✓ push — win == bet, balance unchanged', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1',
      bet_amount: 10, win_amount: 10,
    }));
    expect(res.body.real_balance).toBe(500);
  });

  test('✓ idempotent — duplicate wagerAndResult', async () => {
    await createAccount();
    await createSession();
    const warId = txnId('WAR');
    const first = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: warId, round_id: 'RND_1',
      bet_amount: 10, win_amount: 5,
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: warId, round_id: 'RND_1',
      bet_amount: 10, win_amount: 5,
    }));
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.wager_tx_id).toBe(first.body.wager_tx_id);
  });

  test('✗ 1008 — missing win_amount', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1006 — insufficient funds', async () => {
    await createAccount({ real_balance: 5, bonus_balance: 0 });
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 50, win_amount: 0,
    }));
    expect(res.body.code).toBe(1006);
  });

  test('✗ 1000 — invalid session', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: 'BAD', account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 5, win_amount: 0,
    }));
    expect(res.body.code).toBe(1000);
  });

  test('✗ 1035 — account blocked', async () => {
    await createAccount({ blocked: 'true' });
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 5, win_amount: 0,
    }));
    expect(res.body.code).toBe(1035);
  });

  test('✗ 5002 — negative bet or win amount', async () => {
    await createAccount();
    await createSession();
    const rNeg = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: -5, win_amount: 0,
    }));
    expect(rNeg.body.code).toBe(5002);
    const rNegWin = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 5, win_amount: -1,
    }));
    expect(rNegWin.body.code).toBe(5002);
  });

  test('✗ 1000 — session registered but account data deleted', async () => {
    await createAccount();
    await createSession();
    delete IN_MEMORY_WALLET_DATA.accounts[PLR];
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId(), round_id: 'RND_1', bet_amount: 5, win_amount: 0,
    }));
    expect(res.body.code).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. /cloudagg — refund (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=refund (live)', () => {
  beforeEach(resetStore);

  async function wager(betAmount = 10) {
    await createAccount();
    await createSession();
    const wId = txnId('W');
    await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: betAmount,
    }));
    return wId;
  }

  test('✓ refund restores wager amount', async () => {
    const wId = await wager(10);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(500); // restored
    expect(res.body.refund_tx_id).toBeDefined();
  });

  test('✓ refund accepted even with expired session (critical rule)', async () => {
    // Create account + wager
    await createAccount();
    await createSession();
    const wId = txnId('W');
    await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_1', bet_amount: 5,
    }));
    // Reset session (simulate expiry by wiping sessions from store)
    const { IN_MEMORY_WALLET_DATA } = require('../index');
    IN_MEMORY_WALLET_DATA.sessions = {};
    // Refund should still work
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId,
    }));
    expect(res.body.code).not.toBe(1000);
  });

  test('✓ idempotent — duplicate refund returns same response', async () => {
    const wId = await wager(10);
    const first = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId,
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId,
    }));
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.refund_tx_id).toBe(first.body.refund_tx_id);
  });

  test('✗ 102 — wager not found', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: 'NO_SUCH_TXN',
    }));
    expect(res.body.code).toBe(102);
  });

  test('✗ 1008 — missing transaction_id', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR,
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1 — account does not exist', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: 'GHOST', transaction_id: txnId(),
    }));
    expect(res.body.code).toBe(1);
  });

  test('✗ 5002 — negative refund amount', async () => {
    const wId = await wager(10);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId, refund_amount: -5,
    }));
    expect(res.body.code).toBe(5002);
  });

  test('✗ 5007 — refund over win (result) transaction', async () => {
    await createAccount();
    // Record a result transaction (not a wager)
    const rId = txnId('R');
    await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: rId, win_amount: 20, game_status: 'completed',
    }));
    // Attempt to refund the result transaction_id — should be 5007
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: rId,
    }));
    expect(res.body.code).toBe(5007);
  });

  test('✓ refund with explicit refund_amount overrides original wager amount', async () => {
    const wId = await wager(50);
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId, refund_amount: 50,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.refund_tx_id).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. /cloudagg — jackpot (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=jackpot (live)', () => {
  beforeEach(resetStore);

  test('✓ credits jackpot amount', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR, session_id: SESSION,
      transaction_id: txnId('JP'), jackpot_amount: 10000,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(10500);
    expect(res.body.wallet_tx_id).toBeDefined();
  });

  test('✓ idempotent — duplicate jackpot', async () => {
    await createAccount();
    await createSession();
    const jpId = txnId('JP');
    const first = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR, session_id: SESSION,
      transaction_id: jpId, jackpot_amount: 1000,
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR, session_id: SESSION,
      transaction_id: jpId, jackpot_amount: 1000,
    }));
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.wallet_tx_id).toBe(first.body.wallet_tx_id);
  });

  test('✗ 1008 — missing jackpot_amount', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR, transaction_id: txnId('JP'),
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1 — account does not exist', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: 'GHOST', transaction_id: txnId(), jackpot_amount: 100,
    }));
    expect(res.body.code).toBe(1);
  });

  test('✗ 5002 — negative jackpot amount', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR, transaction_id: txnId('JP'), jackpot_amount: -100,
    }));
    expect(res.body.code).toBe(5002);
  });

  test('✗ 400 — same txn_id different account', async () => {
    await createAccount();
    await createAccount({ account_id: 'PLR_B' });
    const jpId = txnId('JP');
    await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR,
      transaction_id: jpId, jackpot_amount: 100,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: 'PLR_B',
      transaction_id: jpId, jackpot_amount: 100,
    }));
    expect(res.body.code).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. /cloudagg — purchase (live mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg?request=purchase (live)', () => {
  beforeEach(resetStore);

  test('✓ deducts purchase amount', async () => {
    await createAccount();
    await createSession();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR, session_id: SESSION,
      transaction_id: txnId('PUR'), purchase_amount: 25,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(475);
    expect(res.body.purchase_tx_id).toBeDefined();
  });

  test('✓ idempotent — duplicate purchase', async () => {
    await createAccount();
    await createSession();
    const purId = txnId('PUR');
    const first = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR, session_id: SESSION,
      transaction_id: purId, purchase_amount: 10,
    }));
    const dup = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR, session_id: SESSION,
      transaction_id: purId, purchase_amount: 10,
    }));
    expect(dup.body.status).toBe('Success - duplicate request');
    expect(dup.body.purchase_tx_id).toBe(first.body.purchase_tx_id);
  });

  test('✗ 1006 — insufficient funds', async () => {
    await createAccount({ real_balance: 5, bonus_balance: 0 });
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId(), purchase_amount: 100,
    }));
    expect(res.body.code).toBe(1006);
  });

  test('✗ 1035 — account blocked', async () => {
    await createAccount({ blocked: 'true' });
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId(), purchase_amount: 5,
    }));
    expect(res.body.code).toBe(1035);
  });

  test('✗ 1 — account does not exist', async () => {
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: 'GHOST',
      transaction_id: txnId(), purchase_amount: 5,
    }));
    expect(res.body.code).toBe(1);
  });

  test('✗ 1008 — missing purchase_amount', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId(),
    }));
    expect(res.body.code).toBe(1008);
  });

  test('✗ 5002 — negative purchase amount', async () => {
    await createAccount();
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId(), purchase_amount: -10,
    }));
    expect(res.body.code).toBe(5002);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. /cloudagg — unknown request type
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /cloudagg — unknown request', () => {
  test('✗ 1008 — unknown operation', async () => {
    const res = await request(app).get('/cloudagg?request=unknownop');
    expect(res.body.code).toBe(1008);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. /clear-simulations
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /clear-simulations', () => {
  beforeEach(resetStore);

  test('✓ clears queue and returns empty array', async () => {
    // Add something first
    await createAccount();
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR,
      real_balance: 100, bonus_balance: 0,
    }));
    const clear = await request(app).get('/clear-simulations');
    expect(clear.body.code).toBe(200);
    expect(clear.body.SIMULATIONS_QUEUE).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. /add-in-simulation-queue validation
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /add-in-simulation-queue — validation', () => {
  beforeEach(resetStore);

  test('✗ 1008 — missing account_id', async () => {
    const res = await request(app).get('/add-in-simulation-queue?request=getaccount');
    expect(res.body.code).toBe(1008);
  });

  test('✗ 1008 — missing request', async () => {
    const res = await request(app).get('/add-in-simulation-queue?account_id=PLR_1');
    expect(res.body.code).toBe(1008);
  });

  test('✓ queues simulation entry', async () => {
    const res = await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getbalance', account_id: PLR, real_balance: 200, bonus_balance: 50,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.SIMULATIONS_QUEUE).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Simulation — getaccount (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: getaccount', () => {
  beforeEach(resetStore);

  test('✓ success — returns simulated account data', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR,
      real_balance: 777, bonus_balance: 33, currency: 'USD', game_mode: 1,
      wallet_order: 'cash_money,bonus_money',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe('777'); // sim passes as string from query
    expect(res.body.currency).toBe('USD');
  });

  test('✓ queue consumed — second call uses live logic', async () => {
    await createAccount();
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR, real_balance: 999, bonus_balance: 0,
    }));
    // First call consumes the sim
    await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    // Second call uses live store (account exists, session auto-registered)
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(500); // live value
  });

  test.each([
    [1,    'internal_error'],
    [1000, 'session_invalid'],
    [1003, 'authentication_failed'],
    [1008, 'missing_parameter'],
    [1035, 'account_blocked'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(String(code));  // query params are strings
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await createAccount();
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with zero balances when not provided in queue', async () => {
    await createAccount();
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getaccount', account_id: PLR,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getaccount', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
    expect(res.body.bonus_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Simulation — getbalance (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: getbalance', () => {
  beforeEach(resetStore);

  test('✓ success — returns simulated balances', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getbalance', account_id: PLR,
      real_balance: 300, bonus_balance: 75, game_mode: 1,
      wallet_order: 'cash_money,bonus_money',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
  });

  test.each([
    [1,    'internal_error'],
    [1000, 'session_invalid'],
    [1003, 'authentication_failed'],
    [1008, 'missing_parameter'],
    [1035, 'account_blocked'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getbalance', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getbalance', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'getbalance', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
    expect(res.body.balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. Simulation — wager (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: wager', () => {
  beforeEach(resetStore);

  test('✓ success — returns simulated balance after wager', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR,
      real_balance: 490, bonus_balance: 100,
      transaction_id: 'SIM_W_001', game_mode: 1,
      wallet_order: 'cash_money,bonus_money',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.wager_tx_id).toBeDefined();
  });

  test.each([
    [1,    'internal_error'],
    [110,  'operation_not_allowed'],
    [400,  'transaction_parameter_mismatch'],
    [409,  'round_closed'],
    [1000, 'session_invalid'],
    [1006, 'insufficient_funds'],
    [1008, 'missing_parameter'],
    [1019, 'limit_exceeded'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [5011, 'bet_amount_too_high'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'RND_1', bet_amount: 10,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. Simulation — result (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: result', () => {
  beforeEach(resetStore);

  test('✓ success — returns simulated win', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'result', account_id: PLR,
      real_balance: 510, bonus_balance: 100, transaction_id: 'SIM_R_001',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_1',
      win_amount: 10, game_status: 'completed',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.result_tx_id).toBeDefined();
  });

  test.each([
    [1,    'internal_error'],
    [102,  'wager_not_found'],
    [110,  'operation_not_allowed'],
    [400,  'transaction_parameter_mismatch'],
    [409,  'round_closed'],
    [1000, 'session_invalid'],
    [1008, 'missing_parameter'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [5012, 'win_amount_too_high'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'result', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_1',
      win_amount: 10, game_status: 'completed',
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'result', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), win_amount: 10, game_status: 'completed',
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'result', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), win_amount: 10, game_status: 'completed',
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. Simulation — wagerAndResult (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: wagerAndResult', () => {
  beforeEach(resetStore);

  test('✓ success', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wagerAndResult', account_id: PLR,
      real_balance: 515, bonus_balance: 100, transaction_id: 'SIM_WAR_001',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1',
      bet_amount: 10, win_amount: 25,
    }));
    expect(res.body.code).toBe(200);
  });

  test.each([
    [1,    'internal_error'],
    [110,  'operation_not_allowed'],
    [400,  'transaction_parameter_mismatch'],
    [409,  'round_closed'],
    [1000, 'session_invalid'],
    [1006, 'insufficient_funds'],
    [1008, 'missing_parameter'],
    [1019, 'limit_exceeded'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [5011, 'bet_amount_too_high'],
    [5012, 'win_amount_too_high'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wagerAndResult', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1',
      bet_amount: 10, win_amount: 5,
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wagerAndResult', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1', bet_amount: 5, win_amount: 0,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wagerAndResult', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'wagerAndResult', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('WAR'), round_id: 'RND_1', bet_amount: 5, win_amount: 0,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 25. Simulation — refund (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: refund', () => {
  beforeEach(resetStore);

  test('✓ success', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'refund', account_id: PLR,
      real_balance: 500, bonus_balance: 100, transaction_id: 'SIM_REF_001',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: txnId('WR'),
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.refund_tx_id).toBeDefined();
  });

  test.each([
    [1,    'internal_error'],
    [102,  'wager_not_found'],
    [110,  'result_already_exists'],
    [400,  'transaction_parameter_mismatch'],
    [409,  'already_refunded'],
    [1000, 'session_invalid'],
    [1008, 'missing_parameter'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [5007, 'refund_not_allowed_over_win'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'refund', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: txnId('WR'),
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'refund', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: txnId('WR'),
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'refund', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: txnId('WR'),
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 26. Simulation — jackpot (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: jackpot', () => {
  beforeEach(resetStore);

  test('✓ success', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'jackpot', account_id: PLR,
      real_balance: 10500, bonus_balance: 100, transaction_id: 'SIM_JP_001',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR,
      transaction_id: txnId('JP'), jackpot_amount: 10000,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.jackpot_tx_id || res.body.wallet_tx_id).toBeDefined();
  });

  test.each([
    [1,    'internal_error'],
    [110,  'operation_not_allowed'],
    [400,  'transaction_parameter_mismatch'],
    [409,  'transaction_id_in_use'],
    [1000, 'session_invalid'],
    [1008, 'missing_parameter'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'jackpot', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR,
      transaction_id: txnId('JP'), jackpot_amount: 100,
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'jackpot', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR,
      transaction_id: txnId('JP'), jackpot_amount: 100,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'jackpot', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'jackpot', account_id: PLR,
      transaction_id: txnId('JP'), jackpot_amount: 100,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 27. Simulation — purchase (success + each error code)
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulation: purchase', () => {
  beforeEach(resetStore);

  test('✓ success', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'purchase', account_id: PLR,
      real_balance: 475, bonus_balance: 100, transaction_id: 'SIM_PUR_001',
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId('PUR'), purchase_amount: 25,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.purchase_tx_id).toBeDefined();
  });

  test.each([
    [1,    'internal_error'],
    [110,  'operation_not_allowed'],
    [400,  'transaction_parameter_mismatch'],
    [1000, 'session_invalid'],
    [1003, 'authentication_failed'],
    [1006, 'insufficient_funds'],
    [1008, 'missing_parameter'],
    [1019, 'limit_exceeded'],
    [1035, 'account_blocked'],
    [5002, 'amount_invalid'],
    [5013, 'purchase_amount_too_high'],
    [6001, 'network_error'],
  ])('✗ error_code=%i — %s', async (code, msg) => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'purchase', account_id: PLR, error_code: code, error_message: msg,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId('PUR'), purchase_amount: 5,
    }));
    expect(res.body.code).toBe(String(code));
  });

  test('✗ default error_message used when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'purchase', account_id: PLR, error_code: 999,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId('PUR'), purchase_amount: 5,
    }));
    expect(res.body.status).toBe('Simulated Error');
  });

  test('✓ success with default zero balances when not provided in queue', async () => {
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'purchase', account_id: PLR, real_balance: 0, bonus_balance: 0,
    }));
    const res = await request(app).get('/cloudagg' + qs({
      request: 'purchase', account_id: PLR,
      transaction_id: txnId('PUR'), purchase_amount: 5,
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.real_balance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 28. End-to-end flow: create → session → wager → result → refund
// ─────────────────────────────────────────────────────────────────────────────
describe('E2E flow: full wager/result/refund cycle', () => {
  beforeEach(resetStore);

  test('complete wager → result sequence leaves correct balance', async () => {
    await createAccount({ real_balance: 1000, bonus_balance: 0 });
    await createSession();

    const wId = txnId('W');
    const wager = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_E2E', bet_amount: 50,
    }));
    expect(wager.body.real_balance).toBe(950);

    const result = await request(app).get('/cloudagg' + qs({
      request: 'result', account_id: PLR,
      transaction_id: txnId('R'), round_id: 'RND_E2E',
      win_amount: 125, game_status: 'completed',
    }));
    expect(result.body.real_balance).toBe(1075);

    const balance = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(balance.body.real_balance).toBe(1075);
    expect(balance.body.balance).toBe(1075);
  });

  test('wager → refund restores balance (no result delivered)', async () => {
    await createAccount({ real_balance: 1000, bonus_balance: 0 });
    await createSession();

    const wId = txnId('W');
    await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: wId, round_id: 'RND_E2E', bet_amount: 50,
    }));

    const refund = await request(app).get('/cloudagg' + qs({
      request: 'refund', account_id: PLR, transaction_id: wId,
    }));
    expect(refund.body.code).toBe(200);
    expect(refund.body.real_balance).toBe(1000);
  });

  test('E2E simulation flow: queue success → consume → queue error → consume', async () => {
    await createAccount({ real_balance: 500, bonus_balance: 0 });
    await createSession();

    // Queue a success for wager
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR,
      real_balance: 490, bonus_balance: 0, transaction_id: 'SIM_OK',
    }));
    const ok = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'R1', bet_amount: 10,
    }));
    expect(ok.body.code).toBe(200);

    // Queue an error for wager
    await request(app).get('/add-in-simulation-queue' + qs({
      request: 'wager', account_id: PLR, error_code: 1006, error_message: 'insufficient_funds',
    }));
    const bad = await request(app).get('/cloudagg' + qs({
      request: 'wager', session_id: SESSION, account_id: PLR,
      transaction_id: txnId('W'), round_id: 'R2', bet_amount: 10,
    }));
    expect(bad.body.code).toBe('1006');

    // Queue is now empty — falls through to live logic (session IS registered)
    const live = await request(app).get('/cloudagg' + qs({
      request: 'getbalance', session_id: SESSION, account_id: PLR,
    }));
    expect(live.body.code).toBe(200);
    expect(live.body.real_balance).toBe(500); // live store, sim didn't touch it
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 29. api_version echoed in all responses
// ─────────────────────────────────────────────────────────────────────────────
describe('api_version in all responses', () => {
  beforeEach(resetStore);

  test('api_version=2.0 in success response', async () => {
    const res = await request(app).get('/whats-in-data');
    expect(res.body.api_version).toBe('2.0');
  });

  test('api_version=2.0 in error response', async () => {
    const res = await request(app).get('/cloudagg?request=getbalance');
    expect(res.body.api_version).toBe('2.0');
  });
});
