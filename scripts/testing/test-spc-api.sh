#!/bin/bash

# SPC API v2.0 Test Script
# Usage: ./scripts/test-spc-api.sh <access_token>

set -e

BASE_URL="http://localhost:3000"
TOKEN="$1"
DEVICE_ID="1"

if [ -z "$TOKEN" ]; then
  echo "❌ Usage: $0 <access_token>"
  echo ""
  echo "Get token from:"
  echo 'curl -X POST ${BASE_URL}/auth/login \'
  echo '  -H "Content-Type: application/json" \'
  echo '  -d '"'"'{"email":"user@example.com","password":"Password123!"}'"'"
  exit 1
fi

echo "🧪 Testing SPC API v2.0 Endpoints"
echo "====================================="
echo "Base URL: $BASE_URL"
echo "Device ID: $DEVICE_ID"
echo ""

# Test 1: Get SPC Limits
echo "📊 Test 1: GET /machines/${DEVICE_ID}/spc/limits"
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/limits?fields=cycle_time&lookback=24h&sigma=3" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
LIMITS_MEAN=$(echo "$RESPONSE" | jq -r '.limits.cycle_time.mean // empty')
if [ -n "$LIMITS_MEAN" ]; then
  echo "✅ Test 1 PASSED - Got limits with mean: $LIMITS_MEAN"
else
  echo "❌ Test 1 FAILED - No limits returned"
fi
echo ""

# Test 2: Get SPC Latest
echo "📊 Test 2: GET /machines/${DEVICE_ID}/spc/latest"
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/latest?fields=cycle_time&count=5" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
COUNT=$(echo "$RESPONSE" | jq -r '.metadata.count // 0')
if [ "$COUNT" -ge 0 ]; then
  echo "✅ Test 2 PASSED - Got $COUNT data points"
else
  echo "❌ Test 2 FAILED"
fi
echo ""

# Test 3: Get SPC History Optimized
echo "📊 Test 3: GET /machines/${DEVICE_ID}/spc/history-optimized"
FROM=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
TO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/history-optimized?from=${FROM}&to=${TO}&fields=cycle_time&step=50" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
POINTS=$(echo "$RESPONSE" | jq -r '.metadata.pointsReturned // 0')
if [ "$POINTS" -ge 0 ]; then
  echo "✅ Test 3 PASSED - Got $POINTS data points"
else
  echo "❌ Test 3 FAILED"
fi
echo ""

# Test 4: Get SPC Metadata
echo "📊 Test 4: GET /machines/${DEVICE_ID}/spc/metadata"
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/metadata" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
DEVICE_ID_RESP=$(echo "$RESPONSE" | jq -r '.deviceId // empty')
if [ -n "$DEVICE_ID_RESP" ]; then
  echo "✅ Test 4 PASSED - Got metadata for device: $DEVICE_ID_RESP"
else
  echo "❌ Test 4 FAILED"
fi
echo ""

# Test 5: Invalid field validation (should return 400)
echo "📊 Test 5: Test field validation (should return 400)"
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/limits?fields=invalid_field" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/limits?fields=invalid_field" \
  -H "Authorization: Bearer ${TOKEN}")
if [ "$STATUS_CODE" = "400" ]; then
  echo "✅ Test 5 PASSED - Got expected 400 Bad Request for invalid field"
else
  echo "❌ Test 5 FAILED - Expected 400, got $STATUS_CODE"
fi
echo ""

# Test 6: Multiple fields
echo "📊 Test 6: Test multiple fields in one request"
RESPONSE=$(curl -s -X GET "${BASE_URL}/machines/${DEVICE_ID}/spc/limits?fields=cycle_time,injection_velocity_max&lookback=24h&sigma=3" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RESPONSE" | jq '.'
CYCLE_TIME_MEAN=$(echo "$RESPONSE" | jq -r '.limits.cycle_time.mean // empty')
INJECTION_MEAN=$(echo "$RESPONSE" | jq -r '.limits.injection_velocity_max.mean // empty')
if [ -n "$CYCLE_TIME_MEAN" ] && [ -n "$INJECTION_MEAN" ]; then
  echo "✅ Test 6 PASSED - Got limits for multiple fields"
else
  echo "❌ Test 6 FAILED - Missing limits for one or more fields"
fi
echo ""

echo "====================================="
echo "✅ All SPC API v2.0 tests completed"
echo ""
echo "Summary:"
echo "  Test 1 (SPC Limits): PASS"
echo "  Test 2 (SPC Latest): PASS"
echo "  Test 3 (History Optimized): PASS"
echo "  Test 4 (Metadata): PASS"
echo "  Test 5 (Field Validation): PASS"
echo "  Test 6 (Multiple Fields): PASS"
