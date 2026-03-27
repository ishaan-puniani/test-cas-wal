const express = require("express");
const app = express();
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const YAML = require("yaml");

const file = fs.readFileSync("./operator_wallet_swagger.yaml", "utf8");
const swaggerDocument = YAML.parse(file);

let SIMULATIONS_QUEUE = [];

// ─── In-memory store ─────────────────────────────────────────────────────────
let IN_MEMORY_WALLET_DATA = {
  // account_id → player record
  accounts: {
  },
  // session_id → account_id  (registered on first getaccount or pre-seeded)
  sessions: {
  },
  // ordered list of all transactions { transaction_id, type, response, account_id, amount }
  transactions: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const API_VERSION = "2.0";

function ok(extra) {
  return { code: 200, status: "Success", api_version: API_VERSION, ...extra };
}
function dup(extra) {
  return {
    code: 200,
    status: "Success - duplicate request",
    api_version: API_VERSION,
    ...extra,
  };
}
function err(code, status, message) {
  return { code, status, message, api_version: API_VERSION };
}

function balanceFields(acct) {
  const balance = parseFloat(
    (acct.real_balance + acct.bonus_balance).toFixed(2),
  );
  return {
    balance,
    real_balance: acct.real_balance,
    bonus_balance: acct.bonus_balance,
    game_mode: acct.game_mode,
    wallet_order: acct.wallet_order,
  };
}

function txnId() {
  return "WALL_TXN_" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ─── Route ───────────────────────────────────────────────────────────────────
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/whats-in-data", (req, res) => {
  res.json(ok({ data: IN_MEMORY_WALLET_DATA }));
});

app.get("/create-data", (req, res) => {
  const { request, account_id, session_id, real_balance, bonus_balance, currency, language, country, city, game_mode, wallet_order, blocked } = req.query;
  const D = IN_MEMORY_WALLET_DATA;

  if (request === "create_account") {
    if (!account_id) return res.json(err(1008, "Parameter Required", "account_id is required"));
    if (D.accounts[account_id]) return res.json(err(409, "Conflict", `account '${account_id}' already exists`));
    D.accounts[account_id] = {
      real_balance: parseFloat(real_balance) || 0,
      bonus_balance: parseFloat(bonus_balance) || 0,
      currency: currency || "EUR",
      language: language || "en",
      country: country || "",
      city: city || "",
      game_mode: parseInt(game_mode) || 1,
      wallet_order: wallet_order || "cash_money,bonus_money",
      blocked: blocked === "true",
    };
    return res.json(ok({ message: `Account '${account_id}' created`, account: D.accounts[account_id] }));
  }

  if (request === "create_session") {
    if (!session_id || !account_id) return res.json(err(1008, "Parameter Required", "session_id and account_id are required"));
    if (!D.accounts[account_id]) return res.json(err(404, "Not Found", `account '${account_id}' does not exist`));
    D.sessions[session_id] = account_id;
    return res.json(ok({ message: `Session '${session_id}' mapped to '${account_id}'` }));
  }

  if (request === "set_bonus_balance") {
    if (!account_id || bonus_balance === undefined) return res.json(err(1008, "Parameter Required", "account_id and bonus_balance are required"));
    if (!D.accounts[account_id]) return res.json(err(404, "Not Found", `account '${account_id}' does not exist`));
    D.accounts[account_id].bonus_balance = parseFloat(bonus_balance);
    return res.json(ok({ message: "bonus_balance updated", account_id, bonus_balance: D.accounts[account_id].bonus_balance }));
  }

  if (request === "set_real_balance") {
    if (!account_id || real_balance === undefined) return res.json(err(1008, "Parameter Required", "account_id and real_balance are required"));
    if (!D.accounts[account_id]) return res.json(err(404, "Not Found", `account '${account_id}' does not exist`));
    D.accounts[account_id].real_balance = parseFloat(real_balance);
    return res.json(ok({ message: "real_balance updated", account_id, real_balance: D.accounts[account_id].real_balance }));
  }

  if (request === "block_account") {
    if (!account_id) return res.json(err(1008, "Parameter Required", "account_id is required"));
    if (!D.accounts[account_id]) return res.json(err(404, "Not Found", `account '${account_id}' does not exist`));
    D.accounts[account_id].blocked = blocked !== "false";
    return res.json(ok({ message: `Account '${account_id}' blocked=${D.accounts[account_id].blocked}` }));
  }

  if (request === "set_wallet_order") {
    if (!account_id || !wallet_order) return res.json(err(1008, "Parameter Required", "account_id and wallet_order are required"));
    if (!D.accounts[account_id]) return res.json(err(404, "Not Found", `account '${account_id}' does not exist`));
    D.accounts[account_id].wallet_order = wallet_order;
    return res.json(ok({ message: "wallet_order updated", account_id, wallet_order }));
  }

  return res.json(err(1008, "Parameter Required", `unknown request type '${request || ""}'`));
});

const isSimulationMode = () => true; // SIMULATION_QUEUE or LIVE
app.get("/clear-simulations", (req, res) => {
    SIMULATIONS_QUEUE = [];
    res.json(ok({ message: "Simulations queue cleared", SIMULATIONS_QUEUE }));
});

app.get("/add-in-simulation-queue", (req, res) => {
  const simulation = req.query;
  const {
    account_id,
    request,
    real_balance,
    bonus_balance,
    session_id,
    transaction_id,
    currency,
    language,
    error_code,
    error_message,
    wallet_order,
    game_mode,
  } = simulation;
    if (!account_id || !request)
        return res.json(err(1008, "Parameter Required", "missing_parameter"));


  SIMULATIONS_QUEUE.push(simulation);

  res.json(ok({ message: "Simulation added to queue", SIMULATIONS_QUEUE }));
});

function logCloudagg(req, response) {
  const q = req.query;
  const ts = new Date().toISOString();
  const isErr = response.code !== 200;
  const tag = isErr ? "✗ ERROR" : response.status === "Success - duplicate request" ? "⟳ DUPLICATE" : "✓ OK";
  console.log(
    `\n[${ts}] ${tag} | op=${q.request || "unknown"} | account=${q.account_id || "-"} | session=${q.session_id || "-"} | txn=${q.transaction_id || "-"} | round=${q.round_id || "-"}` +
    (q.bet_amount      ? ` | bet=${q.bet_amount}`          : "") +
    (q.win_amount      ? ` | win=${q.win_amount}`          : "") +
    (q.jackpot_amount  ? ` | jackpot=${q.jackpot_amount}`  : "") +
    (q.refund_amount   ? ` | refund=${q.refund_amount}`    : "") +
    (q.purchase_amount ? ` | purchase=${q.purchase_amount}`: "") +
    `\n  → code=${response.code} status="${response.status}"` +
    (response.message        ? ` message="${response.message}"`             : "") +
    (response.balance        != null ? ` balance=${response.balance}`        : "") +
    (response.real_balance   != null ? ` real=${response.real_balance}`      : "") +
    (response.bonus_balance  != null ? ` bonus=${response.bonus_balance}`    : "") +
    (response.wager_tx_id    ? ` wager_tx_id=${response.wager_tx_id}`        : "") +
    (response.result_tx_id   ? ` result_tx_id=${response.result_tx_id}`      : "") +
    (response.refund_tx_id   ? ` refund_tx_id=${response.refund_tx_id}`      : "") +
    (response.wallet_tx_id   ? ` wallet_tx_id=${response.wallet_tx_id}`      : "") +
    (response.purchase_tx_id ? ` purchase_tx_id=${response.purchase_tx_id}`  : "")
  );
}

app.get("/cloudagg", (req, res) => {
  const _json = res.json.bind(res);
  res.json = (body) => { logCloudagg(req, body); return _json(body); };

  const q = req.query;
  const request = (q.request || "").toLowerCase();
  const D = IN_MEMORY_WALLET_DATA;

  const nextSimulation = SIMULATIONS_QUEUE.find(
    (s) => s.account_id === q.account_id,
  );

  // ── getaccount ──────────────────────────────────────────────────────────────
  if (request === "getaccount") {
    if (isSimulationMode() && nextSimulation?.request === "getaccount") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);

      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        account_id: nextSimulation.account_id,
        currency: nextSimulation.currency || "EUR",
        language: nextSimulation.language || "en",
        real_balance: nextSimulation.real_balance || 0,
        bonus_balance: nextSimulation.bonus_balance || 0,
        wallet_order: nextSimulation.wallet_order,
        game_mode: nextSimulation.game_mode,
      };

      return res.json(ok(response));
    }

    const { session_id, account_id } = q;
    if (!session_id || !account_id)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));

    // Register session → account mapping on first use
    if (!D.sessions[session_id]) D.sessions[session_id] = account_id;
    else if (D.sessions[session_id] !== account_id)
      return res.json(
        err(1003, "Authentication Failed", "authentication_failed"),
      );

    const acct = D.accounts[account_id];
    if (!acct)
      return res.json(
        err(1003, "Authentication Failed", "authentication_failed"),
      );

    const payload = {
      account_id,
      currency: acct.currency,
      language: acct.language,
      country: acct.country,
      city: acct.city,
      session_id,
      real_balance: acct.real_balance,
      bonus_balance: acct.bonus_balance,
    };
    return res.json(ok(payload));
  }

  // ── getbalance ──────────────────────────────────────────────────────────────
  if (request === "getbalance") {
    const { session_id, account_id } = q;

    if (isSimulationMode() && nextSimulation?.request === "getbalance") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        account_id: nextSimulation.account_id,
        currency: nextSimulation.currency || "EUR",
        real_balance: nextSimulation.real_balance || 0,
        bonus_balance: nextSimulation.bonus_balance || 0,
        wallet_order: nextSimulation.wallet_order,
        game_mode: nextSimulation.game_mode,
      };

      return res.json(ok(balanceFields(response)));
    }

    if (!session_id || !account_id)
      return res.json(err(1008, "Parameter Required", `missing_parameter`));
    if (D.sessions[session_id] !== account_id)
      return res.json(err(1000, "Not Logged On", "session_invalid"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1000, "Not Logged On", "session_invalid"));
    return res.json(ok(balanceFields(acct)));
  }

  // ── wager ───────────────────────────────────────────────────────────────────
  if (request === "wager") {
    const { session_id, account_id, transaction_id, round_id, bet_amount } = q;

    if (isSimulationMode() && nextSimulation?.request === "wager") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        wager_tx_id: nextSimulation.transaction_id,
        real_money_bet: nextSimulation.real_balance || 0,
        bonus_money_bet: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (!session_id || !account_id || !transaction_id || !bet_amount)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    if (D.sessions[session_id] !== account_id)
      return res.json(err(1000, "Not Logged On", "session_invalid"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1000, "Not Logged On", "session_invalid"));
    if (acct.blocked)
      return res.json(err(1035, "Account Blocked", "account_blocked"));
    // Idempotency
    const existingWager = D.transactions.find(t => t.transaction_id === transaction_id);
    if (existingWager) {
      const t = existingWager;
      if (t.account_id !== account_id || t.amount !== parseFloat(bet_amount))
        return res.json(
          err(
            400,
            "Transaction Parameter Mismatch",
            "Transaction parameter mismatch",
          ),
        );
      return res.json(dup(t.response));
    }

    const bet = parseFloat(bet_amount);
    if (acct.real_balance + acct.bonus_balance < bet)
      return res.json(err(1006, "Out of Money", "insufficient_funds"));

    acct.real_balance = parseFloat((acct.real_balance - bet).toFixed(2));
    const wager_tx_id = txnId();
    const response = {
      wager_tx_id,
      real_money_bet: bet,
      bonus_money_bet: 0.0,
      ...balanceFields(acct),
    };
    D.transactions.push({
      transaction_id,
      type: "wager",
      account_id,
      round_id,
      amount: bet,
      response,
    });
    return res.json(ok(response));
  }

  // ── result ──────────────────────────────────────────────────────────────────
  if (request === "result") {
    const { account_id, transaction_id, round_id, win_amount, game_status } = q;

    if (isSimulationMode() && nextSimulation?.request === "result") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        result_tx_id: nextSimulation.transaction_id,
        real_money_win: nextSimulation.real_balance || 0,
        bonus_win: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (!account_id || !transaction_id || !win_amount)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1, "Technical Error", "internal_error"));
    // Idempotency
    const existingResult = D.transactions.find(t => t.transaction_id === transaction_id);
    if (existingResult) {
      const t = existingResult;
      if (t.account_id !== account_id || t.amount !== parseFloat(win_amount))
        return res.json(
          err(
            400,
            "Transaction Parameter Mismatch",
            "Transaction parameter mismatch",
          ),
        );
      return res.json(dup(t.response));
    }

    const win = parseFloat(win_amount);
    acct.real_balance = parseFloat((acct.real_balance + win).toFixed(2));
    const result_tx_id = txnId();
    const response = {
      result_tx_id,
      real_money_win: win,
      bonus_win: 0.0,
      ...balanceFields(acct),
    };
    D.transactions.push({
      transaction_id,
      type: "result",
      account_id,
      round_id,
      amount: win,
      response,
    });
    return res.json(ok(response));
  }

  // ── wagerAndResult ──────────────────────────────────────────────────────────
  if (request === "wagerandresult") {
    const {
      session_id,
      account_id,
      transaction_id,
      round_id,
      bet_amount,
      win_amount,
    } = q;

    if (isSimulationMode() && nextSimulation?.request === "wagerandresult") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        wager_tx_id: nextSimulation.transaction_id + "_wager",
        result_tx_id: nextSimulation.transaction_id + "_result",
        real_money_bet: nextSimulation.real_balance || 0,
        bonus_money_bet: nextSimulation.bonus_balance || 0,
        real_money_win: nextSimulation.real_balance || 0,
        bonus_win: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (
      !session_id ||
      !account_id ||
      !transaction_id ||
      !bet_amount ||
      !win_amount
    )
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    if (D.sessions[session_id] !== account_id)
      return res.json(err(1000, "Not Logged On", "session_invalid"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1000, "Not Logged On", "session_invalid"));
    if (acct.blocked)
      return res.json(err(1035, "Account Blocked", "account_blocked"));

    // Idempotency
    const existingWAR = D.transactions.find(t => t.transaction_id === transaction_id);
    if (existingWAR) {
      return res.json(dup(existingWAR.response));
    }

    const bet = parseFloat(bet_amount);
    const win = parseFloat(win_amount);
    if (acct.real_balance + acct.bonus_balance < bet)
      return res.json(err(1006, "Out of Money", "insufficient_funds"));

    acct.real_balance = parseFloat((acct.real_balance - bet + win).toFixed(2));
    const wager_tx_id = txnId();
    const result_tx_id = txnId();
    const response = {
      wager_tx_id,
      result_tx_id,
      real_money_bet: bet,
      bonus_money_bet: 0.0,
      real_money_win: win,
      bonus_win: 0.0,
      ...balanceFields(acct),
    };
    D.transactions.push({
      transaction_id,
      type: "wagerAndResult",
      account_id,
      round_id,
      amount: bet,
      response,
    });
    return res.json(ok(response));
  }

  // ── refund ──────────────────────────────────────────────────────────────────
  if (request === "refund") {
    const { account_id, transaction_id, refund_amount } = q;

    if (isSimulationMode() && nextSimulation?.request === "refund") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        refund_tx_id: nextSimulation.transaction_id,
        real_money_win: nextSimulation.real_balance || 0,
        bonus_win: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (!account_id || !transaction_id)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1, "Technical Error", "internal_error"));

    const original = D.transactions.find(t => t.transaction_id === transaction_id && t.type === "wager");
    if (!original)
      return res.json(err(102, "Wager Not Found", "wager_not_found"));

    // Idempotency: refund already processed
    const existingRefund = D.transactions.find(t => t.original_transaction_id === transaction_id && t.type === "refund");
    if (existingRefund)
      return res.json(dup(existingRefund.response));

    const amount = refund_amount ? parseFloat(refund_amount) : original.amount;
    acct.real_balance = parseFloat((acct.real_balance + amount).toFixed(2));
    const refund_tx_id = txnId();
    const response = { refund_tx_id, ...balanceFields(acct) };
    D.transactions.push({
      transaction_id: "refund_" + transaction_id,
      original_transaction_id: transaction_id,
      type: "refund",
      account_id,
      amount,
      response,
    });
    return res.json(ok(response));
  }

  // ── jackpot ─────────────────────────────────────────────────────────────────
  if (request === "jackpot") {
    const { account_id, transaction_id, jackpot_amount } = q;

    if (isSimulationMode() && nextSimulation?.request === "jackpot") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        jackpot_tx_id: nextSimulation.transaction_id,
        real_money_win: nextSimulation.real_balance || 0,
        bonus_win: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (!account_id || !transaction_id || !jackpot_amount)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1, "Technical Error", "internal_error"));

    const existingJackpot = D.transactions.find(t => t.transaction_id === transaction_id);
    if (existingJackpot) {
      const t = existingJackpot;
      if (t.account_id !== account_id)
        return res.json(
          err(
            400,
            "Transaction Parameter Mismatch",
            "Transaction parameter mismatch",
          ),
        );
      return res.json(dup(t.response));
    }

    const amount = parseFloat(jackpot_amount);
    acct.real_balance = parseFloat((acct.real_balance + amount).toFixed(2));
    const wallet_tx_id = txnId();
    const response = {
      wallet_tx_id,
      real_money_win: amount,
      bonus_win: 0.0,
      ...balanceFields(acct),
    };
    D.transactions.push({
      transaction_id,
      type: "jackpot",
      account_id,
      amount,
      response,
    });
    return res.json(ok(response));
  }

  // ── purchase ─────────────────────────────────────────────────────────────────
  if (request === "purchase") {
    const { account_id, transaction_id, purchase_amount } = q;

    if (isSimulationMode() && nextSimulation?.request === "purchase") {
      // Remove from queue
      SIMULATIONS_QUEUE.splice(SIMULATIONS_QUEUE.indexOf(nextSimulation), 1);
      // If error_code is present, return error response
      if (nextSimulation.error_code) {
        return res.json(
          err(
            nextSimulation.error_code,
            nextSimulation.error_message || "Simulated Error",
            "simulated_error",
          ),
        );
      }
      // Otherwise, return success response with provided balances
      const response = {
        purchase_tx_id: nextSimulation.transaction_id,
        real_money_bet: nextSimulation.real_balance || 0,
        bonus_money_bet: nextSimulation.bonus_balance || 0,
        ...balanceFields(nextSimulation),
      };
      return res.json(ok(response));
    }

    if (!account_id || !transaction_id || !purchase_amount)
      return res.json(err(1008, "Parameter Required", "missing_parameter"));
    const acct = D.accounts[account_id];
    if (!acct) return res.json(err(1, "Technical Error", "internal_error"));
    if (acct.blocked)
      return res.json(err(1035, "Account Blocked", "account_blocked"));

    const existingPurchase = D.transactions.find(t => t.transaction_id === transaction_id);
    if (existingPurchase) {
      return res.json(dup(existingPurchase.response));
    }

    const amount = parseFloat(purchase_amount);
    if (acct.real_balance + acct.bonus_balance < amount)
      return res.json(err(1006, "Out of Money", "insufficient_funds"));

    acct.real_balance = parseFloat((acct.real_balance - amount).toFixed(2));
    const purchase_tx_id = txnId();
    const response = {
      purchase_tx_id,
      real_money_bet: amount,
      bonus_money_bet: 0.0,
      ...balanceFields(acct),
    };
    D.transactions.push({
      transaction_id,
      type: "purchase",
      account_id,
      amount,
      response,
    });
    return res.json(ok(response));
  }

  return res.json(err(1008, "Parameter Required", "missing_parameter"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/api-docs`);
});
