#!/bin/bash

# Advanced flow test: wagerAndResult, jackpot

if [ -z "$CA_SHARED_SECRET" ]; then
  echo "Error: CA_SHARED_SECRET environment variable not set"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNED_CURL="$SCRIPT_DIR/signed-curl.sh"

SESSION_ID="CA_OP_42_demo-advanced"
ACCOUNT_ID="PLR_78345"
GAME_ID="50301"
DEVICE="mobile"
API_VERSION="2.0"

echo "=== CloudAggregator Advanced Flow Test ==="
echo ""

# Step 1: GetAccount
echo "Step 1: GetAccount"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "getaccount" "$QUERY"
echo ""

# Step 2: WagerAndResult (atomic)
echo "Step 2: WagerAndResult (bet \$2.00, win \$6.00, completed)"
WR_TXN_ID="TXN_WR_001"
WR_ROUND_ID="RND_WR_001"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WR_TXN_ID&round_id=$WR_ROUND_ID&game_id=$GAME_ID&bet_amount=2.00&win_amount=6.00&game_status=completed&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "wagerAndResult" "$QUERY"
echo ""

# Step 3: Duplicate WagerAndResult (test idempotency)
echo "Step 3: Duplicate WagerAndResult (idempotency check)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WR_TXN_ID&round_id=$WR_ROUND_ID&game_id=$GAME_ID&bet_amount=2.00&win_amount=6.00&game_status=completed&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "wagerAndResult" "$QUERY"
echo ""

# Step 4: Jackpot
echo "Step 4: Jackpot (\$10000.00, completed)"
JP_TXN_ID="TXN_JACKPOT_001"
JP_ROUND_ID="RND_JACKPOT_001"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$JP_TXN_ID&round_id=$JP_ROUND_ID&game_id=$GAME_ID&jackpot_amount=10000.00&game_status=completed&api_version=$API_VERSION"
bash "$SIGNED_CURL" "jackpot" "$QUERY"
echo ""

# Step 5: Duplicate Jackpot (test idempotency)
echo "Step 5: Duplicate Jackpot (idempotency check)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$JP_TXN_ID&round_id=$JP_ROUND_ID&game_id=$GAME_ID&jackpot_amount=10000.00&game_status=completed&api_version=$API_VERSION"
bash "$SIGNED_CURL" "jackpot" "$QUERY"
echo ""

# Step 6: GetBalance (check final balance after all transactions)
echo "Step 6: GetBalance (final balance)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&device=$DEVICE&game_id=$GAME_ID&api_version=$API_VERSION"
bash "$SIGNED_CURL" "getbalance" "$QUERY"
echo ""

# Step 7: Purchase (feature buy)
echo "Step 7: Purchase (free spin buy, \$1.50)"
PURCHASE_TXN_ID="TXN_PURCHASE_001"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$PURCHASE_TXN_ID&purchase_amount=1.50&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "purchase" "$QUERY"
echo ""

# Step 8: Final GetBalance
echo "Step 8: Final GetBalance"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&device=$DEVICE&game_id=$GAME_ID&api_version=$API_VERSION"
bash "$SIGNED_CURL" "getbalance" "$QUERY"
echo ""

echo "=== Advanced Flow Test Complete ==="
