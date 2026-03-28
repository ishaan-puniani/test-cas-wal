'use strict';

const { ok, dup, err, balanceFields } = require('../helpers');
const { logCloudagg }                 = require('../logger');
const { WalletService }               = require('../services/WalletService');
const { DuplicateError, WalletError } = require('../errors');

const isSimulationMode = () => process.env.SIMULATION_MODE !== 'false';

function registerCloudaggRoutes(app, repository, simulationQueue) {
  const service = new WalletService(repository);

  function simErr(sim) {
    return err(sim.error_code, sim.error_message || 'Simulated Error', 'simulated_error');
  }

  // Converts service errors to wallet JSON responses; truly unexpected errors go to global handler
  async function handleOp(res, next, fn) {
    try {
      return res.json(ok(await fn()));
    } catch (e) {
      if (e instanceof DuplicateError) return res.json(dup(e.response));
      if (e instanceof WalletError)    return res.json(err(e.code, e.status, e.message));
      next(e);
    }
  }

  app.get('/cloudagg', async (req, res, next) => {
    const _json = res.json.bind(res);
    res.json = (body) => { logCloudagg(req, body); return _json(body); };

    const q       = req.query;
    const request = (q.request || '').toLowerCase();

    // ── Simulation layer ───────────────────────────────────────────────────────
    if (isSimulationMode()) {
      const sim = simulationQueue.findFor(q.account_id, request);
      if (sim) {
        simulationQueue.remove(sim);
        if (sim.error_code) return res.json(simErr(sim));

        if (request === 'getaccount') {
          return res.json(ok({
            account_id:    sim.account_id,
            currency:      sim.currency      || 'EUR',
            language:      sim.language      || 'en',
            real_balance:  sim.real_balance  || 0,
            bonus_balance: sim.bonus_balance || 0,
            wallet_order:  sim.wallet_order,
            game_mode:     sim.game_mode,
          }));
        }
        if (request === 'getbalance') {
          return res.json(ok(balanceFields(sim)));
        }
        if (request === 'wager') {
          return res.json(ok({
            wager_tx_id:     sim.transaction_id,
            real_money_bet:  sim.real_balance  || 0,
            bonus_money_bet: sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
        if (request === 'result') {
          return res.json(ok({
            result_tx_id:  sim.transaction_id,
            real_money_win:sim.real_balance  || 0,
            bonus_win:     sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
        if (request === 'wagerandresult') {
          return res.json(ok({
            wager_tx_id:     sim.transaction_id + '_wager',
            result_tx_id:    sim.transaction_id + '_result',
            real_money_bet:  sim.real_balance  || 0,
            bonus_money_bet: sim.bonus_balance || 0,
            real_money_win:  sim.real_balance  || 0,
            bonus_win:       sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
        if (request === 'refund') {
          return res.json(ok({
            refund_tx_id:  sim.transaction_id,
            real_money_win:sim.real_balance  || 0,
            bonus_win:     sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
        if (request === 'jackpot') {
          return res.json(ok({
            jackpot_tx_id: sim.transaction_id,
            real_money_win:sim.real_balance  || 0,
            bonus_win:     sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
        if (request === 'purchase') {
          return res.json(ok({
            purchase_tx_id:  sim.transaction_id,
            real_money_bet:  sim.real_balance  || 0,
            bonus_money_bet: sim.bonus_balance || 0,
            ...balanceFields(sim),
          }));
        }
      }
    }

    // ── Live layer — delegate to WalletService ─────────────────────────────────
    if (request === 'getaccount')     return handleOp(res, next, () => service.getAccount(q));
    if (request === 'getbalance')     return handleOp(res, next, () => service.getBalance(q));
    if (request === 'wager')          return handleOp(res, next, () => service.wager(q));
    if (request === 'result')         return handleOp(res, next, () => service.result(q));
    if (request === 'wagerandresult') return handleOp(res, next, () => service.wagerAndResult(q));
    if (request === 'refund')         return handleOp(res, next, () => service.refund(q));
    if (request === 'jackpot')        return handleOp(res, next, () => service.jackpot(q));
    if (request === 'purchase')       return handleOp(res, next, () => service.purchase(q));

    return res.json(err(1008, 'Parameter Required', 'missing_parameter'));
  });
}

module.exports = { registerCloudaggRoutes };
