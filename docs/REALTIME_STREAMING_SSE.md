Below is a detailed, implementation-ready document for **Server-Sent Events (Event Stream / SSE)** for your **NestJS dashboard backend** (demo, low traffic, alert + live dashboard updates).

---

# Realtime Streaming (SSE) - Socket.IO Replacement

> NOTE: Inline notes marked "Alignment" call out changes needed to match the current codebase and keep frontend changes minimal.

**Target stack:** NestJS + InfluxDB + Postgres + Redis (required; existing Pub/Sub via `RedisService`)
**Use case:** Browser dashboard receives live updates + alerts (server -> client only)
**Retention:** Live stream only; historical data from REST endpoints backed by InfluxDB/Redis
**Ingest:** MQTT processors already publish to Redis channels: `mqtt:realtime:processed`, `mqtt:spc:processed`, `machine:alerts`

> NOTE (Alignment): Preserve event names and payload shapes from `src/websocket/machine.gateway.ts` (`realtime-update`, `spc-update`, `machine-alert`, `machine-status`).

---

## 1. Why SSE for this dashboard

### When SSE is a good fit

- You only need **server ➜ browser** push.
- You want simplest browser integration (`EventSource`).
- Low/medium message volume and low concurrency (demo).

### When SSE is NOT a good fit

- You need **bi-directional** messaging (commands/acks/client-to-server).
- You expect **many** concurrent clients (thousands) on one node.
- You want purely “Lambda-only” long-lived connections (SSE needs long-lived HTTP).

> NOTE (Alignment): Current Socket.IO usage is bidirectional for `subscribe-machine`/`ping`; SSE replaces those with query params + connection lifecycle.

---

## 2. High-level architecture

### Data flow

1. **Device ingest** writes telemetry into InfluxDB.
2. Ingest pipeline **publishes events** into Redis Pub/Sub using `RedisService.publish`:

   - `mqtt:realtime:processed` (realtime data)
   - `mqtt:spc:processed` (SPC data)
   - `machine:alerts` (alerts)

   > NOTE (Alignment): These channels are already published by `mqtt-processor.service.ts` and `message-processor.service.ts`.

3. **SSE endpoint** subscribes to the same Redis channels and streams events to connected browsers:

   - Each client connects with `deviceId` (or `deviceIds`) query params to mirror `subscribe-machine`.
   - Server validates device ownership and filters events by `deviceId`.

### Recommended “event types” for the dashboard

- `realtime-update`: realtime machine data update
- `spc-update`: SPC data update
- `machine-alert`: alert/notification
- `machine-status`: cached status snapshot on connect (replaces `get-machine-status`)
- `system`: optional heartbeat/maintenance banner (only if needed by UI)

---

## 3. Dual-Stream Architecture

### Two Separate Endpoints

The SSE implementation provides two purpose-specific endpoints:

#### 1. Alerts Stream - `GET /sse/alerts`

**Purpose**: Always-on, global alert notifications

**Query Parameters**:
- `ticket` (required): Stream ticket JWT

**Event Types**:
- `machine-alert`: Machine alert/notification
- `alarm-update`: Alarm state change
- `system`: Heartbeat (every 25s)

**Connection Limits**: 1 per user

**Example**:
```javascript
// 1. Create ticket
const response = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'alerts', ttlSeconds: 300 }),
});
const { ticket } = await response.json();

// 2. Connect EventSource
const alertStream = new EventSource(
  `/sse/alerts?ticket=${encodeURIComponent(ticket)}`,
  { withCredentials: true }
);

// 3. Listen to events
alertStream.addEventListener('machine-alert', (e) => {
  const alert = JSON.parse(e.data);
  console.log('Alert:', alert);
  // { deviceId: "C02", alertType: "warning", message: "...", timestamp: "..." }
});

alertStream.addEventListener('system', (e) => {
  const data = JSON.parse(e.data);
  if (data.kind === 'heartbeat') {
    console.log('Heartbeat:', data.ts);
  }
});
```

#### 2. Data Stream - `GET /sse/stream`

**Purpose**: Device-scoped live data updates (1-10 devices)

**Query Parameters**:
- `ticket` (required): Stream ticket JWT
- `deviceId` (optional): Single device ID
- `deviceIds` (optional): Comma-separated device IDs (1-10)
- `includeStatus` (optional, default: true): Send initial machine-status

**Event Types**:
- `machine-status`: Initial status snapshot
- `realtime-update`: Real-time machine data
- `spc-update`: SPC cycle data
- `spc-series-update`: SPC series data
- `system`: Heartbeat (every 25s)

**Connection Limits**: 1 per user, 1-10 devices per connection

**Device Ownership**: Validated on connect

**Example**:
```javascript
// 1. Create ticket
const response = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ purpose: 'data', ttlSeconds: 300 }),
});
const { ticket } = await response.json();

// 2. Connect EventSource (multiple devices)
const dataStream = new EventSource(
  `/sse/stream?ticket=${encodeURIComponent(ticket)}&deviceIds=C02,C03,C04`,
  { withCredentials: true }
);

// 3. Listen to events
dataStream.addEventListener('machine-status', (e) => {
  const status = JSON.parse(e.data);
  console.log('Initial status:', status);
  // { deviceId: "C02", data: { devId: "C02", Data: {...} }, source: "cache", timestamp: "..." }
});

dataStream.addEventListener('realtime-update', (e) => {
  const data = JSON.parse(e.data);
  console.log('Realtime:', data);
  // { deviceId: "C02", data: { devId: "C02", Data: { T1: 220, OT: 57 } }, timestamp: "..." }
});

dataStream.addEventListener('spc-update', (e) => {
  const data = JSON.parse(e.data);
  console.log('SPC:', data);
  // { deviceId: "C02", data: { devId: "C02", Data: { CYCN: 8810, ECYCT: 36.61 } }, timestamp: "..." }
});
```

### Stream Tickets with Purpose

**Create Ticket**: `POST /sse/stream-ticket`

**Request Headers**:
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

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

**Ticket Storage**: Tickets are stored in Redis (`sse:ticket:<ticketId>`) with TTL for immediate expiry

### Status Endpoint (Debugging)

**Endpoint**: `GET /sse/status?ticket=<ticket>`

**Purpose**: Check connection stats and ticket validity before opening EventSource

**Response**:
```json
{
  "userId": 1,
  "ticketPurpose": "any",
  "connections": {
    "alerts": 1,
    "data": 0,
    "total": 1
  },
  "limits": {
    "alerts": 1,
    "data": 1
  },
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

Use this endpoint to:
- Verify ticket is valid before connecting
- Check current connection usage
- Debug connection limit issues
- Monitor active connections

### Connection Limits and Error Handling

**Limits**:
- 1 alerts stream per user
- 1 data stream per user (1-10 devices)
- 5 total connections per IP (backward compatible)

**Error Responses**:

**401 Unauthorized** - Missing/invalid authentication:
```json
{
  "statusCode": 401,
  "message": "Stream authentication required",
  "error": "Unauthorized"
}
```

**403 Forbidden** - Device access denied:
```json
{
  "statusCode": 403,
  "message": "Access denied to one or more devices",
  "error": "Forbidden"
}
```

**429 Too Many Requests** - Connection limit exceeded:
```json
{
  "statusCode": 429,
  "message": "Data stream connection limit exceeded",
  "error": "Too Many Requests",
  "currentConnections": { "alerts": 1, "data": 1, "total": 2 },
  "limits": { "alerts": 1, "data": 1 }
}
```

**Note**: EventSource treats non-200 responses as network errors and automatically retries. Ensure proper error handling on the client side.

### Backward Compatibility

**Legacy Mode**: Tickets without `purpose` field work on both endpoints

**Migration Path**:
1. Old clients continue using single ticket for both streams
2. New clients create purpose-specific tickets
3. Both modes work simultaneously

**Example** (legacy client):
```javascript
// Create ticket without purpose
const { ticket } = await createStreamTicket({ ttlSeconds: 300 });

// Works on both endpoints
const alertStream = new EventSource(`/sse/alerts?ticket=${ticket}`);
const dataStream = new EventSource(`/sse/stream?deviceId=C02&ticket=${ticket}`);
```

---

## 4. Message contract (SSE event schema)

SSE supports **named events** and **id** (useful for replay hints).

### SSE event format on wire

Each message is:

```
id: <string>
event: <event_name>
data: <stringified JSON>
\n
```

### JSON payload shape (aligned with current Socket.IO payloads)

```json
{
  "deviceId": "Machine 1",
  "data": {
    "Data": {
      "T1": 247,
      "OPM": 3
    }
  },
  "timestamp": "2026-01-27T12:34:56.789Z"
}
```

> NOTE (Alignment): Use `MachinesService.findOneForUser` (or `UserOwnershipGuard`) to validate `deviceId` access; reuse `JwtUserId` or `req.user` from the global guard.

> NOTE (Alignment): `machine-alert` payloads use `{ deviceId, alert, timestamp }`; `machine-status` uses cached `data` from Redis (`getMachineStatus`).

### Event ID strategy

Use a monotonic-ish ID:

- `eventId = <epoch_ms>-<random>` OR `<ulid>`
- This allows:

  - debugging
  - client-side de-duplication
  - optional replay requests

> NOTE (Alignment): Current payloads do not include an `id`. Keep `id` optional to avoid frontend changes.

---

## 4. Endpoint design

### 4.1 SSE stream endpoint

**GET** `/sse/stream`

> NOTE (Alignment): `/sse` avoids Socket.IO route conflicts while keeping the rest of the flow unchanged.

Query parameters (minimal set to mirror Socket.IO subscribe/unsubscribe):

- `deviceId=...` (required; mirrors `subscribe-machine` payload)
- `deviceIds=...` (optional comma-separated list if you want multi-device streams)
- `includeStatus=true` (optional; emit `machine-status` once on connect)

Headers:

- `Last-Event-ID: <eventId>` (optional)

> NOTE (Alignment): `EventSource` cannot send Authorization headers; prefer cookie auth or a short-lived ticket endpoint.

Response:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### 4.2 Backfill endpoint (optional but recommended)

SSE is best for “now”; backfill is better as normal HTTP:

Use existing REST endpoints instead of a new backfill endpoint:

- `GET /machines/:id/realtime-history`
- `GET /machines/:id/spc-history`
- `GET /machines/:id/realtime/latest`
- `GET /machines/:id/spc/latest`
- `GET /machines/:id/history/stream` (large datasets)

> NOTE (Alignment): These are already implemented in `src/machines/machines.controller.ts`.

This avoids needing complicated replay buffers inside SSE.

### 4.3 Health endpoint (for ALB/monitoring)

**GET** `/health`

---

## 5. NestJS implementation (single-instance baseline)

### 5.1 SSE Controller

Use NestJS `@Sse()` which returns an RxJS `Observable<MessageEvent>`.

> NOTE (Alignment): Global guards are already applied in `src/main.ts` (JwtAuthGuard + UserOwnershipGuard); explicit `@UseGuards()` here is optional.

```ts
// stream.controller.ts
import { Controller, Sse, Query, Req, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { Request } from 'express';
import { StreamService } from './stream.service';
import { JwtAuthGuard } from '../auth/strategies/auth.guard';

@Controller('sse')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(
    @Req() req: Request,
    @Query('deviceId') deviceId?: string,
    @Query('deviceIds') deviceIdsCsv?: string,
    @Query('includeStatus') includeStatus?: string,
  ): Observable<MessageEvent> {
    const deviceIds = this.streamService.resolveDeviceIds(
      deviceId,
      deviceIdsCsv,
    );

    return this.streamService.events$().pipe(
      filter((evt) =>
        this.streamService.matchesDevice(evt.deviceId, deviceIds),
      ),
      map(
        (evt) =>
          ({
            id: evt.id,
            type: evt.type, // becomes "event:" in SSE
            data: evt, // becomes JSON string in "data:"
          }) as MessageEvent,
      ),
    );
  }
}
```

### 5.2 Stream service (Redis bridge + optional in-memory bus)

```ts
// stream.service.ts
import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export type StreamEventType =
  | 'realtime-update'
  | 'spc-update'
  | 'machine-alert'
  | 'machine-status'
  | 'system';

export interface StreamEvent {
  id?: string;
  type: StreamEventType;
  deviceId: string;
  data?: any;
  alert?: any;
  timestamp: string; // ISO
}

@Injectable()
export class StreamService {
  private readonly subject = new Subject<StreamEvent>();

  events$(): Observable<StreamEvent> {
    return this.subject.asObservable();
  }

  publish(evt: Omit<StreamEvent, 'timestamp'>) {
    this.subject.next({
      ...evt,
      timestamp: new Date().toISOString(),
    });
  }

  resolveDeviceIds(deviceId?: string, deviceIdsCsv?: string): string[] {
    if (deviceId) return [deviceId];
    if (deviceIdsCsv)
      return deviceIdsCsv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    return [];
  }

  matchesDevice(eventDeviceId: string, allowedDeviceIds: string[]): boolean {
    if (allowedDeviceIds.length === 0) return false;
    return allowedDeviceIds.includes(eventDeviceId);
  }
}
```

> NOTE (Alignment): Subscribe to Redis channels via `RedisService.subscribe` and call `publish()` with the parsed payload instead of building a separate in-memory-only bus.

### 5.3 Publishing events from ingest path

Wherever you ingest telemetry:

- write to InfluxDB
- evaluate alert rules
- publish to Redis Pub/Sub (already done in `mqtt-processor.service.ts` and `message-processor.service.ts`)

> NOTE (Alignment): The SSE layer should subscribe to existing Redis channels; you do not need to add new publish calls unless you add new event types.

```ts
// ingest.service.ts (conceptual)
this.influx.writePoint(point);

this.streamService.publish({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type: 'realtime-update',
  deviceId,
  data: {
    deviceId,
    fields,
  },
});

if (isAlert) {
  this.streamService.publish({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'machine-alert',
    deviceId,
    alert: { ruleId, severity, message, fields },
  });
}
```

---

## 6. Multi-instance support (Redis Pub/Sub already in use)

If you run more than one NestJS instance behind a load balancer, in-memory `Subject` alone will not work across instances.

### Option A (recommended): Redis Pub/Sub

- Publisher: MQTT processors already publish to Redis channels (`mqtt:realtime:processed`, `mqtt:spc:processed`, `machine:alerts`)
- Subscriber: each instance subscribes via `RedisService.subscribe()` and pushes into its local `Subject`
- SSE clients connect to any instance, receive the same stream

> NOTE (Alignment): Reuse `src/redis/redis.service.ts` instead of creating a new raw `ioredis` client unless you need isolation.

**Redis subscription bridge**

> NOTE (Alignment): Keep channel-to-event mappings aligned with the existing Redis channels and Socket.IO event names.

```ts
// redis-stream.bridge.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { StreamService, StreamEvent } from './stream.service';

@Injectable()
export class RedisStreamBridge implements OnModuleInit, OnModuleDestroy {
  private pub!: Redis;
  private sub!: Redis;

  constructor(private readonly streamService: StreamService) {}

  async onModuleInit() {
    this.pub = new Redis(process.env.REDIS_URL!);
    this.sub = new Redis(process.env.REDIS_URL!);

    await this.sub.subscribe(
      'mqtt:realtime:processed',
      'mqtt:spc:processed',
      'machine:alerts',
    );
    this.sub.on('message', (channel, msg) => {
      const payload = JSON.parse(msg) as any;

      if (channel === 'mqtt:realtime:processed') {
        this.streamService.publish({
          type: 'realtime-update',
          deviceId: payload.deviceId,
          data: payload.data,
        });
        return;
      }

      if (channel === 'mqtt:spc:processed') {
        this.streamService.publish({
          type: 'spc-update',
          deviceId: payload.deviceId,
          data: payload.data,
        });
        return;
      }

      if (channel === 'machine:alerts') {
        this.streamService.publish({
          type: 'machine-alert',
          deviceId: payload.deviceId,
          alert: payload.alert,
        });
      }
    });
  }

  async onModuleDestroy() {
    await this.sub?.quit();
    await this.pub?.quit();
  }
}
```

Then your SSE module just subscribes; the ingest pipeline remains unchanged.

### Option B: SQS

SQS is not Pub/Sub; it’s a queue. You’d need:

- SQS queue
- A poller in each instance pulling messages
- That increases latency and complexity for “live streams”
  For streaming fanout, Redis Pub/Sub is typically simpler.

---

## 7. Client implementation (browser)

### Minimal `EventSource`

```js
const url = `/sse/stream?deviceId=Machine%201`;
const es = new EventSource(url, { withCredentials: true });

es.addEventListener('realtime-update', (e) => {
  const payload = JSON.parse(e.data);
  // update chart
});

es.addEventListener('spc-update', (e) => {
  const payload = JSON.parse(e.data);
  // update SPC chart
});

es.addEventListener('machine-alert', (e) => {
  const payload = JSON.parse(e.data);
  // show toast / add to alerts table
});

es.addEventListener('machine-status', (e) => {
  const payload = JSON.parse(e.data);
  // initialize status snapshot on connect
});

es.onerror = () => {
  // browser auto-reconnects
};

// To unsubscribe, close the EventSource.
// es.close();
```

> NOTE (Alignment): `subscribe-machine` / `unsubscribe-machine` are replaced by opening/closing an EventSource with `deviceId` query params.

### Auth note

`EventSource` does **not** allow custom headers in many browsers.
Common patterns:

1. **Cookie-based auth** (recommended; aligns with global guards in `src/main.ts` and `credentials: true` CORS)
2. Token in query string (acceptable for demo but avoid in production logs)
3. Use a “stream ticket” endpoint (optional):

   - client calls `/stream-ticket` with Authorization header
   - server returns short-lived token
   - client connects `/sse/stream?ticket=...`

---

## 8. Keepalive, timeouts, and proxies

SSE connections can get killed by proxies / ALB idle timeouts unless you keep them alive.

### Server heartbeat (recommended)

Send a “comment” line or a `system` event every 15–30 seconds.

> NOTE (Alignment): Socket.IO currently uses a 25s ping interval; keep SSE heartbeat around 25s to preserve timeout behavior.

In NestJS, simplest is to merge a heartbeat Observable:

```ts
import { merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';

// inside stream()
const heartbeat$ = interval(25000).pipe(
  map(
    () =>
      ({
        type: 'system',
        data: { kind: 'heartbeat', ts: new Date().toISOString() },
      }) as MessageEvent,
  ),
);

return merge(realEvents$, heartbeat$);
```

### Nginx (if used) settings

Ensure it won’t buffer SSE:

```nginx
location /sse/stream {
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_cache off;
  chunked_transfer_encoding on;
  proxy_read_timeout 3600;
}
```

---

## 9. Backfill strategy (recommended)

Because SSE is “from now”, you usually do:

1. On page load, fetch history from existing REST endpoints:

   - `GET /machines/:id/realtime-history`
   - `GET /machines/:id/spc-history`
   - `GET /machines/:id/realtime/latest` (fast snapshot)
   - `GET /machines/:id/spc/latest`

   > NOTE (Alignment): Alert history is stored in Redis list `machine:<deviceId>:alerts` (max 100) but no REST endpoint exists yet.

2. Then connect SSE for live updates only

This makes your UX reliable without needing SSE replay buffers.

---

## 10. Data reduction for live stream

Avoid sending raw Influx records every time.

**Recommended:**

- Live SSE payload: “latest value snapshot” per device every 5 seconds (or less).
- Heavy chart history: fetched via REST from Influx.

This keeps SSE cheap and stable.

> NOTE (Alignment): Use `LatestDataCacheService` for the latest snapshots to avoid requerying Influx on connect.

---

## 11. Event filtering rules

Do filtering server-side to reduce client work:

- Each SSE connection has allowed `deviceId` list derived from query params.
- Validate device ownership via `MachinesService.findOneForUser` (similar to existing REST endpoints).

Also consider rate limiting:

- If a device updates too frequently, throttle per-connection (e.g., max 1 realtime update per second).

---

## 12. AWS deployment notes (demo-friendly)

### Cheapest demo path

**Single EC2 instance** hosting NestJS + InfluxDB + Postgres + Redis via Docker Compose.

SSE works great here:

- No load balancer required
- No multi-instance fanout
- Simple ops

### If you add ALB later

- Ensure ALB idle timeout and heartbeat align.
- Sticky sessions are not required if you use Redis Pub/Sub, but SSE works fine either way.

---

## 13. Observability + troubleshooting checklist

### Server

- Track current SSE connections count:

  - increment on subscribe
  - decrement on complete/error

- Log event publish rate
- Log per-topic fanout counts (for debugging)

> NOTE (Alignment): WebSocket gateway enforces max 5 connections per IP; mirror this limit for SSE if you want identical behavior.

### Client

- Show “Live: Connected / Reconnecting…” status indicator
- If no heartbeat received in 60s, force reconnect

---

## 14. Security checklist (minimum viable)

- Auth required for stream (cookie/JWT/ticket).
- Validate `deviceId` filters against `MachinesService.findOneForUser`.
- Avoid putting long-lived secrets in query string (use ticket for production).

---

## 15. Suggested file/module structure (NestJS)

```
src/
  realtime-stream/
    realtime-stream.controller.ts
    realtime-stream.service.ts
    redis-stream.bridge.ts   (optional)
  ingest/
    ingest.controller.ts
    ingest.service.ts
  alerts/
  auth/
  websocket/                (removed after SSE migration)
```

---

If you want, I can also provide:

- A **Docker Compose** example that includes NestJS + Postgres + InfluxDB + Redis tuned for SSE demo,
- A “**stream ticket**” auth implementation (best practice for EventSource),
- A device filter that supports comma-separated `deviceIds` efficiently (no regex per event).
