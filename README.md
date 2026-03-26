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
- **Idempotency** built-in using transaction IDs
- **Round-state tracking** (open → pending → completed)
- **In-memory stores** for quick testing
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

### Testing with Signed Requests

#### Option 1: Using the signed-curl helper

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
GET http://localhost:3000/cloudagg
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
  "http://localhost:3000/cloudagg?request=getaccount&session_id=CA_OP_42_demo&account_id=PLR_78345&device=desktop&api_version=2.0"
```

#### GetBalance
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=getbalance&session_id=CA_OP_42_demo&account_id=PLR_78345&device=desktop&game_id=50301&api_version=2.0"
```

#### Wager
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=wager&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_001&round_id=RND_001&game_id=50301&bet_amount=5.00&device=desktop&api_version=2.0"
```

#### Result
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=result&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_RESULT_001&round_id=RND_001&game_id=50301&win_amount=12.50&game_status=completed&api_version=2.0"
```

#### WagerAndResult (Atomic)
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=wagerAndResult&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_WR_001&round_id=RND_WR_001&game_id=50301&bet_amount=2.00&win_amount=6.00&game_status=completed&device=desktop&api_version=2.0"
```

#### Refund
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=refund&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_001&game_id=50301&device=desktop&api_version=2.0"
```

#### Jackpot
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=jackpot&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_JP_001&round_id=RND_JP_001&game_id=50301&jackpot_amount=10000.00&game_status=completed&api_version=2.0"
```

#### Purchase
```bash
curl -H "X-CA-Signature: <sig>" \
  "http://localhost:3000/cloudagg?request=purchase&session_id=CA_OP_42_demo&account_id=PLR_78345&transaction_id=TXN_PURCHASE_001&purchase_amount=1.50&device=desktop&api_version=2.0"
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

| Code | Status | Description |
|------|--------|-------------|
| 200 | Success | Operation succeeded |
| 1 | Technical Error | Internal server error |
| 102 | Wager Not Found | Refund: no matching wager |
| 110 | Operation Not Allowed | Business rule violation |
| 400 | Transaction Parameter Mismatch | Idempotency: fields mismatch |
| 409 | Round Closed | Round already completed |
| 1000 | Not Logged On | Session invalid (only in GetBalance/GetAccount) |
| 1003 | Authentication Failed | Session/account mismatch |
| 1006 | Out of Money | Insufficient funds |
| 1008 | Parameter Required | Missing required parameter |

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