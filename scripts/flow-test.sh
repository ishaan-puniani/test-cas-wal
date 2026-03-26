#!/bin/bash

# Basic flow test: getaccount -> getbalance -> wager -> result -> refund

if [ -z "$CA_SHARED_SECRET" ]; then
  echo "Error: CA_SHARED_SECRET environment variable not set"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNED_CURL="$SCRIPT_DIR/signed-curl.sh"

SESSION_ID="CA_OP_42_demo-session-001"
ACCOUNT_ID="PLR_78345"
GAME_ID="50301"
DEVICE="desktop"
API_VERSION="2.0"

WAGER_TXN_ID="TXN_WAGER_001"
WAGER_ROUND_ID="RND_001"
WAGER_AMOUNT="5.00"

RESULT_TXN_ID="TXN_RESULT_001"
RESULT_ROUND_ID="RND_001"
RESULT_WIN_AMOUNT="12.50"

echo "=== CloudAggregator Basic Flow Test ==="
echo ""

# Step 1: GetAccount
echo "Step 1: GetAccount"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "getaccount" "$QUERY"
echo ""

# Step 2: GetBalance
echo "Step 2: GetBalance"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&device=$DEVICE&game_id=$GAME_ID&api_version=$API_VERSION"
bash "$SIGNED_CURL" "getbalance" "$QUERY"
echo ""

# Step 3: Wager
echo "Step 3: Wager (bet \$$WAGER_AMOUNT)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WAGER_TXN_ID&round_id=$WAGER_ROUND_ID&game_id=$GAME_ID&bet_amount=$WAGER_AMOUNT&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "wager" "$QUERY"
echo ""

# Step 4: Result (win)
echo "Step 4: Result (win \$$RESULT_WIN_AMOUNT, completed)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$RESULT_TXN_ID&round_id=$RESULT_ROUND_ID&game_id=$GAME_ID&win_amount=$RESULT_WIN_AMOUNT&game_status=completed&api_version=$API_VERSION"
bash "$SIGNED_CURL" "result" "$QUERY"
echo ""

# Step 5: Duplicate Result (test idempotency)
echo "Step 5: Duplicate Result (idempotency check)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$RESULT_TXN_ID&round_id=$RESULT_ROUND_ID&game_id=$GAME_ID&win_amount=$RESULT_WIN_AMOUNT&game_status=completed&api_version=$API_VERSION"
bash "$SIGNED_CURL" "result" "$QUERY"
echo ""

# Step 6: Try Refund after completed result (should fail)
echo "Step 6: Attempt Refund after Result (should be rejected)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WAGER_TXN_ID&game_id=$GAME_ID&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "refund" "$QUERY"
echo ""

# Step 7: New round - Wager 2
echo "Step 7: New Wager (round 002, bet \$3.00)"
WAGER_TXN_ID_2="TXN_WAGER_002"
WAGER_ROUND_ID_2="RND_002"
WAGER_AMOUNT_2="3.00"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WAGER_TXN_ID_2&round_id=$WAGER_ROUND_ID_2&game_id=$GAME_ID&bet_amount=$WAGER_AMOUNT_2&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "wager" "$QUERY"
echo ""

# Step 8: Refund the second wager (before result)
echo "Step 8: Refund new Wager (should succeed)"
QUERY="session_id=$SESSION_ID&account_id=$ACCOUNT_ID&transaction_id=$WAGER_TXN_ID_2&game_id=$GAME_ID&device=$DEVICE&api_version=$API_VERSION"
bash "$SIGNED_CURL" "refund" "$QUERY"
echo ""

echo "=== Flow Test Complete ==="
