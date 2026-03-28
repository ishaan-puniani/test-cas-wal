# CloudAggregator Mock Operator Wallet

A strict-mode Node.js mock wallet server that implements the CloudAggregator Platform Integration API for local testing and UAT.

## Features

- **Strict HMAC signature validation** on all callbacks (X-CA-Signature)
- **All transaction types** supported:
  - `getaccount`
  - `getbalance`
  - `wager`
  - `result`
  - `wagerAndResult` (atomic)
  - `refund`
  - `jackpot`
  - `purchase`
- **All error codes** (200, 1, 102, 110, 400, 409, 1000, 1003, 1006, 1007, 1008, 1019, 1035, 5002, 5007, 5011, 5012, 5013, 6001)
- **Idempotency** built-in using transaction IDs
- **Round-state tracking** (open → pending → completed)
- **Responsible gaming limits** (daily wager, loss, session time, deposit)
- **Account status checks** (active/blocked)
- **Currency validation** (EUR, USD, GBP, SEK, INR, COINS, CHIPS)
- **Swagger/OpenAPI 3.0 definition** included
- **Sample flow tests** included

## Quick Start

### Installation

```bash
npm install
```

### Running the Server

```bash
# Start with default secret
CA_SHARED_SECRET=supersecret npm start

# Server listens on http://localhost:3000/cloudagg
```

### Viewing API Documentation

Once the server is running, open your browser:

```
http://localhost:3000/api-docs
```

This opens an interactive Swagger UI with:
- All endpoint documentation
- Request/response schemas
- Error code reference
- Live "Try it out" capability (requires valid signatures)

Alternative: View raw OpenAPI spec:
```
http://localhost:3000/swagger.json
```

View raw YAML spec:
```
swagger.yaml
```

## Testing with Signed Requests

### Option 1: Using the signed-curl helper

```bash
# Terminal 1: Start server
CA_SHARED_SECRET=supersecret npm start

# Terminal 2: Run a signed request
CA_SHARED_SECRET=supersecret bash scripts/signed-curl.sh getaccount \
  "session_id=CA_OP_42_demo-session&account_id=PLR_78345&device=desktop&api_version=2.0"
```

#### Option 2: Using the flow test scripts

```bash
# Terminal 1: Start server
CA_SHARED_SECRET=supersecret npm start

# Terminal 2: Run basic flow (getaccount → getbalance → wager → result → refund)
CA_SHARED_SECRET=supersecret npm run test:flow

# Or run advanced flow (wagerAndResult, jackpot, purchase)
CA_SHARED_SECRET=supersecret npm run test:flow:advanced

# Or run all flows
CA_SHARED_SECRET=supersecret npm run test:flows
```

## API Endpoints

### Base URL
```
GET http://localhost:3000/cloudagg/{operation}
```

Each operation is available as a separate endpoint path. This provides clear separation in the Swagger UI.

### Supported Operations

| Path | Operation | Description |
|------|-----------|-------------|
| `/cloudagg/getaccount` | GetAccount | Retrieve player profile |
| `/cloudagg/getbalance` | GetBalance | Get wallet balance |
| `/cloudagg/wager` | Wager | Place bet |
| `/cloudagg/result` | Result | Process game outcome |
| `/cloudagg/wagerAndResult` | WagerAndResult | Atomic bet & result |
| `/cloudagg/refund` | Refund | Reverse wager |
| `/cloudagg/jackpot` | Jackpot | Credit progressive prize |
| `/cloudagg/purchase` | Purchase | Feature buy |

**Legacy Support:** Requests can also use query parameter:
```
GET /cloudagg?request=getaccount&...
```

### Required Headers
```
X-CA-Signature: <HMAC-SHA256(body, shared_secret)>
Content-Type: application/json
```

### Example Requests

#### GetAccount
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/getaccount?session_id=CA_OP_42_demo&account_id=PLR_78345&device=desktop&api_version=2.0"
```

#### GetBalance
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/getbalance?session_id=CA_OP_42_demo&account_id=PLR_78345&device=desktop&game_id=50301&api_version=2.0"
```

#### Wager
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/wager?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_001&round_id=RND_001&game_id=50301&bet_amount=5.00&device=desktop&api_version=2.0"
```

#### Result
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/result?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_RESULT_001&round_id=RND_001&game_id=50301&win_amount=12.50&game_status=completed&api_version=2.0"
```

#### WagerAndResult (Atomic)
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/wagerAndResult?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_WR_001&round_id=RND_WR_001&game_id=50301&bet_amount=2.00&win_amount=6.00&game_status=completed&device=desktop&api_version=2.0"
```

#### Refund
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/refund?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_001&game_id=50301&device=desktop&api_version=2.0"
```

#### Jackpot
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/jackpot?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_JP_001&round_id=RND_JP_001&game_id=50301&jackpot_amount=10000.00&game_status=completed&api_version=2.0"
```

#### Purchase
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg/purchase?session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_PURCHASE_001&purchase_amount=1.50&device=desktop&api_version=2.0"
```

## Signature Generation

For GET requests (empty body):
```bash
# Sign empty string with HMAC-SHA256
echo -n "" | openssl dgst -sha256 -hmac "supersecret"

# Result: <hex_digest>
# Include as X-CA-Signature header value
```

The `scripts/signed-curl.sh` helper automates this.

## Test Accounts

Default test account pre-loaded:
- **Account ID**: `PLR_78345`
- **Currency**: `EUR`
- **Language**: `en_GB`
- **Country**: `SE`
- **Real Balance**: `300.00`
- **Bonus Balance**: `50.00`

## Strict Mode

By default, strict mode is enabled:
- All requests **require** valid `X-CA-Signature` header
- Invalid signatures return HTTP 401
- All standard CloudAggregator error codes are enforced

To disable or modify strict mode:
```bash
STRICT_MODE=false npm start
```

## Response Status Codes

All responses return HTTP 200 with status code in JSON body:

| Code | Status | Description | Scenario |
|------|--------|-------------|----------|
| 200 | Success | Operation succeeded | Successful transaction |
| 1 | Technical Error | Internal server error | Unexpected backend issue |
| 102 | Wager Not Found | Refund: no matching wager | Refund called without prior wager |
| 110 | Operation Not Allowed | Business rule violation | Invalid amounts, account mismatch, round closed |
| 400 | Transaction Parameter Mismatch | Idempotency: fields mismatch | Same transaction_id, different fields |
| 409 | Round Closed | Round already completed | Wager/result after round completion |
| 1000 | Not Logged On | Session invalid/expired | **NEVER returned for result/refund** |
| 1003 | Authentication Failed | Session/account mismatch | Session doesn't match account |
| 1006 | Out of Money | Insufficient funds | Wager exceeds balance |
| 1007 | Unknown Currency | Currency not registered | Account currency not in: EUR, USD, GBP, SEK, INR, COINS, CHIPS |
| 1008 | Parameter Required | Missing required parameter | Missing: request, account_id, etc. |
| 1019 | Gaming Limit | Responsible gaming limit exceeded | Daily wager/loss/session limit breach |
| 1035 | Account Blocked | Account suspended/blocked | Account status = 'blocked' |
| 5002 | Transaction Amount Cannot Be Negative | Negative amount submitted | Any operation sent with a negative bet/win/refund/jackpot/purchase amount |
| 5007 | Refund Not Allowed Over Win Transactions | Refund attempted on a result transaction | `transaction_id` belongs to a result/win, not a wager |
| 5011 | Limit Error: Bet Amount Too High | Bet exceeds configured bet limit | Simulation only (wager, wagerAndResult) |
| 5012 | Limit Error: Win Amount Too High | Win exceeds configured win limit | Simulation only (result, wagerAndResult) |
| 5013 | Limit Error: Purchase Amount Too High | Purchase exceeds configured purchase limit | Simulation only (purchase) |
| 6001 | Network Error | Upstream network failure | Simulation only (all transaction types) |

### Testing Error Codes

Use environment variables to test specific error conditions:

```bash
# Test with blocked account (return 1035)
curl -s -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=wager&session_id=CA_OP_42_blocked&account_id=PLR_BLOCKED&..."
```

Create test accounts with different statuses by editing `initTestAccount()` function in `mock-operator-wallet.js`.

## Responsive Gaming & Account Validation

The mock wallet includes built-in responsible gaming and account management features:

### Supported Currencies (1007 error)
```
EUR, USD, GBP, SEK, INR, COINS, CHIPS
```

Returns `1007 (Unknown Currency)` if account currency not registered.

### Account Blocking (1035 error)
Test account can be marked as blocked with a reason:
```javascript
// In mock-operator-wallet.js
account.status = 'blocked';
account.blocked_reason = 'self-excluded';
```

Returns `1035 (Account Blocked)` when attempting wager on blocked account.

### Responsible Gaming Limits (1019 error)
Daily limits configured per account:
- **Daily Wager Limit**: $1000.00
- **Daily Loss Limit**: $500.00
- **Session Time Limit**: 120 minutes
- **Deposit Limit**: $5000.00

Returns `1019 (Gaming Limit)` when:
- Today's wagers + new bet > daily wager limit
- Session time exceeds configured maximum
- Daily losses exceed threshold

Modify limits in `initTestAccount()`:
```javascript
accountLimits.set(accountId, {
  daily_wager_limit: 1000.00,
  daily_loss_limit: 500.00,
  session_time_limit: 120,
  deposit_limit: 5000.00,
  ...
});
```

## Idempotency

The mock wallet respects idempotency rules from the CloudAggregator guide:
- **Duplicate requests** with same `transaction_id` return the cached response
- Essential fields must match (code 400 if mismatch)
- Balance fields may differ (current live balance returned)

Test with:
```bash
CA_SHARED_SECRET=supersecret npm run test:flow
# Step 5 tests duplicate result handling
```

## Round Lifecycle

Rounds follow this state machine:

1. **Open**: Wager received, result pending
2. **Pending**: Result received with `game_status=pending`
3. **Completed**: Result received with `game_status=completed`

Once completed, no further wagers or results accepted for that `round_id`.

## Development

To extend with new features:

1. Edit `mock-operator-wallet.js`
2. Add handler function: `handleNewRequest(params) { ... }`
3. Add case: `case 'new_request': response = handleNewRequest(params); break;`
4. Re-start server: `npm start`

## Integration Testing

Use this mock wallet to:
- ✅ Validate your operator's wallet callback implementation
- ✅ Test idempotency handling
- ✅ Verify HMAC signature validation
- ✅ Validate round-state management
- ✅ Test error code handling
- ✅ Debug integration issues before UAT

## License

ISC