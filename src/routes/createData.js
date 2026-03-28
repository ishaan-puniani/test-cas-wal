'use strict';

const { ok, err } = require('../helpers');

function registerCreateDataRoutes(app, repository) {
  app.get('/create-data', async (req, res) => {
    const {
      request, account_id, session_id, real_balance, bonus_balance,
      currency, language, country, city, game_mode, wallet_order, blocked,
    } = req.query;

    if (request === 'create_account') {
      if (!account_id)
        return res.json(err(1008, 'Parameter Required', 'account_id is required'));
      if (await repository.accountExists(account_id))
        return res.json(err(409, 'Conflict', `account '${account_id}' already exists`));
      const account = await repository.createAccount(account_id, {
        real_balance:  parseFloat(real_balance)  || 0,
        bonus_balance: parseFloat(bonus_balance) || 0,
        currency:      currency     || 'EUR',
        language:      language     || 'en',
        country:       country      || '',
        city:          city         || '',
        game_mode:     parseInt(game_mode) || 1,
        wallet_order:  wallet_order || 'cash_money,bonus_money',
        blocked:       blocked === 'true',
      });
      return res.json(ok({ message: `Account '${account_id}' created`, account }));
    }

    if (request === 'create_session') {
      if (!session_id || !account_id)
        return res.json(err(1008, 'Parameter Required', 'session_id and account_id are required'));
      if (!(await repository.accountExists(account_id)))
        return res.json(err(404, 'Not Found', `account '${account_id}' does not exist`));
      await repository.saveSession(session_id, account_id);
      return res.json(ok({ message: `Session '${session_id}' mapped to '${account_id}'` }));
    }

    if (request === 'set_bonus_balance') {
      if (!account_id || bonus_balance === undefined)
        return res.json(err(1008, 'Parameter Required', 'account_id and bonus_balance are required'));
      if (!(await repository.accountExists(account_id)))
        return res.json(err(404, 'Not Found', `account '${account_id}' does not exist`));
      const acct = await repository.updateAccount(account_id, { bonus_balance: parseFloat(bonus_balance) });
      return res.json(ok({ message: 'bonus_balance updated', account_id, bonus_balance: acct.bonus_balance }));
    }

    if (request === 'set_real_balance') {
      if (!account_id || real_balance === undefined)
        return res.json(err(1008, 'Parameter Required', 'account_id and real_balance are required'));
      if (!(await repository.accountExists(account_id)))
        return res.json(err(404, 'Not Found', `account '${account_id}' does not exist`));
      const acct = await repository.updateAccount(account_id, { real_balance: parseFloat(real_balance) });
      return res.json(ok({ message: 'real_balance updated', account_id, real_balance: acct.real_balance }));
    }

    if (request === 'block_account') {
      if (!account_id)
        return res.json(err(1008, 'Parameter Required', 'account_id is required'));
      if (!(await repository.accountExists(account_id)))
        return res.json(err(404, 'Not Found', `account '${account_id}' does not exist`));
      const acct = await repository.updateAccount(account_id, { blocked: blocked !== 'false' });
      return res.json(ok({ message: `Account '${account_id}' blocked=${acct.blocked}` }));
    }

    if (request === 'set_wallet_order') {
      if (!account_id || !wallet_order)
        return res.json(err(1008, 'Parameter Required', 'account_id and wallet_order are required'));
      if (!(await repository.accountExists(account_id)))
        return res.json(err(404, 'Not Found', `account '${account_id}' does not exist`));
      await repository.updateAccount(account_id, { wallet_order });
      return res.json(ok({ message: 'wallet_order updated', account_id, wallet_order }));
    }

    return res.json(err(1008, 'Parameter Required', `unknown request type '${request || ''}'`));
  });
}

module.exports = { registerCreateDataRoutes };
