'use strict';

const { WalletService } = require('../src/services/WalletService');
const { ValidationError, AuthError, BusinessError, DuplicateError } = require('../src/errors');

// ── Mock repo factory ─────────────────────────────────────────────────────────

function makeRepo(overrides = {}) {
  return {
    findAccount:            jest.fn().mockResolvedValue(null),
    accountExists:          jest.fn().mockResolvedValue(false),
    createAccount:          jest.fn().mockResolvedValue({}),
    updateAccount:          jest.fn(),
    findSession:            jest.fn().mockResolvedValue(undefined),
    saveSession:            jest.fn().mockResolvedValue(),
    findTransaction:        jest.fn().mockResolvedValue(null),
    findWagerTransaction:   jest.fn().mockResolvedValue(null),
    findRefundByOriginalId: jest.fn().mockResolvedValue(null),
    saveTransaction:        jest.fn().mockResolvedValue(),
    dump:                   jest.fn().mockResolvedValue({}),
    reset:                  jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function makeAcct(overrides = {}) {
  return {
    real_balance: 500, bonus_balance: 100,
    blocked: false, currency: 'EUR', language: 'en',
    country: 'DE', city: 'Berlin',
    game_mode: 1, wallet_order: 'cash_money,bonus_money',
    ...overrides,
  };
}

// ── getAccount ────────────────────────────────────────────────────────────────

describe('WalletService.getAccount', () => {
  test('throws ValidationError when session_id missing', async () => {
    const svc = new WalletService(makeRepo());
    await expect(svc.getAccount({ account_id: 'PLR' })).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws ValidationError when account_id missing', async () => {
    const svc = new WalletService(makeRepo());
    await expect(svc.getAccount({ session_id: 'S1' })).rejects.toBeInstanceOf(ValidationError);
  });

  test('registers new session and returns account payload', async () => {
    const acct = makeAcct();
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue(undefined),
      findAccount: jest.fn().mockResolvedValue(acct),
    });
    const svc = new WalletService(repo);
    const result = await svc.getAccount({ session_id: 'S1', account_id: 'PLR' });

    expect(repo.saveSession).toHaveBeenCalledWith('S1', 'PLR');
    expect(result.account_id).toBe('PLR');
    expect(result.currency).toBe('EUR');
    expect(result.real_balance).toBe(500);
  });

  test('re-uses existing session for same account', async () => {
    const acct = makeAcct();
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue('PLR'),
      findAccount: jest.fn().mockResolvedValue(acct),
    });
    const svc = new WalletService(repo);
    await expect(svc.getAccount({ session_id: 'S1', account_id: 'PLR' })).resolves.toBeDefined();
    expect(repo.saveSession).not.toHaveBeenCalled();
  });

  test('throws AuthError 1003 when session belongs to different account', async () => {
    const repo = makeRepo({ findSession: jest.fn().mockResolvedValue('OTHER') });
    const svc = new WalletService(repo);
    const err = await svc.getAccount({ session_id: 'S1', account_id: 'PLR' }).catch(e => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe(1003);
  });

  test('throws AuthError 1003 when account does not exist', async () => {
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue(undefined),
      findAccount: jest.fn().mockResolvedValue(null),
    });
    const svc = new WalletService(repo);
    const err = await svc.getAccount({ session_id: 'S1', account_id: 'GHOST' }).catch(e => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe(1003);
  });
});

// ── getBalance ────────────────────────────────────────────────────────────────

describe('WalletService.getBalance', () => {
  test('throws ValidationError when params missing', async () => {
    const svc = new WalletService(makeRepo());
    await expect(svc.getBalance({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws AuthError 1000 when session invalid', async () => {
    const repo = makeRepo({ findSession: jest.fn().mockResolvedValue('OTHER') });
    const svc = new WalletService(repo);
    const e = await svc.getBalance({ session_id: 'S1', account_id: 'PLR' }).catch(e => e);
    expect(e).toBeInstanceOf(AuthError);
    expect(e.code).toBe(1000);
  });

  test('returns balanceFields of account', async () => {
    const acct = makeAcct({ real_balance: 300, bonus_balance: 50 });
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue('PLR'),
      findAccount: jest.fn().mockResolvedValue(acct),
    });
    const result = await new WalletService(repo).getBalance({ session_id: 'S1', account_id: 'PLR' });
    expect(result.real_balance).toBe(300);
    expect(result.bonus_balance).toBe(50);
    expect(result.balance).toBe(350);
  });
});

// ── wager ─────────────────────────────────────────────────────────────────────

describe('WalletService.wager', () => {
  const base = { session_id: 'S1', account_id: 'PLR', transaction_id: 'T1', round_id: 'R1', bet_amount: '10' };

  test('throws ValidationError when params missing', async () => {
    const svc = new WalletService(makeRepo());
    await expect(svc.wager({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws AuthError when session mismatch', async () => {
    const repo = makeRepo({ findSession: jest.fn().mockResolvedValue('OTHER') });
    await expect(new WalletService(repo).wager(base)).rejects.toBeInstanceOf(AuthError);
  });

  test('throws BusinessError 1035 when account blocked', async () => {
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue('PLR'),
      findAccount: jest.fn().mockResolvedValue(makeAcct({ blocked: true })),
    });
    const e = await new WalletService(repo).wager(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(1035);
  });

  test('throws BusinessError 1006 on insufficient funds', async () => {
    const repo = makeRepo({
      findSession: jest.fn().mockResolvedValue('PLR'),
      findAccount: jest.fn().mockResolvedValue(makeAcct({ real_balance: 5, bonus_balance: 0 })),
    });
    const e = await new WalletService(repo).wager(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(1006);
  });

  test('throws DuplicateError on duplicate transaction_id', async () => {
    const existing = { transaction_id: 'T1', account_id: 'PLR', amount: 10, response: { wager_tx_id: 'W1' } };
    const repo = makeRepo({
      findSession:     jest.fn().mockResolvedValue('PLR'),
      findAccount:     jest.fn().mockResolvedValue(makeAcct()),
      findTransaction: jest.fn().mockResolvedValue(existing),
    });
    const e = await new WalletService(repo).wager(base).catch(e => e);
    expect(e).toBeInstanceOf(DuplicateError);
    expect(e.response).toEqual(existing.response);
  });

  test('throws BusinessError 400 on transaction mismatch', async () => {
    const existing = { transaction_id: 'T1', account_id: 'PLR', amount: 99, response: {} };
    const repo = makeRepo({
      findSession:     jest.fn().mockResolvedValue('PLR'),
      findAccount:     jest.fn().mockResolvedValue(makeAcct()),
      findTransaction: jest.fn().mockResolvedValue(existing),
    });
    const e = await new WalletService(repo).wager(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(400);
  });

  test('deducts bet and returns wager response', async () => {
    const acct = makeAcct({ real_balance: 500, bonus_balance: 0 });
    const repo = makeRepo({
      findSession:   jest.fn().mockResolvedValue('PLR'),
      findAccount:   jest.fn().mockResolvedValue(acct),
      updateAccount: jest.fn().mockResolvedValue({ ...acct, real_balance: 490 }),
    });
    const result = await new WalletService(repo).wager(base);
    expect(result.wager_tx_id).toBeDefined();
    expect(result.real_money_bet).toBe(10);
    expect(result.real_balance).toBe(490);
  });
});

// ── result ────────────────────────────────────────────────────────────────────

describe('WalletService.result', () => {
  const base = { account_id: 'PLR', transaction_id: 'T1', round_id: 'R1', win_amount: '20' };

  test('throws ValidationError when params missing', async () => {
    await expect(new WalletService(makeRepo()).result({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws BusinessError 1 when account not found', async () => {
    const e = await new WalletService(makeRepo()).result(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(1);
  });

  test('returns result response with updated balance', async () => {
    const acct = makeAcct({ real_balance: 100, bonus_balance: 0 });
    const repo = makeRepo({
      findAccount:   jest.fn().mockResolvedValue(acct),
      updateAccount: jest.fn().mockResolvedValue({ ...acct, real_balance: 120 }),
    });
    const result = await new WalletService(repo).result(base);
    expect(result.result_tx_id).toBeDefined();
    expect(result.real_money_win).toBe(20);
    expect(result.real_balance).toBe(120);
  });
});

// ── wagerAndResult ────────────────────────────────────────────────────────────

describe('WalletService.wagerAndResult', () => {
  const base = { session_id: 'S1', account_id: 'PLR', transaction_id: 'T1', round_id: 'R1', bet_amount: '10', win_amount: '15' };

  test('throws ValidationError when params missing', async () => {
    await expect(new WalletService(makeRepo()).wagerAndResult({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('returns combined wager/result response', async () => {
    const acct = makeAcct({ real_balance: 500, bonus_balance: 0 });
    const repo = makeRepo({
      findSession:   jest.fn().mockResolvedValue('PLR'),
      findAccount:   jest.fn().mockResolvedValue(acct),
      updateAccount: jest.fn().mockResolvedValue({ ...acct, real_balance: 505 }),
    });
    const result = await new WalletService(repo).wagerAndResult(base);
    expect(result.wager_tx_id).toBeDefined();
    expect(result.result_tx_id).toBeDefined();
    expect(result.real_money_bet).toBe(10);
    expect(result.real_money_win).toBe(15);
  });
});

// ── refund ────────────────────────────────────────────────────────────────────

describe('WalletService.refund', () => {
  const base = { account_id: 'PLR', transaction_id: 'T1' };

  test('throws ValidationError when params missing', async () => {
    await expect(new WalletService(makeRepo()).refund({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws BusinessError 102 when wager not found', async () => {
    const repo = makeRepo({ findAccount: jest.fn().mockResolvedValue(makeAcct()) });
    const e = await new WalletService(repo).refund(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(102);
  });

  test('throws DuplicateError when already refunded', async () => {
    const existingRefund = { response: { refund_tx_id: 'R1' } };
    const repo = makeRepo({
      findAccount:            jest.fn().mockResolvedValue(makeAcct()),
      findWagerTransaction:   jest.fn().mockResolvedValue({ amount: 10 }),
      findRefundByOriginalId: jest.fn().mockResolvedValue(existingRefund),
    });
    const e = await new WalletService(repo).refund(base).catch(e => e);
    expect(e).toBeInstanceOf(DuplicateError);
  });

  test('refunds original wager amount when refund_amount not given', async () => {
    const acct = makeAcct({ real_balance: 90, bonus_balance: 0 });
    const repo = makeRepo({
      findAccount:          jest.fn().mockResolvedValue(acct),
      findWagerTransaction: jest.fn().mockResolvedValue({ amount: 10 }),
      updateAccount:        jest.fn().mockResolvedValue({ ...acct, real_balance: 100 }),
    });
    const result = await new WalletService(repo).refund(base);
    expect(result.refund_tx_id).toBeDefined();
    expect(result.real_balance).toBe(100);
  });
});

// ── jackpot ───────────────────────────────────────────────────────────────────

describe('WalletService.jackpot', () => {
  const base = { account_id: 'PLR', transaction_id: 'T1', jackpot_amount: '500' };

  test('throws ValidationError when params missing', async () => {
    await expect(new WalletService(makeRepo()).jackpot({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('credits jackpot and returns wallet_tx_id', async () => {
    const acct = makeAcct({ real_balance: 100, bonus_balance: 0 });
    const repo = makeRepo({
      findAccount:   jest.fn().mockResolvedValue(acct),
      updateAccount: jest.fn().mockResolvedValue({ ...acct, real_balance: 600 }),
    });
    const result = await new WalletService(repo).jackpot(base);
    expect(result.wallet_tx_id).toBeDefined();
    expect(result.real_money_win).toBe(500);
    expect(result.real_balance).toBe(600);
  });
});

// ── purchase ──────────────────────────────────────────────────────────────────

describe('WalletService.purchase', () => {
  const base = { account_id: 'PLR', transaction_id: 'T1', purchase_amount: '25' };

  test('throws ValidationError when params missing', async () => {
    await expect(new WalletService(makeRepo()).purchase({})).rejects.toBeInstanceOf(ValidationError);
  });

  test('throws BusinessError 1035 when blocked', async () => {
    const repo = makeRepo({ findAccount: jest.fn().mockResolvedValue(makeAcct({ blocked: true })) });
    const e = await new WalletService(repo).purchase(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(1035);
  });

  test('throws BusinessError 1006 on insufficient funds', async () => {
    const repo = makeRepo({
      findAccount: jest.fn().mockResolvedValue(makeAcct({ real_balance: 10, bonus_balance: 0 })),
    });
    const e = await new WalletService(repo).purchase(base).catch(e => e);
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(1006);
  });

  test('deducts amount and returns purchase_tx_id', async () => {
    const acct = makeAcct({ real_balance: 200, bonus_balance: 0 });
    const repo = makeRepo({
      findAccount:   jest.fn().mockResolvedValue(acct),
      updateAccount: jest.fn().mockResolvedValue({ ...acct, real_balance: 175 }),
    });
    const result = await new WalletService(repo).purchase(base);
    expect(result.purchase_tx_id).toBeDefined();
    expect(result.real_money_bet).toBe(25);
    expect(result.real_balance).toBe(175);
  });
});
