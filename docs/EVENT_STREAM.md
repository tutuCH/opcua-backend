Below is a detailed, implementation-ready document for **Server-Sent Events (Event Stream / SSE)** for your **NestJS dashboard backend** (demo, low traffic, alert + live dashboard updates).

---

# Event Stream (SSE) Implementation Document

**Target stack:** NestJS + (InfluxDB for time-series) + Postgres + Redis/SQS (optional)
**Use case:** Browser dashboard receives live updates + alerts (server ➜ client only)
**Retention:** 24 hours
**Ingest:** 10 points / 5 seconds per device stream (low volume)

---

## 1. Why SSE for this dashboard

### When SSE is a good fit

* You only need **server ➜ browser** push.
* You want simplest browser integration (`EventSource`).
* Low/medium message volume and low concurrency (demo).

### When SSE is NOT a good fit

* You need **bi-directional** messaging (commands/acks/client-to-server).
* You expect **many** concurrent clients (thousands) on one node.
* You want purely “Lambda-only” long-lived connections (SSE needs long-lived HTTP).

---

## 2. High-level architecture

### Data flow

1. **Device ingest** writes telemetry into InfluxDB.
2. Ingest pipeline also **publishes events** (small JSON) into an internal event bus:

   * For single node demo: in-memory `Subject` is fine.
   * For multiple instances: Redis Pub/Sub (or SQS fanout with a local relay) recommended.
3. **SSE endpoint** streams events to connected browsers:

   * Each client subscribes to “topics” (accountId/siteId/deviceId).
   * Server filters and emits only relevant events.

### Recommended “event types” for the dashboard

* `telemetry`: real-time point updates (thin payload)
* `alert`: threshold breach / anomaly / offline
* `device_status`: online/offline/heartbeat
* `system`: backend notices, maintenance banners

---

## 3. Message contract (SSE event schema)

SSE supports **named events** and **id** (useful for replay hints).

### SSE event format on wire

Each message is:

```
id: <string>
event: <event_name>
data: <stringified JSON>
\n
```

### JSON payload shape (recommended)

```json
{
  "ts": "2026-01-27T12:34:56.789Z",
  "topic": "account:123/site:1/device:elink-99",
  "type": "telemetry",
  "data": {
    "deviceId": "elink-99",
    "fields": {
      "T1": 247,
      "OPM": 3
    }
  }
}
```

### Event ID strategy

Use a monotonic-ish ID:

* `eventId = <epoch_ms>-<random>` OR `<ulid>`
* This allows:

  * debugging
  * client-side de-duplication
  * optional replay requests

---

## 4. Endpoint design

### 4.1 SSE stream endpoint

**GET** `/api/stream`
Query parameters (choose what you need):

* `accountId=...`
* `siteId=...`
* `deviceId=...` (optional)
* `topics=...` (comma-separated)
* `since=...` (optional, ISO time for “catch-up”)

Headers:

* `Authorization: Bearer <jwt>`
* `Last-Event-ID: <eventId>` (optional)

Response:

* `Content-Type: text/event-stream`
* `Cache-Control: no-cache`
* `Connection: keep-alive`

### 4.2 Backfill endpoint (optional but recommended)

SSE is best for “now”; backfill is better as normal HTTP:

**GET** `/api/events/backfill?topic=...&since=...&limit=...`

* Returns array of events (JSON)
* Client calls once on load, then connects to SSE for realtime

This avoids needing complicated replay buffers inside SSE.

### 4.3 Health endpoint (for ALB/monitoring)

**GET** `/health`

---

## 5. NestJS implementation (single-instance baseline)

### 5.1 SSE Controller

Use NestJS `@Sse()` which returns an RxJS `Observable<MessageEvent>`.

```ts
// stream.controller.ts
import { Controller, Sse, Query, Req, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { Request } from 'express';
import { StreamService } from './stream.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('api')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(
    @Req() req: Request,
    @Query('topics') topicsCsv?: string,
    @Query('deviceId') deviceId?: string,
    @Query('siteId') siteId?: string,
  ): Observable<MessageEvent> {
    const user = req.user as any; // from JwtAuthGuard
    const topics = this.streamService.buildTopics({ user, topicsCsv, deviceId, siteId });

    return this.streamService.events$().pipe(
      filter(evt => this.streamService.matchesTopics(evt.topic, topics)),
      map(evt => ({
        id: evt.id,
        type: evt.type,          // becomes "event:" in SSE
        data: evt,               // becomes JSON string in "data:"
      }) as MessageEvent),
    );
  }
}
```

### 5.2 Stream service (in-memory bus)

```ts
// stream.service.ts
import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export type StreamEventType = 'telemetry' | 'alert' | 'device_status' | 'system';

export interface StreamEvent {
  id: string;
  ts: string;      // ISO
  topic: string;   // account/site/device
  type: StreamEventType;
  data: any;
}

@Injectable()
export class StreamService {
  private readonly subject = new Subject<StreamEvent>();

  events$(): Observable<StreamEvent> {
    return this.subject.asObservable();
  }

  publish(evt: Omit<StreamEvent, 'ts'>) {
    this.subject.next({
      ...evt,
      ts: new Date().toISOString(),
    });
  }

  buildTopics(args: { user: any; topicsCsv?: string; deviceId?: string; siteId?: string }): string[] {
    // Keep it simple: user has accountId claims
    const accountId = args.user.accountId;

    if (args.topicsCsv) return args.topicsCsv.split(',').map(t => t.trim()).filter(Boolean);

    if (args.deviceId) return [`account:${accountId}/site:${args.siteId ?? '*'}/device:${args.deviceId}`];

    if (args.siteId) return [`account:${accountId}/site:${args.siteId}/device:*`];

    return [`account:${accountId}/site:*/device:*`];
  }

  matchesTopics(eventTopic: string, allowedTopics: string[]): boolean {
    // Simple wildcard matching for demo
    // You can replace with a real topic matcher.
    return allowedTopics.some(t => {
      const re = new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*') + '$');
      return re.test(eventTopic);
    });
  }
}
```

### 5.3 Publishing events from ingest path

Wherever you ingest telemetry:

* write to InfluxDB
* evaluate alert rules
* publish stream events

```ts
// ingest.service.ts (conceptual)
this.influx.writePoint(point);

this.streamService.publish({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type: 'telemetry',
  topic: `account:${accountId}/site:${siteId}/device:${deviceId}`,
  data: {
    deviceId,
    fields,
  },
});

if (isAlert) {
  this.streamService.publish({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'alert',
    topic: `account:${accountId}/site:${siteId}/device:${deviceId}`,
    data: { ruleId, severity, message, fields },
  });
}
```

---

## 6. Multi-instance support (Redis Pub/Sub recommended)

If you ever run more than one NestJS instance behind a load balancer, in-memory `Subject` will not work across instances.

### Option A (recommended): Redis Pub/Sub

* Publisher: any instance publishes to Redis channel `stream-events`
* Subscriber: each instance subscribes and pushes into its local `Subject`
* SSE clients connect to any instance, receive the same stream

**Redis subscription bridge**

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

    await this.sub.subscribe('stream-events');
    this.sub.on('message', (_channel, msg) => {
      const evt = JSON.parse(msg) as StreamEvent;
      // Re-inject into local subject for SSE subscribers
      this.streamService.publish({
        id: evt.id,
        type: evt.type,
        topic: evt.topic,
        data: evt.data,
      });
    });
  }

  async onModuleDestroy() {
    await this.sub?.quit();
    await this.pub?.quit();
  }

  async publish(evt: StreamEvent) {
    await this.pub.publish('stream-events', JSON.stringify(evt));
  }
}
```

Then your ingest uses `RedisStreamBridge.publish(evt)` instead of calling local publish.

### Option B: SQS

SQS is not Pub/Sub; it’s a queue. You’d need:

* SQS queue
* A poller in each instance pulling messages
* That increases latency and complexity for “live streams”
  For streaming fanout, Redis Pub/Sub is typically simpler.

---

## 7. Client implementation (browser)

### Minimal `EventSource`

```js
const url = `/api/stream?siteId=1&deviceId=elink-99`;
const es = new EventSource(url, { withCredentials: false });

es.addEventListener('telemetry', (e) => {
  const evt = JSON.parse(e.data);
  // update chart
});

es.addEventListener('alert', (e) => {
  const evt = JSON.parse(e.data);
  // show toast / add to alerts table
});

es.onerror = () => {
  // browser auto-reconnects
};
```

### Auth note

`EventSource` does **not** allow custom headers in many browsers.
Common patterns:

1. **Cookie-based auth** (recommended for web apps)
2. Token in query string (acceptable for demo but avoid in production logs)
3. Use a “stream ticket” endpoint:

   * client calls `/api/stream-token` with Authorization header
   * server returns short-lived token
   * client connects `/api/stream?ticket=...`

---

## 8. Keepalive, timeouts, and proxies

SSE connections can get killed by proxies / ALB idle timeouts unless you keep them alive.

### Server heartbeat (recommended)

Send a “comment” line or a `system` event every 15–30 seconds.

In NestJS, simplest is to merge a heartbeat Observable:

```ts
import { merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';

// inside stream()
const heartbeat$ = interval(25000).pipe(
  map(() => ({ type: 'system', data: { kind: 'heartbeat', ts: new Date().toISOString() } }) as MessageEvent)
);

return merge(realEvents$, heartbeat$);
```

### Nginx (if used) settings

Ensure it won’t buffer SSE:

```nginx
location /api/stream {
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

1. On page load, fetch history from DB:

   * last 5 minutes telemetry for charts
   * last 24 hours alerts list
2. Then connect SSE for live updates only

This makes your UX reliable without needing SSE replay buffers.

---

## 10. Data reduction for live stream

Avoid sending raw Influx records every time.

**Recommended:**

* Live SSE payload: “latest value snapshot” per device every 5 seconds (or less).
* Heavy chart history: fetched via REST from Influx.

This keeps SSE cheap and stable.

---

## 11. Event filtering rules

Do filtering server-side to reduce client work:

* Each SSE connection has allowed topics derived from JWT claims.
* Enforce:

  * account boundary
  * site boundary
  * device boundary

Also consider rate limiting:

* If a device updates too frequently, throttle per-connection (e.g., max 1 telemetry event per second).

---

## 12. AWS deployment notes (demo-friendly)

### Cheapest demo path

**Single EC2 instance** hosting NestJS + InfluxDB + Postgres + Redis via Docker Compose.

SSE works great here:

* No load balancer required
* No multi-instance fanout
* Simple ops

### If you add ALB later

* Ensure ALB idle timeout and heartbeat align.
* Sticky sessions are not required if you use Redis Pub/Sub, but SSE works fine either way.

---

## 13. Observability + troubleshooting checklist

### Server

* Track current SSE connections count:

  * increment on subscribe
  * decrement on complete/error
* Log event publish rate
* Log per-topic fanout counts (for debugging)

### Client

* Show “Live: Connected / Reconnecting…” status indicator
* If no heartbeat received in 60s, force reconnect

---

## 14. Security checklist (minimum viable)

* Auth required for stream (cookie/JWT/ticket).
* Validate topic filters against JWT claims.
* Don’t allow arbitrary `topics=` if it can cross accounts.
* Avoid putting long-lived secrets in query string (use ticket for production).

---

## 15. Suggested file/module structure (NestJS)

```
src/
  stream/
    stream.controller.ts
    stream.service.ts
    redis-stream.bridge.ts   (optional)
  ingest/
    ingest.controller.ts
    ingest.service.ts
  alerts/
  auth/
```

---

If you want, I can also provide:

* A **Docker Compose** example that includes NestJS + Postgres + InfluxDB + Redis tuned for SSE demo,
* A “**stream ticket**” auth implementation (best practice for EventSource),
* A topic matcher that supports hierarchical topics efficiently (no regex per event).
