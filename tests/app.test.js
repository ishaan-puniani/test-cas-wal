'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { InMemoryWalletRepository } = require('../src/repository/InMemoryWalletRepository');
const { SimulationQueue } = require('../src/SimulationQueue');

function makeApp() {
  return createApp(new InMemoryWalletRepository(), new SimulationQueue());
}

// ── Production guard ──────────────────────────────────────────────────────────

describe('Production guard middleware', () => {
  const ADMIN_ROUTES = ['/create-data', '/add-in-simulation-queue', '/clear-simulations', '/reset-store'];

  beforeAll(() => { process.env.NODE_ENV = 'production'; });
  afterAll(()  => { delete process.env.NODE_ENV; });

  test.each(ADMIN_ROUTES)('blocks %s with 403 in production', async (route) => {
    const app = makeApp();
    const res = await request(app).get(route);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
    expect(res.body.status).toBe('Forbidden');
    expect(res.body.message).toBe('not_available_in_production');
    expect(res.body.api_version).toBe('2.0');
  });

  test('non-admin routes are not blocked in production', async () => {
    const app = makeApp();
    const res = await request(app).get('/cloudagg');
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe(403);
  });
});

describe('Admin routes are accessible outside production', () => {
  beforeAll(() => { delete process.env.NODE_ENV; });

  test('/reset-store returns 200 when NODE_ENV is not production', async () => {
    const res = await request(makeApp()).get('/reset-store');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });
});

// ── Global async error handler ────────────────────────────────────────────────
// Routes injected via the configure hook run before the error handler, so
// errors they forward with next(e) are caught by our custom handler.

describe('Global async error handler', () => {
  function makeAppWithCrashRoutes() {
    return createApp(new InMemoryWalletRepository(), new SimulationQueue(), {
      configure(app) {
        app.get('/test-crash', (req, res, next) => { next(new Error('boom')); });
        app.get('/test-async-crash', async (req, res, next) => {
          try { throw new Error('async boom'); } catch (e) { next(e); }
        });
      },
    });
  }

  test('returns code 500 JSON for synchronous route errors', async () => {
    const res = await request(makeAppWithCrashRoutes()).get('/test-crash');
    expect(res.body.code).toBe(500);
    expect(res.body.status).toBe('Internal Server Error');
    expect(res.body.message).toBe('unexpected_error');
    expect(res.body.api_version).toBe('2.0');
  });

  test('handles async route rejections forwarded via next()', async () => {
    const res = await request(makeAppWithCrashRoutes()).get('/test-async-crash');
    expect(res.body.code).toBe(500);
    expect(res.body.message).toBe('unexpected_error');
  });

  test('handleOp re-throws non-WalletErrors to global handler (e.g. DB failure)', async () => {
    // Simulate an unexpected infrastructure error (not a typed WalletError)
    const repo = new InMemoryWalletRepository();
    repo.findSession = jest.fn().mockRejectedValue(new Error('DB connection lost'));
    const app = createApp(repo, new SimulationQueue());

    const res = await request(app).get('/cloudagg?request=getbalance&session_id=S1&account_id=PLR');
    expect(res.body.code).toBe(500);
    expect(res.body.status).toBe('Internal Server Error');
    expect(res.body.message).toBe('unexpected_error');
    expect(res.body.api_version).toBe('2.0');
  });
});

// ── /reset-store ──────────────────────────────────────────────────────────────

describe('/reset-store', () => {
  test('clears accounts and returns empty data', async () => {
    const repo = new InMemoryWalletRepository();
    const queue = new SimulationQueue();
    const app = createApp(repo, queue);

    // Seed some data
    await repo.createAccount('PLR1', { real_balance: 100, bonus_balance: 0 });
    await repo.saveSession('S1', 'PLR1');
    queue.push({ account_id: 'PLR1', request: 'getbalance' });

    const res = await request(app).get('/reset-store');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('Store reset');
    expect(res.body.data.accounts).toEqual({});
    expect(res.body.data.sessions).toEqual({});
    expect(res.body.data.transactions).toEqual([]);
  });

  test('clears simulation queue', async () => {
    const repo = new InMemoryWalletRepository();
    const queue = new SimulationQueue();
    const app = createApp(repo, queue);
    queue.push({ account_id: 'PLR1', request: 'wager' });

    await request(app).get('/reset-store');
    expect(queue.all()).toHaveLength(0);
  });

  test('is idempotent — second reset still returns empty store', async () => {
    const app = makeApp();
    await request(app).get('/reset-store');
    const res = await request(app).get('/reset-store');
    expect(res.body.data.accounts).toEqual({});
  });
});
