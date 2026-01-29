# Frontend Integration Guide

This guide documents how a frontend app should integrate with the OPC UA Dashboard backend. It is written for a new frontend engineer with no prior context.

## Architecture Overview

The backend is a NestJS + TypeScript app that exposes:

- REST APIs for authentication, CRUD, billing, and historical data.
- SSE stream for live machine updates (realtime + SPC + alerts).
- MQTT ingestion -> Redis queues -> InfluxDB storage -> SSE broadcast.

High-level data flow:

1. MQTT devices publish telemetry (realtime, spc, tech).
2. Backend validates messages, queues in Redis, writes to InfluxDB, updates Redis cache.
3. Redis pub/sub notifies the SSE stream service.
4. Frontend opens an EventSource stream (by `deviceId` = machine name) and receives live updates.
5. Frontend uses REST for historical data, CRUD, and billing.

Quick sequence diagram (REST + SSE):

```
Frontend                  Backend (REST)              Backend (SSE)           Redis/Influx
   |                            |                          |                        |
   | POST /auth/login           |                          |                        |
   |--------------------------->|                          |                        |
   | 200 {access_token}         |                          |                        |
   |<---------------------------|                          |                        |
   | GET /machines/factories... |                          |                        |
   |--------------------------->|                          |                        |
   | 200 {factories, machines}  |                          |                        |
   |<---------------------------|                          |                        |
   | POST /sse/stream-ticket                               |                        |
   |--------------------------->|                          |                        |
   | 200 {ticket}               |                          |                        |
   |<---------------------------|                          |                        |
   | EventSource /sse/stream?deviceId=...&ticket=...        |                        |
   |------------------------------------------------------>|                        |
   |<------------------------- Redis pub/sub ------------->|                        |
   | 'realtime-update' (SSE)    |                          |                        |
   |<------------------------------------------------------|                        |
   | GET /machines/:id/history  |                          |                        |
   |--------------------------->|--------------------------|-------> InfluxDB       |
   | 200 {data...}              |                          |                        |
   |<---------------------------|                          |                        |
```

## Base URLs and Environment Setup

REST and SSE stream are served from the same host/port.

- REST base URL (dev): `http://localhost:3000`
- REST base URL (prod): `https://<your-domain>`
- SSE stream URL: `http://<host>:<port>/sse/stream`

Recommended frontend env vars:

```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000/sse/stream
```

CORS is configured in `src/main.ts`. Allowed origins include:

- `http://localhost:3030`
- `http://localhost:3031`
- `http://localhost:5173`
- `http://localhost:3000`
- `https://opcua-frontend.vercel.app`
- plus `FRONTEND_URL` from env
- plus additional localhost origins in development

If your frontend runs on a new domain, add it to the CORS list.

## Authentication and Authorization

- JWT-based auth.
- No refresh token flow.
- HTTP-only auth cookie is issued on login and used for protected endpoints (preferred for browsers).
- Authorization header (`Bearer <token>`) still works for non-browser clients.
- JWT payload includes `sub` (userId as string), `email`, and `role` (accessLevel).

### Password Requirements

All password fields must meet the following requirements:

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (@$!%\*?&)

### Auth Endpoints

#### POST /auth/login

Authenticate with email/password.

Request:

```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

Response (also sets HTTP-only `access_token` cookie):

```json
{
  "access_token": "<jwt>",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "admin",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-09T12:30:00.000Z"
  }
}
```

Common errors:

- `401 Unauthorized` if credentials are invalid.
- `400 Bad Request` if validation fails.

#### POST /auth/sign-up

Start signup by creating a verification token. The response includes a verification link (email sending is currently disabled).

Request:

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "username": "John Doe",
  "role": "operator"
}
```

Field validation:

- `username`: 2-50 characters, required
- `email`: Valid email format, required
- `password`: Must meet password requirements (see above), required
- `role`: Optional, defaults to "operator"

Response:

```json
{
  "status": "success",
  "message": "Please verify your email by clicking the link: <frontend-url>/signup?token=..."
}
```

Common errors:

- `409 Conflict` if username is missing or email already exists.
- `400 Bad Request` if password doesn't meet requirements.

#### GET /auth/verify-email

Complete signup and create the user.

Query params:

- `token` (string, required)

Response (success):

```json
{
  "access_token": "<jwt>",
  "user": {
    "userId": 2,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "operator",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-09T12:30:00.000Z"
  },
  "status": "success",
  "message": "Account verified successfully."
}
```

Response (failure):

```json
{
  "status": "error",
  "message": "Invalid or expired verification token."
}
```

#### GET /auth/profile

Get the current authenticated user's profile.

Response:

```json
{
  "userId": 1,
  "username": "John Doe",
  "email": "user@example.com",
  "accessLevel": "admin",
  "status": "active",
  "stripeCustomerId": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-09T12:30:00.000Z"
}
```

Common errors:

- `401 Unauthorized` if missing/invalid token.

#### PUT /auth/profile

Update the current authenticated user's profile.

Request:

```json
{
  "name": "John Smith",
  "email": "newemail@example.com"
}
```

Field validation:

- `name`: Maps to `username`, 2-50 characters, optional
- `email`: Valid email format, optional

Response:

```json
{
  "userId": 1,
  "username": "John Smith",
  "email": "newemail@example.com",
  "accessLevel": "admin",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-09T12:35:00.000Z"
}
```

Common errors:

- `401 Unauthorized` if missing/invalid token.
- `404 Not Found` if user doesn't exist.
- `409 Conflict` if email is already in use.
- `400 Bad Request` if validation fails.

#### PUT /auth/change-password

Change the current authenticated user's password.

Request:

```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

Response:

```json
{
  "message": "Password changed successfully"
}
```

Common errors:

- `401 Unauthorized` if current password is incorrect.
- `400 Bad Request` if new password doesn't meet requirements.

#### POST /auth/forgot-password

Sends a reset link by email.

Request:

```json
{
  "email": "user@example.com"
}
```

Response:

```json
{
  "status": "success",
  "message": "Password reset link sent."
}
```

Note: Always returns success response to prevent email enumeration.

#### POST /auth/reset-password

Reset password using token from email.

Request:

```json
{
  "token": "<reset_token_from_email>",
  "password": "NewPassword123!"
}
```

Response (success):

```json
{
  "access_token": "<jwt>",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "admin",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-09T12:40:00.000Z"
  },
  "status": "success",
  "message": "Password reset successfully."
}
```

Response (failure):

```json
{
  "status": "error",
  "message": "Error resetting password."
}
```

#### POST /auth/google

Authenticate user using Google OAuth 2.0.

Request:

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

Notes:

- `idToken` is the Google ID token from the OAuth flow (obtained from frontend using `@react-oauth/google` or similar)
- Backend verifies this token with Google's public keys
- If user doesn't exist, creates account automatically with `accessLevel: "operator"` and `status: "active"`
- Returns JWT and user object (same format as regular login)

Success Response (200 OK):

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@gmail.com",
    "accessLevel": "operator",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

Common errors:

- `401 Unauthorized` if token is invalid or expired.
- `401 Unauthorized` if `GOOGLE_CLIENT_ID` is not configured.

Frontend Behavior:

- Use `@react-oauth/google` library to obtain ID token
- Send ID token to backend for verification
- HTTP-only auth cookie is set on success; redirect to dashboard

## REST API Reference

All endpoints below require auth via HTTP-only cookie or Authorization header unless marked as Public.

### Factories

#### GET /factories

Returns all factories for the authenticated user, including machines.

Response (example):

```json
[
  {
    "factoryId": 1,
    "factoryName": "Line A",
    "factoryIndex": "1",
    "width": "100",
    "height": "50",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "machines": [
      {
        "machineId": 1,
        "machineName": "Machine 1",
        "machineIpAddress": "192.168.1.100",
        "machineIndex": "1",
        "status": "running",
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
]
```

Common errors:

- `401 Unauthorized` if token missing/invalid.

#### GET /factories/:id

Returns a single factory (includes `user` and `machines`).

Response (example):

```json
{
  "factoryId": 1,
  "factoryName": "Line A",
  "factoryIndex": "1",
  "width": "100",
  "height": "50",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "user": {
    "userId": 1,
    "username": "jdoe",
    "email": "user@example.com",
    "password": "<hashed>",
    "accessLevel": "",
    "stripeCustomerId": null,
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "machines": []
}
```

Common errors:

- `404 Not Found` if factory does not exist.
- `401/403` if user does not own the factory.

#### GET /factories/user/factories

Lightweight list of factories for the user.

Response (example):

```json
[
  {
    "factoryId": 1,
    "factoryName": "Line A",
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
]
```

#### POST /factories

Create a new factory.

Request:

```json
{
  "factoryName": "Line B",
  "factoryIndex": 2,
  "width": 120,
  "height": 60
}
```

Response (example):

```json
{
  "factoryId": 2,
  "factoryName": "Line B",
  "factoryIndex": "2",
  "width": "120",
  "height": "60",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

Common errors:

- `404 Not Found` if the user ID in the JWT is missing in DB.

#### PATCH /factories/:factoryId

Update a factory. Include all numeric fields to avoid backend `undefined.toString()` errors.

Request:

```json
{
  "factoryName": "Line B Updated",
  "factoryIndex": 2,
  "width": 120,
  "height": 60
}
```

Response: same shape as POST.

Common errors:

- `404 Not Found` if factory does not exist.
- `401/403` if user does not own the factory.

#### DELETE /factories/:id

Deletes a factory.

Response: empty (204/200 with no body).

Common errors:

- `404 Not Found` if factory does not exist.
- `401/403` if user does not own the factory.

### Machines

#### GET /machines/factories-machines

Returns factories and machines for layout building (note `factoryWidth/Height` names).

Response (example):

```json
[
  {
    "factoryId": 1,
    "factoryName": "Line A",
    "factoryWidth": "100",
    "factoryHeight": "50",
    "machines": [
      {
        "machineId": 1,
        "machineName": "Machine 1",
        "machineIpAddress": "192.168.1.100",
        "machineIndex": 1
      }
    ]
  }
]
```

#### POST /machines

Create a new machine.

Request (factoryIndex is required by DTO even though it is not used):

```json
{
  "machineName": "Machine 2",
  "machineIpAddress": "192.168.1.101",
  "machineIndex": "2",
  "factoryId": 1,
  "status": "offline"
}
```

Response (example):

```json
{
  "machineId": 2,
  "machineName": "Machine 2",
  "machineIpAddress": "192.168.1.101",
  "machineIndex": "2",
  "status": "offline",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

Common errors:

- `404 Not Found` if factory does not exist.
- `401/403` if user does not own the factory.
- `409 Conflict` if machine IP address conflicts (DB constraint may vary by environment).

#### GET /machines/:id

Returns a machine with `user` and `factory` relations.

Response (example):

```json
{
  "machineId": 1,
  "machineName": "Machine 1",
  "machineIpAddress": "192.168.1.100",
  "machineIndex": "1",
  "status": "running",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "factory": {
    "factoryId": 1,
    "factoryName": "Line A",
    "factoryIndex": "1",
    "width": "100",
    "height": "50",
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "user": {
    "userId": 1,
    "username": "jdoe",
    "email": "user@example.com",
    "password": "<hashed>",
    "accessLevel": ""
  }
}
```

Common errors:

- `404 Not Found` if machine does not exist.
- `401/403` if user does not own the machine.

#### PATCH /machines/:id

Update machine properties.

Request:

```json
{
  "machineName": "Machine 1A",
  "machineIpAddress": "192.168.1.110",
  "machineIndex": "1",
  "factoryId": 1,
  "factoryIndex": 1,
  "status": "maintenance"
}
```

Response: updated machine entity.

Common errors:

- `404 Not Found` if machine does not exist.
- `401/403` if user does not own the machine.

#### POST /machines/update-index

Update a machine index within a factory (used for ordering).

Request:

```json
{
  "machineId": 1,
  "machineIndex": 3,
  "factoryId": 1
}
```

Common errors:

- `404 Not Found` if machine or factory does not exist.
- `401/403` if user does not own the factory or machine.

Response:

```json
{
  "message": "Machine with ID 1 successfully updated. New machineIndex: 3",
  "status": "success",
  "machineId": 1,
  "machineIndex": 3
}
```

Common errors:

- `404 Not Found` if machine or factory does not exist.
- `401/403` if user does not own the factory or machine.

#### DELETE /machines/:id

Deletes a machine.

Response (string):

```json
"Machine with ID 1 successfully removed."
```

Common errors:

- `404 Not Found` if machine does not exist.
- `401/403` if user does not own the machine.

### Machine History and Status

All endpoints verify machine ownership via the JWT.

#### GET /machines/:id/realtime-history

Returns paginated InfluxDB realtime data for the machine.

**IMPORTANT**: Pagination is now enforced. You must implement pagination controls in your frontend.

Query params:

- `timeRange` (default `-1h`) - Time range for data retrieval
- `limit` (default `50`, max `1000`) - Number of records per page
- `offset` (default `0`) - Starting record position
- `aggregate` (optional) - Aggregation window: `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, `1d`

Response (example):

```json
{
  "data": [
    {
      "_time": "2025-01-15T10:00:00.000Z",
      "device_id": "Machine 1",
      "topic": "realtime",
      "oil_temp": 52.3,
      "auto_start": 0,
      "operate_mode": 2,
      "status": 2,
      "temp_1": 221.5,
      "temp_2": 220.8,
      "temp_3": 222.1
    }
  ],
  "pagination": {
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "metadata": {
    "deviceId": "Machine 1",
    "timeRange": "-1h",
    "aggregate": "none"
  }
}
```

**Pagination Example:**

```typescript
const loadHistory = async (page = 0) => {
  const limit = 50;
  const offset = page * limit;
  const res = await fetch(
    `/machines/${id}/realtime-history?timeRange=-1h&limit=${limit}&offset=${offset}`,
  );
  const { data, pagination } = await res.json();
  console.log(`Loaded ${data.length} of ${pagination.total} records`);
  return { data, hasMore: pagination.hasMore };
};
```

Common errors:

- `404 Not Found` if machine does not exist.
- `401/403` if user does not own the machine.
- `400 Bad Request` if limit exceeds 1000.

#### GET /machines/:id/spc-history

Returns paginated InfluxDB SPC data for the machine.

**IMPORTANT**: Pagination is now enforced. You must implement pagination controls in your frontend.

Query params:

- `timeRange` (default `-1h`) - Time range for data retrieval
- `limit` (default `50`, max `1000`) - Number of records per page
- `offset` (default `0`) - Starting record position
- `aggregate` (optional) - Aggregation window: `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, `1d`

Response (example):

```json
{
  "data": [
    {
      "_time": "2025-01-15T10:00:00.000Z",
      "device_id": "Machine 1",
      "topic": "spc",
      "cycle_number": 6026,
      "cycle_time": 45.2,
      "injection_velocity_max": 152.3,
      "injection_pressure_max": 78.5,
      "switch_pack_time": 2.5,
      "temp_1": 221.5,
      "temp_2": 220.8,
      "temp_3": 222.1
    }
  ],
  "pagination": {
    "total": 85,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "metadata": {
    "deviceId": "Machine 1",
    "timeRange": "-1h",
    "aggregate": "none"
  }
}
```

### SPC v2.0 Performance-Optimized Endpoints

**Field Validation:** All SPC endpoints validate field names against an allowed whitelist. Invalid field names will return `400 Bad Request` with a list of valid fields.

Valid SPC fields:

- `cycle_number`, `cycle_time`, `injection_velocity_max`, `injection_pressure_max`, `switch_pack_time`, `temp_1`, `temp_2`, `temp_3` (required)
- `switch_pack_pressure`, `switch_pack_position`, `injection_time`, `plasticizing_time`, `plasticizing_pressure_max`, `temp_4` through `temp_10`, `injection_pressure_set`, `fill_cooling_time`, `injection_pressure_set_min`, `oil_temperature_cycle`, `end_mold_open_speed`, `injection_start_speed` (optional)

#### GET /machines/:id/spc/limits

Get precomputed SPC control limits (UCL, LCL, Mean, Standard Deviation) with caching.

**Purpose:** Offloads CPU-intensive calculations from frontend to backend.

Query params:

- `fields` (required) - Comma-separated field names (e.g., `cycle_time,injection_velocity_max`)
- `lookback` (optional, default `24h`) - Time range: `1h`, `6h`, `24h`, `7d`
- `sigma` (optional, default `3`) - Number of standard deviations: `2`, `3`, `4`
- `forceRecalculate` (optional, default `false`) - Bypass cache

Response example:

```json
{
  "limits": {
    "cycle_time": {
      "mean": 12.34,
      "stdDev": 0.82,
      "ucl": 14.8,
      "lcl": 9.88,
      "n": 1440,
      "calculatedAt": "2026-01-18T10:00:00Z",
      "expiresAt": "2026-01-18T10:30:00Z",
      "isCached": false
    }
  },
  "metadata": {
    "deviceId": "Machine 1",
    "calculationTime": "45ms",
    "cacheKey": "spc:limits:Machine 1:cycle_time:24h:sigma3"
  }
}
```

Cache behavior:

- 30-minute TTL
- Frontend should refresh 5 minutes before `expiresAt`
- Use `forceRecalculate=true` to bypass cache

#### GET /machines/:id/spc/latest

Get the most recent N data points (cached).

Query params:

- `fields` (optional) - Comma-separated field names
- `count` (optional, default `10`) - Number of points (1-100)

Response example:

```json
{
  "deviceId": "Machine 1",
  "data": [
    { "_time": "2026-01-18T10:46:00Z", "cycle_time": 12.6 },
    { "_time": "2026-01-18T10:47:00Z", "cycle_time": 12.4 }
  ],
  "metadata": {
    "count": 2,
    "cachedAt": "2026-01-18T10:47:01Z"
  }
}
```

Cache: 10-second TTL for high-frequency polling.

#### GET /machines/:id/spc/history-optimized

Fetch historical data with intelligent downsampling (Grafana-style).

Query params:

- `from` (required) - Start timestamp (ISO 8601)
- `to` (required) - End timestamp (ISO 8601)
- `fields` (optional) - Comma-separated field names
- `step` (optional, default `50`) - Target number of data points

Response example:

```json
{
  "deviceId": "Machine 1",
  "data": [
    { "_time": "2026-01-18T09:00:00Z", "cycle_time": 12.3 },
    { "_time": "2026-01-18T09:12:00Z", "cycle_time": 12.5 }
  ],
  "metadata": {
    "timeRange": "2026-01-18T09:00:00Z/2026-01-18T10:00:00Z",
    "pointsReturned": 2,
    "requestedFields": ["cycle_time"],
    "queryTime": "15ms"
  }
}
```

Automatic downsampling:

- ≤ 1 hour: raw data
- ≤ 6 hours: 1-minute average
- ≤ 24 hours: 5-minute average
- ≤ 7 days: 15-minute average
- > 7 days: 1-hour average

#### GET /machines/:id/spc/metadata

Get field metadata for dynamic chart configuration.

Response example:

```json
{
  "deviceId": "Machine 1",
  "fields": [
    {
      "name": "cycle_time",
      "displayName": "Cycle Time",
      "unit": "seconds",
      "dataType": "float",
      "min": 10.0,
      "max": 15.0,
      "suggestedRange": [10, 15]
    },
    {
      "name": "injection_velocity_max",
      "displayName": "Injection Velocity (Max)",
      "unit": "mm/s",
      "dataType": "float",
      "min": 70.0,
      "max": 95.0,
      "suggestedRange": [70, 95]
    }
  ],
  "capabilities": {
    "supportedAggregations": [
      "mean",
      "median",
      "min",
      "max",
      "stdDev",
      "count"
    ],
    "supportedResolutions": ["auto", "1m", "5m", "15m", "1h", "6h", "1d"],
    "maxPointsPerQuery": 10000
  }
}
```

### Frontend Integration Example for SPC v2.0

```typescript
// 1. Fetch control limits (cached)
const limits = await fetch(
  `/machines/${id}/spc/limits?fields=cycle_time&lookback=24h&sigma=3`,
).then((r) => r.json());

// 2. Fetch historical data with downsampling
const history = await fetch(
  `/machines/${id}/spc/history-optimized?from=${startDate}&to=${endDate}&fields=cycle_time&step=50`,
).then((r) => r.json());

// 3. Fetch latest data for real-time updates
const latest = await fetch(`/machines/${id}/spc/latest?count=5`).then((r) =>
  r.json(),
);

// 4. Use metadata for dynamic configuration
const metadata = await fetch(`/machines/${id}/spc/metadata`).then((r) =>
  r.json(),
);
```

#### GET /machines/:id/status

Returns the latest cached status from Redis (or a "No status" message).

Response (example):

```json
{
  "deviceId": "Machine 1",
  "status": {
    "devId": "Machine 1",
    "topic": "realtime",
    "timestamp": 1726238466000,
    "Data": {
      "OT": 52.3,
      "ASTS": 0,
      "OPM": 2,
      "STS": 2,
      "T1": 221.5
    },
    "lastUpdated": "2025-01-15T10:00:01.000Z"
  },
  "lastUpdated": "2025-01-15T10:00:01.000Z"
}
```

#### GET /machines/:id/history/stream

Returns combined realtime/SPC datasets. Headers are chunked but the response is a single JSON payload.

Query params:

- `timeRange` (default `-1h`)
- `dataType` (`realtime`, `spc`, or omit for both)

Response (example):

```json
{
  "deviceId": "Machine 1",
  "timeRange": "-1h",
  "data": {
    "realtime": ["..."],
    "spc": ["..."]
  },
  "totalRecords": 123
}
```

### Alarm Messages

#### GET /machines/:id/alarms

Returns alarm history from InfluxDB for the machine.

Query params:

- `timeRange` (default `-1h`)

Response (example):

```json
{
  "data": [
    {
      "_time": "2025-01-15T10:00:00.000Z",
      "device_id": "Machine 1",
      "topic": "wm",
      "alarm_id": "1",
      "alarm_message": "安全门未关"
    }
  ],
  "metadata": {
    "deviceId": "Machine 1",
    "timeRange": "-1h"
  }
}
```

Common errors:

- `401 Unauthorized` if token missing/invalid.
- `404 Not Found` if machine does not exist.

**Note**: Alarms are stored in InfluxDB with the measurement name `alarms`.

### User Management (Admin/Internal)

These endpoints are protected by JWT but do not enforce admin roles. Responses include the `password` field.

#### POST /user

Create a user directly (password is not hashed here).

Request:

```json
{
  "username": "jdoe",
  "email": "user@example.com",
  "password": "password123",
  "accessLevel": "admin"
}
```

Response: user entity.

#### GET /user

Returns all users (includes password).

#### GET /user/:email

Returns a single user (includes password).

#### PATCH /user/:id

Update a user by ID.

#### DELETE /user/:email

Delete a user by email.

Common errors:

- `404 Not Found` if user does not exist (PATCH/DELETE).

### Subscription & Billing

All endpoints are prefixed with `/api/subscription` and require JWT.

**Rate Limits:**

- POST /create-checkout-session: 5 requests per minute
- POST /create-portal-session: 10 requests per minute
- GET /current: 30 requests per minute
- GET /plans: 50 requests per minute
- GET /payment-methods: 20 requests per minute
- DELETE /:subscriptionId: 5 requests per minute

#### POST /api/subscription/create-checkout-session

Create a Stripe checkout session.

**CURL Example:**

```bash
curl -X POST 'http://localhost:3000/api/subscription/create-checkout-session' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "lookupKey": "basic_monthly",
    "successUrl": "https://yourapp.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
    "cancelUrl": "https://yourapp.com/billing/cancel"
  }'
```

**Request Body:**

```json
{
  "lookupKey": "basic_monthly",
  "successUrl": "https://yourapp.com/billing/success",
  "cancelUrl": "https://yourapp.com/billing/cancel"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "url": "https://checkout.stripe.com/c/pay/cs_test_...",
    "sessionId": "cs_test_..."
  }
}
```

**Common errors:**

- `400 Bad Request` if Stripe is not configured or unhealthy.
- `404 Not Found` if user doesn't exist.

#### POST /api/subscription/create-portal-session

Create a Stripe billing portal session.

**CURL Example:**

```bash
curl -X POST 'http://localhost:3000/api/subscription/create-portal-session' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "returnUrl": "https://yourapp.com/account"
  }'
```

**Request Body:**

```json
{
  "returnUrl": "https://yourapp.com/account"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "url": "https://billing.stripe.com/p/session/..."
  }
}
```

#### GET /api/subscription/current

Returns the current subscription (or `null` if none / demo mode).

**CURL Example:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/current' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**

```json
{
  "subscription": {
    "id": "sub_...",
    "status": "active",
    "plan": {
      "id": "basic_monthly",
      "name": "Basic",
      "price": 9.99,
      "currency": "USD",
      "interval": "month"
    },
    "currentPeriodStart": 1736240000,
    "currentPeriodEnd": 1738918400,
    "cancelAtPeriodEnd": false
  }
}
```

#### GET /api/subscription/plans

Returns subscription plans (Stripe plans or demo fallback).

**CURL Example:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/plans' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**

```json
{
  "plans": [
    {
      "id": "basic_monthly",
      "name": "Basic",
      "description": "Perfect for small projects",
      "price": 9.99,
      "currency": "USD",
      "interval": "month",
      "features": ["Up to 5 machines"],
      "popular": false
    }
  ]
}
```

#### GET /api/subscription/payment-methods

Returns stored payment methods.

**CURL Example:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/payment-methods' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "payment_methods": [
      {
        "id": "pm_...",
        "brand": "visa",
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2026,
        "is_default": false
      }
    ]
  }
}
```

#### DELETE /api/subscription/:subscriptionId

Cancel a subscription at period end.

**CURL Example:**

```bash
curl -X DELETE 'http://localhost:3000/api/subscription/sub_abc123xyz789' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "subscription": {
      "id": "sub_...",
      "status": "active",
      "cancel_at_period_end": true,
      "current_period_end": 1738918400
    }
  }
}
```

### Stripe Webhooks (Public)

#### POST /api/webhooks/stripe

Stripe webhook endpoint. Requires raw body and `stripe-signature` header. Do not call from frontend.

**Webhook Events Handled:**

- `checkout.session.completed` - Checkout session successfully completed
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription updated (plan change, etc.)
- `customer.subscription.deleted` - Subscription canceled/deleted
- `invoice.payment_succeeded` - Payment succeeded, subscription renewed
- `invoice.payment_failed` - Payment failed, subscription past due

**Idempotency:**
All webhook events are tracked for idempotency. Duplicate events (same `event.id`) are automatically skipped to prevent duplicate processing.

For complete CURL examples and detailed documentation, see `docs/STRIPE_API_REFERENCE.md`.

### MQTT Connection

#### POST /connections

Creates a new AWS IoT connection. The `brokerUrl` field is required by DTO but is currently ignored by the backend.

Request:

```json
{
  "brokerUrl": "mqtt://localhost:1883",
  "username": "optional",
  "password": "optional"
}
```

Response:

```json
{
  "message": "Connected successfully",
  "clientId": "<uuid>"
}
```

#### DELETE /connections/:clientId

Deletes the AWS IoT thing and disconnects the client.

Response:

```json
{
  "message": "Connection removed and machine deleted successfully"
}
```

### Machine Timestream (Internal)

#### POST /machine-timestream

Loads demo CSV data into AWS Timestream.

Response:

```json
{
  "success": true,
  "recordsLoaded": 1234
}
```

### Health (Public)

#### GET /health

System-wide health status.

Response (example):

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "services": {
    "database": { "status": "ok", "responseTime": 5 },
    "influxdb": { "status": "ok", "responseTime": 8 },
    "redis": { "status": "ok", "responseTime": 2 },
    "mqtt": { "status": "ok" },
    "websocket": { "status": "ok" },
    "mockData": { "status": "ok" }
  },
  "overallResponseTime": 22
}
```

#### GET /health/database | /health/influxdb | /health/redis | /health/mqtt | /health/websocket

Service-specific health checks. Each returns:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "responseTime": 3,
  "details": {
    "connected": true
  }
}
```

#### GET /health/demo

Demo system status (includes integration summary and machine count).

#### GET /health/config

Exposes current configuration snapshot (safe values only).

Response example (`/health/config`):

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "environment": "development",
  "demoEnabled": true,
  "services": {
    "postgres": {
      "host": "localhost",
      "port": 5432,
      "database": "opcua_dashboard"
    },
    "influxdb": {
      "url": "http://localhost:8086",
      "org": "opcua-org",
      "bucket": "machine-data"
    },
    "redis": { "host": "localhost", "port": 6379 },
    "mqtt": { "brokerUrl": "mqtt://localhost:1883" }
  }
}
```

### Demo APIs (Public)

These endpoints are used for demo environments and local testing.

#### GET /demo/status

Returns demo status, service health summary, machine count.

Response example:

```json
{
  "status": "active",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "environment": "demo",
  "machineCount": 3,
  "mockDataRunning": true,
  "systemHealth": "healthy",
  "services": {
    "postgresql": "ok",
    "influxdb": "ok",
    "redis": "ok",
    "mqtt": "ok",
    "websocket": "ok"
  },
  "integration": "demoMqttServer"
}
```

#### GET /demo/machines

Returns machine list with online/offline info.

Response example:

```json
{
  "machines": [
    {
      "id": 1,
      "name": "Machine 1",
      "ipAddress": "192.168.1.100",
      "index": "1",
      "status": "running",
      "factory": "Line A",
      "lastDataReceived": "2025-01-15T10:00:01.000Z",
      "isOnline": true
    }
  ],
  "total": 1,
  "online": 1,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/machines/:deviceId/status

Returns cached status + tech configuration for a specific device.

Response example:

```json
{
  "machine": {
    "id": 1,
    "name": "Machine 1",
    "ipAddress": "192.168.1.100",
    "factory": "Line A"
  },
  "status": { "devId": "Machine 1", "Data": { "OT": 52.3 } },
  "techConfiguration": { "tempSetpoints": [220, 221, 222] },
  "lastUpdated": "2025-01-15T10:00:01.000Z",
  "isOnline": true,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/machines/:deviceId/realtime

Returns realtime history from InfluxDB for a device.

Response example:

```json
{
  "deviceId": "Machine 1",
  "timeRange": "-1h",
  "data": [{ "_time": "2025-01-15T10:00:00.000Z", "oil_temp": 52.3 }],
  "dataPoints": 120,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/machines/:deviceId/spc

Returns SPC history from InfluxDB for a device.

Response example:

```json
{
  "deviceId": "Machine 1",
  "timeRange": "-1h",
  "data": [{ "_time": "2025-01-15T10:00:00.000Z", "cycle_number": 6026 }],
  "cycles": 45,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/queue/status

Returns Redis queue lengths and processor status.

Response example:

```json
{
  "status": "active",
  "queues": {
    "realtime": { "length": 0, "name": "mqtt:realtime" },
    "spc": { "length": 1, "name": "mqtt:spc" },
    "tech": { "length": 0, "name": "mqtt:tech" }
  },
  "totalMessages": 1,
  "processor": { "connected": true, "processing": true },
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/websocket/status

Returns websocket connection/subscription counts.

Response example:

```json
{
  "status": "active",
  "connectedClients": 2,
  "subscriptions": { "Machine 1": 1 },
  "totalSubscriptions": 1,
  "activeRooms": ["machine-Machine 1"],
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### POST /demo/mock-data/start

Start mock data generation.

Response example:

```json
{
  "status": "started",
  "message": "Mock data generation started",
  "isRunning": true,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### POST /demo/mock-data/stop

Stop mock data generation.

Response example:

```json
{
  "status": "stopped",
  "message": "Mock data generation stopped",
  "isRunning": false,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/mock-data/status

Return mock data generator stats.

Response example:

```json
{
  "isGenerating": true,
  "status": "running",
  "generatedCount": 120,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### POST /demo/influxdb/flush

Flush InfluxDB buffer.

Response example:

```json
{
  "status": "flushed",
  "message": "InfluxDB write buffer flushed",
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### DELETE /demo/cache/clear

Clear all machine caches.

Response example:

```json
{
  "status": "cleared",
  "message": "All machine caches cleared",
  "machinesCleared": 3,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### DELETE /demo/cache/clear/:deviceId

Clear cache for one machine.

Response example:

```json
{
  "status": "cleared",
  "message": "Cache cleared for machine Machine 1",
  "deviceId": "Machine 1",
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/metrics

System metrics summary (health, machines, queues, websocket, mock data).

Response example:

```json
{
  "system": { "health": "healthy", "responseTime": 20, "uptime": 3600 },
  "machines": { "total": 3, "online": 2, "offline": 1 },
  "queues": { "totalMessages": 0, "processingRate": "N/A" },
  "websocket": { "connectedClients": 1, "totalSubscriptions": 1 },
  "mockData": { "enabled": true, "stats": { "generatedCount": 120 } },
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

#### GET /demo/logs/recent

Returns a placeholder message (log retrieval is not implemented).

Response example:

```json
{
  "message": "Log retrieval not implemented in this demo",
  "suggestion": "Use \"npm run demo:logs\" to view Docker Compose logs",
  "lines": 100,
  "timestamp": "2025-01-15T10:00:02.000Z"
}
```

### Debug APIs (Public, Development Only)

Use for debugging only. Do not call from production frontend.

#### GET /debug/redis/queue-lengths

```json
{
  "success": true,
  "mqtt:realtime": 0,
  "mqtt:spc": 1,
  "mqtt:tech": 0,
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### GET /debug/redis/peek-message/:queue

```json
{
  "message": { "topic": "device/realtime", "payload": {} },
  "queue": "mqtt:realtime"
}
```

#### GET /debug/process/single-realtime

```json
{
  "success": true,
  "processedMessage": { "payload": {} },
  "remainingInQueue": 0
}
```

#### GET /debug/process/single-spc

```json
{
  "success": true,
  "processedMessage": { "payload": {} },
  "remainingInQueue": 0
}
```

#### GET /debug/influxdb/test-connection

```json
{ "success": true, "testData": { "devId": "test-device", "topic": "test" } }
```

#### GET /debug/processor/status

```json
{
  "isConnected": true,
  "processingStats": { "connected": true, "queueLengths": {} }
}
```

#### GET /debug/process/flush-all

```json
{
  "success": true,
  "processedCount": 2,
  "remainingQueues": { "mqtt:realtime": 0 }
}
```

#### GET /debug/simple-machine-check

```json
{
  "success": true,
  "timestamp": "2025-01-15T10:00:00.000Z",
  "machineCount": 1,
  "machines": [
    { "id": 1, "name": "Machine 1", "ip": "192.168.1.100", "status": "running" }
  ],
  "targetMachineExists": false
}
```

#### GET /debug/comprehensive-diagnostic

```json
{
  "timestamp": "2025-01-15T10:00:00.000Z",
  "services": { "mqttProcessor": { "connected": true, "stats": {} } },
  "machines": { "count": 1, "machines": [] },
  "queues": { "mqtt:realtime": 0, "mqtt:spc": 0, "mqtt:tech": 0 },
  "errors": []
}
```

#### GET /debug/subscription/user/:userId

```json
{
  "timestamp": "2025-01-15T10:00:00.000Z",
  "userId": 1,
  "database": {},
  "stripe": {}
}
```

#### POST /debug/subscription/sync/:userId

```json
{ "timestamp": "2025-01-15T10:00:00.000Z", "userId": 1, "success": true }
```

#### GET /debug/subscription/database-state

```json
{
  "timestamp": "2025-01-15T10:00:00.000Z",
  "totalSubscriptions": 0,
  "subscriptions": []
}
```

Common errors:

- `500 Internal Server Error` when dependencies (Redis/Stripe) are unavailable.

## Realtime Stream Integration (SSE)

### Connection Lifecycle

1. Request a stream ticket (authorized endpoint).
2. Open EventSource to `/sse/stream` with `deviceId` and `ticket` query params.
3. Receive realtime updates, SPC updates, alerts, and an initial `machine-status` snapshot.
4. On reconnect, re-use the ticket if still valid or request a new one.

Connection limits and timeouts:

- Max 5 concurrent connections per IP.
- SSE heartbeat every 25s.

### Client -> Server (Query Params)

- `deviceId`: required machine name (same as `subscribe-machine` payload).
- `deviceIds`: optional comma-separated list.
- `includeStatus`: optional, default true.
- `ticket`: short-lived token from `/sse/stream-ticket`.

### Stream Ticket Endpoint

`POST /sse/stream-ticket`

Headers (optional if using HTTP-only cookies):

```
Authorization: Bearer <access_token>
```

Request Body:

```json
{
  "ttlSeconds": 300,
  "purpose": "alerts"
}
```

Response:

```json
{
  "ticket": "<stream-ticket>",
  "expiresInSeconds": 300,
  "ticketId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## SSE Endpoints (Dual-Stream Architecture)

### POST /sse/stream-ticket
Create a short-lived stream ticket for SSE authentication.

**Authentication**: Bearer token (required)

**Request Body**:
```json
{
  "ttlSeconds": 300,
  "purpose": "alerts"
}
```

**Fields**:
- `ttlSeconds` (optional): TTL in seconds (60-3600, default: 300)
- `purpose` (optional): Stream purpose - `"alerts"`, `"data"`, or omit for legacy mode

**Response**:
```json
{
  "ticket": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresInSeconds": 300,
  "ticketId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Purpose Validation**:
- `purpose: "alerts"` → Only valid for `/sse/alerts`
- `purpose: "data"` → Only valid for `/sse/stream`
- Omitted purpose → Valid for both endpoints (backward compatible)

### GET /sse/alerts
Always-on alerts stream (global scope).

**Query Parameters**:
- `ticket` (required): Stream ticket JWT

**Event Types**: `machine-alert`, `alarm-update`, `system`

**Connection Limits**: 1 per user

**Example**:
```typescript
// 1. Create alerts ticket
const response = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'alerts', ttlSeconds: 300 }),
  credentials: 'include',
});
const { ticket } = await response.json();

// 2. Connect to alerts stream
const alertStream = new EventSource(
  `/sse/alerts?ticket=${encodeURIComponent(ticket)}`,
  { withCredentials: true }
);

// 3. Listen for alerts
alertStream.addEventListener('machine-alert', (e) => {
  const alert = JSON.parse(e.data);
  console.log('Alert:', alert);
});
```

### GET /sse/stream
Device-scoped data stream (1-10 devices).

**Query Parameters**:
- `ticket` (required): Stream ticket JWT
- `deviceId` (optional): Single device ID
- `deviceIds` (optional): Comma-separated device IDs (max 10)
- `includeStatus` (optional, default: true): Send initial status

**Event Types**: `machine-status`, `realtime-update`, `spc-update`, `spc-series-update`, `system`

**Connection Limits**: 1 per user, 1-10 devices per connection

**Example**:
```typescript
// 1. Create data ticket
const response = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'data', ttlSeconds: 300 }),
  credentials: 'include',
});
const { ticket } = await response.json();

// 2. Connect to data stream (multiple devices)
const dataStream = new EventSource(
  `/sse/stream?ticket=${encodeURIComponent(ticket)}&deviceIds=C02,C03,C04`,
  { withCredentials: true }
);

// 3. Listen for data events
dataStream.addEventListener('realtime-update', (e) => {
  const data = JSON.parse(e.data);
  console.log('Realtime:', data);
});

dataStream.addEventListener('spc-update', (e) => {
  const data = JSON.parse(e.data);
  console.log('SPC:', data);
});
```

### GET /sse/status
Connection status and debugging endpoint.

**Authentication**: Bearer token (required)

**Query Parameters**:
- `ticket` (optional): Stream ticket JWT to validate

**Response**:
```json
{
  "userId": 1,
  "ticketPurpose": "any",
  "connections": { "alerts": 1, "data": 0, "total": 1 },
  "limits": { "alerts": 1, "data": 1 },
  "activeConnections": [
    {
      "id": "550e8400-...",
      "purpose": "alerts",
      "deviceCount": 0,
      "devices": [],
      "connectedAt": "2026-01-28T21:23:30.211Z",
      "uptime": 125
    }
  ]
}
```

**Use cases**:
- Verify ticket validity before connecting
- Check current connection usage
- Debug connection limit issues
- Monitor active connections

### Server -> Client Events

#### machine-status

```json
{
  "deviceId": "Machine 1",
  "data": { "devId": "Machine 1", "Data": { "OT": 52.3 } },
  "source": "cache",
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### realtime-update

```json
{
  "deviceId": "postgres machine 1",
  "data": {
    "devId": "postgres machine 1",
    "topic": "realtime",
    "timestamp": 1767734969931,
    "Data": {
      "OT": 53.5,
      "ASTS": 0,
      "OPM": 3,
      "STS": 2,
      "T1": 221.5,
      "T2": 220.8,
      "T3": 222.1,
      "T4": 221.9,
      "T5": 222.3,
      "T6": 221.7,
      "T7": 222.0
    }
  },
  "timestamp": "2026-01-06T21:29:29.092Z"
}
```

#### spc-update

```json
{
  "deviceId": "Machine 1",
  "data": {
    "devId": "Machine 1",
    "topic": "spc",
    "timestamp": 1736935200000,
    "Data": {
      "CYCN": "6026",
      "ECYCT": "45.2",
      "EIVM": "152.3",
      "EIPM": "78.5",
      "ET1": "221.5"
    }
  },
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### machine-alert

Alerts are generated server-side based on realtime data.

```json
{
  "deviceId": "Machine 1",
  "alert": {
    "type": "high_oil_temperature",
    "severity": "warning",
    "message": "Oil temperature is high: 82C",
    "threshold": 80,
    "value": 82
  },
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### system

Heartbeat events emitted every ~25s.

```json
{ "kind": "heartbeat", "ts": "2025-01-15T10:00:00.000Z" }
```

Notes:

- The stream requires a valid `ticket` or Authorization header.
- Close the EventSource to unsubscribe.

### DemoMqttServer Log Objects (Debugging)

These are log summaries you will see in backend output when demo data is flowing.
They are useful for debugging, but are not client-facing payloads.

#### Parsed MQTT message (debug)

```json
{
  "devId": "postgres machine 1",
  "topic": "realtime",
  "timestamp": 1767734969931,
  "dataKeys": [
    "OT",
    "ASTS",
    "OPM",
    "STS",
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T6",
    "T7"
  ]
}
```

#### Broadcast payload summary (debug)

```json
{
  "deviceId": "postgres machine 1",
  "dataType": "realtime",
  "timestamp": "2026-01-06T21:29:29.092Z",
  "subscribedClients": 0
}
```

## Frontend Data Flow and State Expectations

Key identifiers:

- REST uses `machineId` for most endpoints.
- SSE and MQTT use `deviceId` = `machine.machineName`.

Recommended frontend flow:

1. Login -> HTTP-only cookie is set (store `access_token` only for non-browser clients).
2. Fetch `/machines/factories-machines` or `/factories` for layout.
3. Build a lookup map of `machineId -> machineName`.
4. For realtime views:
   - Request a stream ticket, then open EventSource.
   - Pass `deviceId` = `machineName` in the query string.
   - Update per-machine state on `realtime-update` / `spc-update` / `machine-alert`.
5. For history views:
   - Call `/machines/:id/realtime-history` and `/machines/:id/spc-history`.
   - Note that history uses Influx field names (snake_case).
6. For status widgets:
   - Use `/machines/:id/status` for one-off status.
   - Or rely on SSE `machine-status` on connect.

Field mapping tips (realtime updates vs. history data):

- SSE realtime uses raw MQTT tags like `Data.OT`, `Data.T1`, `Data.EIVM`, `Data.EIPM`.
- There are no camelCase aliases (e.g., `oilTemp`, `injectionVelocity`, `injectionPressure`) in live payloads.
- History uses Influx fields: `oil_temp`, `temp_1`, `operate_mode`, etc.
- Normalize these into one frontend shape to simplify UI.

## Field Mapping Appendix (MQTT vs InfluxDB)

Use this table to normalize telemetry between live SSE events and historical REST responses.

Realtime data:

| Meaning            | MQTT (SSE payload) | InfluxDB (history payload) |
| ------------------ | ------------------ | -------------------------- |
| Device ID          | `devId`            | `device_id`                |
| Oil temperature    | `Data.OT`          | `oil_temp`                 |
| Auto start         | `Data.ASTS`        | `auto_start`               |
| Operate mode       | `Data.OPM`         | `operate_mode`             |
| Status             | `Data.STS`         | `status`                   |
| Temperature zone 1 | `Data.T1`          | `temp_1`                   |
| Temperature zone 2 | `Data.T2`          | `temp_2`                   |
| Temperature zone 3 | `Data.T3`          | `temp_3`                   |
| Temperature zone 4 | `Data.T4`          | `temp_4`                   |
| Temperature zone 5 | `Data.T5`          | `temp_5`                   |
| Temperature zone 6 | `Data.T6`          | `temp_6`                   |
| Temperature zone 7 | `Data.T7`          | `temp_7`                   |

SPC data:

| Meaning                    | MQTT (SSE payload) | InfluxDB (history payload)   | Availability |
| -------------------------- | ------------------ | ---------------------------- | ------------ |
| Device ID                  | `devId`            | `device_id` (tag)            | Always       |
| Cycle number               | `Data.CYCN`        | `cycle_number`               | Always       |
| Cycle time                 | `Data.ECYCT`       | `cycle_time`                 | Always       |
| Injection velocity max     | `Data.EIVM`        | `injection_velocity_max`     | Always       |
| Injection pressure max     | `Data.EIPM`        | `injection_pressure_max`     | Always       |
| Switch pack time           | `Data.ESIPT`       | `switch_pack_time`           | Always       |
| Switch pack pressure       | `Data.ESIPP`       | `switch_pack_pressure`       | Optional     |
| Switch pack position       | `Data.ESIPS`       | `switch_pack_position`       | Optional     |
| Injection time             | `Data.EIPT`        | `injection_time`             | Optional     |
| Plasticizing time          | `Data.EPLST`       | `plasticizing_time`          | Optional     |
| Plasticizing pressure max  | `Data.EPLSPM`      | `plasticizing_pressure_max`  | Optional     |
| Temperature zone 1         | `Data.ET1`         | `temp_1`                     | Always       |
| Temperature zone 2         | `Data.ET2`         | `temp_2`                     | Always       |
| Temperature zone 3         | `Data.ET3`         | `temp_3`                     | Always       |
| Temperature zone 4         | `Data.ET4`         | `temp_4`                     | Optional     |
| Temperature zone 5         | `Data.ET5`         | `temp_5`                     | Optional     |
| Temperature zone 6         | `Data.ET6`         | `temp_6`                     | Optional     |
| Temperature zone 7         | `Data.ET7`         | `temp_7`                     | Optional     |
| Temperature zone 8         | `Data.ET8`         | `temp_8`                     | Optional     |
| Temperature zone 9         | `Data.ET9`         | `temp_9`                     | Optional     |
| Temperature zone 10        | `Data.ET10`        | `temp_10`                    | Optional     |
| Injection pressure set     | `Data.EIPSE`       | `injection_pressure_set`     | Optional     |
| Fill/cooling time          | `Data.EFCHT`       | `fill_cooling_time`          | Optional     |
| Injection pressure set min | `Data.EIPSMIN`     | `injection_pressure_set_min` | Optional     |
| Oil temperature (cycle)    | `Data.EOT`         | `oil_temperature_cycle`      | Optional     |
| End mold open speed        | `Data.EMOS`        | `end_mold_open_speed`        | Optional     |
| Injection start speed      | `Data.EISS`        | `injection_start_speed`      | Optional     |

### Field Availability Notes

**Realtime Data:**

- All 11 fields (`OT`, `ASTS`, `OPM`, `STS`, `T1`-`T7`) are always present in SSE updates
- All 11 fields are stored in InfluxDB historical data
- Field values are transmitted as numbers (parsed from DynamoDB format)

**SPC Data:**

- **Required fields** (always present): `CYCN`, `ECYCT`, `EIVM`, `EIPM`, `ESIPT`, `ET1`, `ET2`, `ET3`
- **Optional InfluxDB fields** (may be present): `ESIPP`, `ESIPS`, `EIPT`, `EPLST`, `EPLSPM`, `EIPSE`, `EFCHT`, `EIPSMIN`, `EOT`, `EMOS`, `EISS`, `ET4`-`ET10`
- Frontend should handle missing optional fields gracefully
- All SPC field values are transmitted as strings in SSE payloads
- All fields broadcast via SSE are now also stored in InfluxDB for historical analysis

**Tech Data:**

- Only available via Redis cache (accessed through `GET /machines/:id/status` which may include tech config)
- Not broadcast via SSE realtime updates
- Contains 50 fields organized as 5 arrays of 10 values each:
  - `TS1`-`TS10` (Temperature Setpoints)
  - `IP1`-`IP10` (Injection Pressure Steps)
  - `IV1`-`IV10` (Injection Velocity Steps)
  - `IS1`-`IS10` (Injection Stroke Steps)
  - `IT1`-`IT10` (Injection Time Steps)
- Tech configuration changes infrequently (typically only on job changes)
- TTL: 1 hour in Redis cache

## Error Handling

REST errors use standard NestJS shape:

```json
{
  "statusCode": 400,
  "message": "Bad Request",
  "error": "Bad Request"
}
```

Common error cases:

- `401 Unauthorized`: missing/invalid JWT.
- `403 Forbidden`: user does not own the resource.
- `404 Not Found`: resource does not exist.
- `409 Conflict`: duplicate user or machine IP (environment-dependent).
- `400 Bad Request`: Stripe not configured, invalid input, or webhook issues.

SSE errors should be handled via the `onerror` callback. Reconnects are automatic; request a new ticket if needed.

## Best Practices and Pitfalls

- Use `machineName` as `deviceId` for SSE streams.
- **Pagination is now enforced** for `/machines/:id/*-history` - implement pagination controls with `limit`, `offset`, and `hasMore` flag.
- **Use SSE for live data** (≤5 minute time ranges) instead of polling the history endpoints.
- Avoid using `/user` endpoints in frontend; they expose `password` fields and lack role checks.
- SSE requires a stream ticket; ensure the frontend requests tickets per user session.
- When updating factories, send all numeric fields to avoid backend `undefined` handling errors.
- Handle Stripe endpoints defensively (can return demo-mode errors in non-prod).
- Keep SSE connections under 5 per IP (tab explosion will disconnect).

## Real-Time Data via SSE

### Recommendation: Use SSE for Recent Data

For time ranges of **5 minutes or less**, use the SSE stream instead of polling the API. This provides instant updates and significantly reduces API load.

### SSE Connection

```typescript
const ticketResponse = await fetch('/sse/stream-ticket', {
  method: 'POST',
  credentials: 'include',
});
const { ticket } = await ticketResponse.json();

const streamUrl = `${API_URL}/sse/stream?deviceId=Machine%201&ticket=${ticket}`;
const stream = new EventSource(streamUrl, { withCredentials: true });
```

### Subscribe to Machine Updates

```typescript
stream.addEventListener('realtime-update', (event) => {
  const payload = JSON.parse(event.data);
  updateDashboard(payload);
});

stream.addEventListener('spc-update', (event) => {
  const payload = JSON.parse(event.data);
  updateSPCChart(payload);
});

stream.addEventListener('machine-alert', (event) => {
  const payload = JSON.parse(event.data);
  showAlert(payload);
});

stream.onerror = (error) => {
  console.error('SSE error:', error);
};

// Unsubscribe when done
// stream.close();
```

### Recommended Architecture

1. **Initial Load**: Fetch last 1 hour of data via paginated API
2. **Live Updates**: Connect to SSE for real-time data
3. **Hybrid Approach**:
   - Use API for historical data (timeRange > -5m)
   - Use SSE for recent data (timeRange <= -5m)
   - No polling needed - updates are pushed instantly

### Migration from Polling to SSE

**Before (polling - slow):**

```typescript
setInterval(() => {
  fetch(`/machines/${id}/realtime-history?timeRange=-5m`)
    .then((res) => res.json())
    .then((data) => updateChart(data));
}, 5000); // Poll every 5 seconds
```

**After (SSE - instant):**

```typescript
const stream = new EventSource(
  `${API_URL}/sse/stream?deviceId=${encodeURIComponent(id)}&ticket=${ticket}`,
);

stream.addEventListener('realtime-update', (event) => {
  const payload = JSON.parse(event.data);
  if (payload.deviceId === id) {
    updateChart(payload.data); // No polling needed!
  }
});
```

## Data Aggregation

For long time ranges, use the `aggregate` parameter to downsample data:

### When to Use Aggregation

- **Time range > 1 hour**: Use `aggregate=5m` or `aggregate=15m`
- **Time range > 6 hours**: Use `aggregate=1h` or `aggregate=6h`
- **Time range > 24 hours**: Use `aggregate=1h` or `aggregate=1d`

### Example Usage

```typescript
// Fetch 24 hours of data, downsampled to 15-minute intervals
const timeRange = '-24h';
const aggregate = '15m';

const res = await fetch(
  `/machines/${id}/realtime-history?timeRange=${timeRange}&aggregate=${aggregate}`,
);
const { data, aggregation } = await res.json();
// Result: ~96 records instead of ~1440 records (if 1-min intervals)
```

### Aggregation Windows

- `1m`, `5m`, `15m`, `30m` - For short to medium time ranges
- `1h`, `6h` - For long time ranges
- `1d` - For very long time ranges (weeks)

Aggregated queries return significantly fewer records while preserving trends.

### SPC Performance Optimization

For SPC charts, use the v2.0 endpoints:

1. **Control Limits**: Use `/spc/limits` instead of calculating client-side

   - Cached for 30 minutes
   - Includes UCL, LCL, mean, stdDev

2. **Historical Data**: Use `/spc/history-optimized` for large time ranges

   - Automatic downsampling based on time range
   - Field projection reduces payload size

3. **Real-time Updates**: Use `/spc/latest` instead of polling
   - 10-second cache
   - Returns only requested fields

Example complete SPC chart integration:

```typescript
// Initial load
const [limits, history, metadata] = await Promise.all([
  fetch(`/machines/${id}/spc/limits?fields=cycle_time`).then((r) => r.json()),
  fetch(
    `/machines/${id}/spc/history-optimized?from=${dayAgo}&to=${now}&fields=cycle_time`,
  ).then((r) => r.json()),
  fetch(`/machines/${id}/spc/metadata`).then((r) => r.json()),
]);

// Real-time polling (10-second cache friendly)
setInterval(async () => {
  const latest = await fetch(`/machines/${id}/spc/latest?count=1`).then((r) =>
    r.json(),
  );
  updateChart(latest.data[0]);
}, 10000);
```

## Example Frontend Snippets

### REST Client (Fetch)

```ts
export class ApiClient {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}

  setToken(token: string) {
    this.token = token;
  }

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async login(email: string, password: string) {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: this.headers(),
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    this.setToken(data.access_token); // optional for non-browser clients
    return data;
  }

  async getFactoriesAndMachines() {
    const res = await fetch(`${this.baseUrl}/machines/factories-machines`, {
      headers: this.headers(),
      credentials: 'include',
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
}
```

### SSE Setup

```ts
export async function createMachineStream(
  apiBaseUrl: string,
  accessToken: string,
  deviceId: string,
) {
  const ticketResponse = await fetch(`${apiBaseUrl}/sse/stream-ticket`, {
    method: 'POST',
    credentials: 'include',
  });
  const { ticket } = await ticketResponse.json();

  const streamUrl = `${apiBaseUrl}/sse/stream?deviceId=${encodeURIComponent(deviceId)}&ticket=${ticket}`;
  const stream = new EventSource(streamUrl, { withCredentials: true });

  stream.onerror = (err) => {
    console.error('SSE error', err);
  };

  return stream;
}
```

### Subscription Flow Example

```ts
const deviceId = 'Machine 1'; // machineName
const stream = await createMachineStream(
  import.meta.env.VITE_API_URL,
  accessToken,
  deviceId,
);

stream.addEventListener('realtime-update', (event) => {
  const payload = JSON.parse(event.data);
  console.log('Realtime update', payload);
});
```

## Testing Tips

- REST: use Postman or `curl` with `Authorization: Bearer <token>`.
- SSE: use `curl -N` to keep the connection open.

Example SSE connect:

```
curl -N "http://localhost:3000/sse/stream?deviceId=Machine%201&ticket=<ticket>"
```
