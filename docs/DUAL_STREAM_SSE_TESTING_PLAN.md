# Dual-Stream SSE Architecture - Testing Plan

## Overview

This document provides a comprehensive testing plan for the dual-stream SSE architecture implementation. Follow these steps to verify that all features work correctly before deploying to production.

## Prerequisites

Before starting the tests, ensure:

1. **Demo services are running**:
   ```bash
   npm run demo:start
   ```

2. **Application is running**:
   ```bash
   npm run start:dev
   ```

3. **You have valid test credentials**:
   - Email: `tuchenhsien@gmail.com`
   - Password: `abc123`
   (Or use your own test account)

## Test Suite

### Phase 1: Authentication and Ticket Creation

#### Test 1.1: Login and Get Access Token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "tuchenhsien@gmail.com",
    "password": "abc123"
  }'
```

**Expected Result**:
- Status: `200 OK`
- Response contains `access_token`

**Save the `access_token` for subsequent tests.**

---

#### Test 1.2: Create Alerts Ticket

```bash
curl -X POST http://localhost:3000/sse/stream-ticket \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "ttlSeconds": 300,
    "purpose": "alerts"
  }'
```

**Expected Result**:
- Status: `200 OK`
- Response contains: `ticket`, `expiresInSeconds: 300`, `ticketId`

**Save the `ticket` as `ALERTS_TICKET`.**

---

#### Test 1.3: Create Data Ticket

```bash
curl -X POST http://localhost:3000/sse/stream-ticket \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "ttlSeconds": 300,
    "purpose": "data"
  }'
```

**Expected Result**:
- Status: `200 OK`
- Response contains: `ticket`, `expiresInSeconds: 300`, `ticketId`

**Save the `ticket` as `DATA_TICKET`.**

---

#### Test 1.4: Create Legacy Ticket (No Purpose)

```bash
curl -X POST http://localhost:3000/sse/stream-ticket \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "ttlSeconds": 300
  }'
```

**Expected Result**:
- Status: `200 OK`
- Response contains: `ticket`, `expiresInSeconds: 300`, `ticketId`

**Save the `ticket` as `LEGACY_TICKET`.**

---

### Phase 2: Status Endpoint Testing

#### Test 2.1: Check Status with Bearer Token

```bash
curl "http://localhost:3000/sse/status" \
  -H 'Authorization: Bearer <access_token>'
```

**Expected Result**:
```json
{
  "userId": 1,
  "ticketPurpose": "N/A",
  "connections": { "alerts": 0, "data": 0, "total": 0 },
  "limits": { "alerts": 1, "data": 1 },
  "activeConnections": []
}
```

**Note**: Status endpoint requires Bearer token authentication for security.

---

#### Test 2.2: Check Status with Ticket Validation (Optional)

```bash
curl "http://localhost:3000/sse/status?ticket=<ALERTS_TICKET>" \
  -H 'Authorization: Bearer <access_token>'
```

**Expected Result**:
```json
{
  "userId": 1,
  "ticketPurpose": "alerts",
  "connections": { "alerts": 0, "data": 0, "total": 0 },
  "limits": { "alerts": 1, "data": 1 },
  "activeConnections": []
}
```

**Note**: The `ticket` query parameter is optional. When provided, it validates the ticket and returns its purpose.

---

### Phase 3: Alerts Stream Testing

#### Test 3.1: Connect to Alerts Stream

Open a terminal and run:

```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<ALERTS_TICKET>"
```

**Expected Behavior**:
- Connection stays open
- Heartbeat events every ~25 seconds:
  ```
  event: system
  data: {"kind":"heartbeat","ts":"2026-01-28T..."}
  ```

**Keep this connection open in Terminal 1.**

---

#### Test 3.2: Verify Connection in Status

In a new terminal:

```bash
curl "http://localhost:3000/sse/status?ticket=<ALERTS_TICKET>"
```

**Expected Result**:
```json
{
  "userId": 1,
  "ticketPurpose": "alerts",
  "connections": { "alerts": 1, "data": 0, "total": 1 },
  "limits": { "alerts": 1, "data": 1 },
  "activeConnections": [
    {
      "id": "...",
      "purpose": "alerts",
      "deviceCount": 0,
      "devices": [],
      "connectedAt": "...",
      "uptime": <seconds>
    }
  ]
}
```

---

#### Test 3.3: Try Second Alerts Connection (Should Fail)

In a new terminal:

```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<ALERTS_TICKET>"
```

**Expected Result**:
- Status: `429 Too Many Requests`
- Response:
  ```json
  {
    "statusCode": 429,
    "message": "Alert stream connection limit exceeded",
    "error": "Too Many Requests",
    "currentConnections": { "alerts": 1, "data": 0, "total": 1 },
    "limits": { "alerts": 1, "data": 1 }
  }
  ```

---

### Phase 4: Data Stream Testing

#### Test 4.1: Connect to Data Stream (Single Device)

In Terminal 2:

```bash
curl -N "http://localhost:3000/sse/stream?deviceId=C02&ticket=<DATA_TICKET>"
```

**Expected Behavior**:
- Connection stays open
- Initial `machine-status` event (if device exists)
- Heartbeat events every ~25 seconds
- `realtime-update` and `spc-update` events when MQTT data arrives

**Keep this connection open in Terminal 2.**

---

#### Test 4.2: Connect to Data Stream (Multiple Devices)

In Terminal 3:

```bash
curl -N "http://localhost:3000/sse/stream?deviceIds=C02,C03,C04&ticket=<DATA_TICKET>"
```

**Expected Result**:
- Status: `429 Too Many Requests`
- Message: "Data stream connection limit exceeded"

**Reason**: User already has 1 data stream open (from Test 4.1).

Close Terminal 2 connection (Ctrl+C), then retry:

```bash
curl -N "http://localhost:3000/sse/stream?deviceIds=C02,C03,C04&ticket=<DATA_TICKET>"
```

**Expected Behavior**:
- Connection succeeds
- Multiple `machine-status` events (one per device)
- Data updates for all three devices

---

#### Test 4.3: Test 10-Device Limit

```bash
curl -N "http://localhost:3000/sse/stream?deviceIds=C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11&ticket=<DATA_TICKET>"
```

**Expected Result**:
- Status: `400 Bad Request`
- Response:
  ```json
  {
    "statusCode": 400,
    "message": "Maximum 10 devices allowed per data stream",
    "error": "Bad Request",
    "requested": 11,
    "limit": 10
  }
  ```

---

#### Test 4.4: Test Device Ownership Validation

```bash
curl -N "http://localhost:3000/sse/stream?deviceId=INVALID_DEVICE&ticket=<DATA_TICKET>"
```

**Expected Result**:
- Status: `403 Forbidden`
- Response:
  ```json
  {
    "statusCode": 403,
    "message": "Access denied to one or more devices",
    "error": "Forbidden"
  }
  ```

---

### Phase 5: Purpose Validation Testing

#### Test 5.1: Use Data Ticket on Alerts Endpoint (Should Fail)

```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<DATA_TICKET>"
```

**Expected Result**:
- Status: `401 Unauthorized`
- Message: "Ticket not valid for alerts stream (ticket purpose: data)"

---

#### Test 5.2: Use Alerts Ticket on Data Endpoint (Should Fail)

```bash
curl -N "http://localhost:3000/sse/stream?deviceId=C02&ticket=<ALERTS_TICKET>"
```

**Expected Result**:
- Status: `401 Unauthorized`
- Message: "Ticket not valid for data stream (ticket purpose: alerts)"

---

### Phase 6: Backward Compatibility Testing

#### Test 6.1: Use Legacy Ticket on Alerts Endpoint

```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<LEGACY_TICKET>"
```

**Expected Behavior**:
- Connection succeeds
- Heartbeat events received

---

#### Test 6.2: Use Legacy Ticket on Data Endpoint

Close previous connection, then:

```bash
curl -N "http://localhost:3000/sse/stream?deviceId=C02&ticket=<LEGACY_TICKET>"
```

**Expected Behavior**:
- Connection succeeds
- Data events received

**Result**: Legacy tickets work on both endpoints.

---

### Phase 7: Event Filtering Testing

For this phase, you need both alerts and data streams open simultaneously.

#### Test 7.1: Trigger Realtime Update

In Terminal 1 (alerts stream):
- Should NOT receive `realtime-update` events

In Terminal 2 (data stream for C02):
- Should receive `realtime-update` events for C02

**Verification**: Alerts stream only receives alerts, not data events.

---

#### Test 7.2: Trigger Machine Alert

Trigger an alert via MQTT or backend logic.

In Terminal 1 (alerts stream):
- Should receive `machine-alert` event

In Terminal 2 (data stream):
- Should NOT receive `machine-alert` event

**Verification**: Data stream only receives data, not alerts.

---

### Phase 8: Redis Ticket Storage Testing

#### Test 8.1: Check Redis for Stored Tickets

```bash
docker exec -it opcua-redis redis-cli
```

Inside Redis CLI:

```redis
KEYS sse:ticket:*
```

**Expected Result**: List of ticket IDs

```redis
GET sse:ticket:<ticketId>
```

**Expected Result**: JSON string with ticket data:
```json
{"userId":1,"purpose":"alerts","issuedAt":"...","expiresAt":"..."}
```

```redis
TTL sse:ticket:<ticketId>
```

**Expected Result**: Remaining TTL in seconds (e.g., 250)

---

#### Test 8.2: Wait for Ticket Expiry

Wait for ticket TTL to expire (or use a short TTL like 60 seconds for testing).

Try to connect with expired ticket:

```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<EXPIRED_TICKET>"
```

**Expected Result**:
- Status: `401 Unauthorized`
- Message: "Stream ticket expired or not found"

---

### Phase 9: Connection Cleanup Testing

#### Test 9.1: Monitor Connection Stats

Open alerts stream in Terminal 1:
```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<ALERTS_TICKET>"
```

Check status:
```bash
curl "http://localhost:3000/sse/status?ticket=<ALERTS_TICKET>"
```

**Expected**: `connections: { alerts: 1, data: 0, total: 1 }`

Close Terminal 1 (Ctrl+C).

Check status again:
```bash
curl "http://localhost:3000/sse/status?ticket=<ALERTS_TICKET>"
```

**Expected**: `connections: { alerts: 0, data: 0, total: 0 }`

**Verification**: Connection cleanup works correctly.

---

### Phase 10: IP Limit Testing (Backward Compatibility)

Open 5 connections from the same IP (mix of alerts and data):

Terminal 1:
```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<TICKET1>"
```

Terminal 2-5: Use different tickets but same IP
```bash
curl -N "http://localhost:3000/sse/stream?deviceId=C02&ticket=<TICKET2>"
```

Attempt 6th connection:
```bash
curl -N "http://localhost:3000/sse/alerts?ticket=<TICKET6>"
```

**Expected Result**:
- Status: `429 Too Many Requests`
- Message mentions IP limit exceeded

**Verification**: 5 connections per IP limit still enforced.

---

### Phase 11: Browser Testing (Optional)

If you have access to the frontend:

#### Test 11.1: Alerts Stream Integration

```javascript
// In browser console
const alertTicketRes = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'alerts', ttlSeconds: 300 }),
  credentials: 'include',
});
const { ticket: alertTicket } = await alertTicketRes.json();

const alertStream = new EventSource(
  `/sse/alerts?ticket=${encodeURIComponent(alertTicket)}`,
  { withCredentials: true }
);

alertStream.addEventListener('machine-alert', (e) => {
  console.log('Alert:', JSON.parse(e.data));
});

alertStream.addEventListener('system', (e) => {
  console.log('Heartbeat:', JSON.parse(e.data));
});

alertStream.onerror = (e) => {
  console.error('Connection error:', e);
};
```

**Expected**: Heartbeats logged every 25s, alerts when triggered.

---

#### Test 11.2: Data Stream Integration

```javascript
const dataTicketRes = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'data', ttlSeconds: 300 }),
  credentials: 'include',
});
const { ticket: dataTicket } = await dataTicketRes.json();

const dataStream = new EventSource(
  `/sse/stream?deviceIds=C02,C03&ticket=${encodeURIComponent(dataTicket)}`,
  { withCredentials: true }
);

dataStream.addEventListener('machine-status', (e) => {
  console.log('Initial status:', JSON.parse(e.data));
});

dataStream.addEventListener('realtime-update', (e) => {
  console.log('Realtime:', JSON.parse(e.data));
});

dataStream.addEventListener('spc-update', (e) => {
  console.log('SPC:', JSON.parse(e.data));
});
```

**Expected**: Initial status, then live updates.

---

## Success Criteria Checklist

Mark each item as you verify:

### Authentication & Tickets
- [ ] Login returns access token
- [ ] Alerts ticket created with `purpose: "alerts"`
- [ ] Data ticket created with `purpose: "data"`
- [ ] Legacy ticket created without purpose
- [ ] Tickets stored in Redis with correct TTL

### Status Endpoint
- [ ] Status returns correct connection counts
- [ ] Status shows active connections details
- [ ] Status returns ticket purpose correctly

### Alerts Stream
- [ ] Alerts stream connects successfully
- [ ] Heartbeat events every 25s
- [ ] Connection tracked in status endpoint
- [ ] Second alerts connection rejected (429)
- [ ] Alert events received (not data events)

### Data Stream
- [ ] Single device stream connects
- [ ] Multiple devices stream connects (up to 10)
- [ ] 11-device limit enforced (400)
- [ ] Device ownership validated (403 for invalid)
- [ ] Second data connection rejected (429)
- [ ] Data events received (not alert events)

### Purpose Validation
- [ ] Data ticket fails on alerts endpoint (401)
- [ ] Alerts ticket fails on data endpoint (401)
- [ ] Legacy ticket works on both endpoints

### Event Filtering
- [ ] Alerts stream only receives alerts
- [ ] Data stream only receives data
- [ ] Heartbeats appear on both streams

### Redis Storage
- [ ] Tickets stored in Redis
- [ ] TTL decrements correctly
- [ ] Expired tickets rejected (401)

### Connection Management
- [ ] Connections tracked per user/purpose
- [ ] Connections cleaned up on disconnect
- [ ] IP limit enforced (5 per IP)

### Browser Integration (Optional)
- [ ] EventSource works with credentials
- [ ] No CORS errors
- [ ] Events received in browser
- [ ] Error handling works

---

## Troubleshooting

### Issue: "401 Unauthorized" on ticket creation
**Solution**: Ensure access token is valid and not expired.

### Issue: "429 Too Many Requests" unexpectedly
**Solution**: Check `/sse/status` for active connections. Close unused streams.

### Issue: No heartbeat events
**Solution**: Check server logs. Verify heartbeat interval code is working.

### Issue: Ticket validation fails
**Solution**: Check Redis is running. Verify ticket TTL hasn't expired.

### Issue: Events not received
**Solution**:
1. Check MQTT processor is running
2. Verify Redis pub/sub channels
3. Check device ownership

### Issue: Connection hangs
**Solution**: Check network timeouts, proxy settings, and server logs.

---

## Next Steps After Testing

Once all tests pass:

1. **Performance Testing**: Test with multiple users and devices
2. **Load Testing**: Simulate realistic traffic patterns
3. **Monitoring**: Set up alerts for connection limits, errors
4. **Documentation**: Update deployment docs with new endpoints
5. **Frontend Integration**: Update frontend to use dual-stream architecture

---

## Notes

- Test in **development environment** first
- Keep server logs open during testing for debugging
- Save test tickets and results for documentation
- Report any issues with full context (logs, request/response)

---

**End of Testing Plan**
