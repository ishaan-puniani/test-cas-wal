#!/bin/bash

# Signed curl helper for CloudAggregator strict-mode testing

if [ -z "$CA_SHARED_SECRET" ]; then
  echo "Error: CA_SHARED_SECRET environment variable not set"
  exit 1
fi

REQUEST_TYPE=$1
QUERY_PARAMS=$2

if [ -z "$REQUEST_TYPE" ] || [ -z "$QUERY_PARAMS" ]; then
  echo "Usage: CA_SHARED_SECRET=<secret> $0 <request_type> <query_params>"
  echo ""
  echo "Example:"
  echo "  CA_SHARED_SECRET=supersecret $0 getaccount 'session_id=CA_OP_42_demo&account_id=PLR_78345&device=desktop&api_version=2.0'"
  exit 1
fi

# For GET requests, body is empty string
BODY=""

# Generate HMAC-SHA256 signature
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$CA_SHARED_SECRET" | cut -d' ' -f2)

# Build URL
URL="http://localhost:3000/cloudagg?request=${REQUEST_TYPE}&${QUERY_PARAMS}"

# Execute curl with signature header
echo "Request: $REQUEST_TYPE"
echo "URL: $URL"
echo "Signature: $SIGNATURE"
echo ""

curl -s \
  -H "X-CA-Signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  "$URL" | jq '.'
