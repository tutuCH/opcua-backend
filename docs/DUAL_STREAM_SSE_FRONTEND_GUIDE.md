# Dual-Stream SSE Frontend Integration Guide (Next.js + TypeScript)

This guide explains how to integrate the **dual-stream SSE** architecture on the frontend. It includes endpoint details, request/response shapes, error handling, and production-grade Next.js TypeScript samples.

## Quick Summary

- **Two SSE streams**:
  - **Alerts stream**: `/sse/alerts?ticket=...`
  - **Data stream**: `/sse/stream?deviceId=...&ticket=...` or `/sse/stream?deviceIds=...&ticket=...`
- **Stream tickets** are short-lived and purpose-specific. You must request tickets from `/sse/stream-ticket` before connecting.
- **Limits**:
  - Per-user: **1 alerts** + **1 data** connection at a time.
  - Per-data stream: **max 10 devices** per stream.
  - IP limit: **5 total connections per IP** (applies only if per-user limits permit).

---

## Base URLs

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

In production, replace with your actual domains.

---

## Authentication

### Login

**Endpoint**: `POST /auth/login`

**Request**
```json
{
  "email": "tuchenhsien@gmail.com",
  "password": "abc123"
}
```

**Response (200)**
```json
{
  "access_token": "<JWT>"
}
```

Use `Authorization: Bearer <access_token>` for protected endpoints.

---

## Stream Ticketing

### Create Stream Ticket

**Endpoint**: `POST /sse/stream-ticket`

**Headers**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request**
```json
{
  "ttlSeconds": 300,
  "purpose": "alerts" | "data"
}
```

**Response (200)**
```json
{
  "ticket": "<JWT>",
  "expiresInSeconds": 300,
  "ticketId": "<uuid>"
}
```

**Notes**
- `purpose` determines which stream can use the ticket.
- Tickets expire quickly; refresh or reissue as needed.

---

## Status

### Get SSE Status

**Endpoint**: `GET /sse/status`

**Headers**
```
Authorization: Bearer <access_token>
```

**Optional Query**
```
/sse/status?ticket=<ticket>
```

**Response (200)**
```json
{
  "userId": 1,
  "ticketPurpose": "alerts" | "data" | "N/A",
  "connections": { "alerts": 0, "data": 0, "total": 0 },
  "limits": { "alerts": 1, "data": 1 },
  "activeConnections": [
    {
      "id": "<uuid>",
      "purpose": "alerts" | "data",
      "deviceCount": 0,
      "devices": [],
      "connectedAt": "2026-01-28T23:25:41.488Z",
      "uptime": 9
    }
  ]
}
```

---

## SSE Endpoints

### Alerts Stream

**Endpoint**: `GET /sse/alerts?ticket=<ALERTS_TICKET>`

**Events**
- `system` (heartbeat)
- `machine-alert` (future logic)

**Example Event**
```
event: system
data: {"kind":"heartbeat","ts":"2026-01-28T23:41:37.687Z"}
```

### Data Stream

**Endpoint**: `GET /sse/stream?deviceId=C02&ticket=<DATA_TICKET>`

Or multiple devices (max 10):
```
/sse/stream?deviceIds=C02,C03,C04&ticket=<DATA_TICKET>
```

**Events**
- `machine-status`
- `realtime-update`
- `spc-update`
- `system` (heartbeat)

**Example Event**
```
event: realtime-update
data: {"deviceId":"C02", "data": { ... }}
```

---

## Error Responses

### Connection Limit (per-user)

**Response (429)**
```json
{
  "statusCode": 429,
  "message": "Alert stream connection limit exceeded",
  "error": "Too Many Requests",
  "currentConnections": { "alerts": 1, "data": 1, "total": 2 },
  "limits": { "alerts": 1, "data": 1 }
}
```

### Wrong Ticket Purpose

**Response (401)**
```json
{
  "statusCode": 401,
  "message": "Ticket not valid for data stream (ticket purpose: alerts)",
  "error": "Unauthorized"
}
```

### Device Limit

**Response (400)**
```json
{
  "statusCode": 400,
  "message": "Maximum 10 devices allowed per data stream",
  "error": "Bad Request",
  "requested": 11,
  "limit": 10
}
```

### Invalid/Expired Ticket

**Response (401)**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired stream ticket",
  "error": "Unauthorized"
}
```

---

## TypeScript Types

```ts
export type LoginResponse = {
  access_token: string;
};

export type StreamTicketPurpose = 'alerts' | 'data' | 'any';

export type StreamTicketResponse = {
  ticket: string;
  expiresInSeconds: number;
  ticketId: string;
};

export type StatusResponse = {
  userId: number;
  ticketPurpose: 'alerts' | 'data' | 'N/A';
  connections: { alerts: number; data: number; total: number };
  limits: { alerts: number; data: number };
  activeConnections: Array<{
    id: string;
    purpose: 'alerts' | 'data';
    deviceCount: number;
    devices: string[];
    connectedAt: string;
    uptime: number;
  }>;
};

export type SystemHeartbeat = {
  kind: 'heartbeat';
  ts: string;
};

export type MachineStatusEvent = {
  deviceId: string;
  data: Record<string, unknown>;
  source?: 'cache' | 'live';
  timestamp: string;
};

export type RealtimeUpdateEvent = {
  deviceId: string;
  data: Record<string, unknown>;
  timestamp: string;
};

export type SpcUpdateEvent = {
  deviceId: string;
  data: Record<string, unknown>;
  timestamp: string;
};
```

---

## Next.js (App Router) Recommended Approach

### 1) Central API client (server-side token + ticket)

Create `src/lib/sseApi.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return (await res.json()) as { access_token: string };
}

export async function createStreamTicket(
  accessToken: string,
  purpose: 'alerts' | 'data',
  ttlSeconds = 300
) {
  const res = await fetch(`${API_BASE}/sse/stream-ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purpose, ttlSeconds }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Ticket failed: ${res.status} ${msg}`);
  }
  return (await res.json()) as {
    ticket: string;
    expiresInSeconds: number;
    ticketId: string;
  };
}
```

### 2) Client-side SSE hook

Create `src/hooks/useSseStream.ts`:

```ts
import { useEffect, useRef } from 'react';

type SseHandlers = {
  onOpen?: () => void;
  onError?: (e: Event) => void;
  onSystem?: (data: unknown) => void;
  onMachineStatus?: (data: unknown) => void;
  onRealtimeUpdate?: (data: unknown) => void;
  onSpcUpdate?: (data: unknown) => void;
  onMachineAlert?: (data: unknown) => void;
};

export function useSseStream(url: string | null, handlers: SseHandlers) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => handlers.onOpen?.();
    es.onerror = (e) => handlers.onError?.(e);

    es.addEventListener('system', (e) => {
      handlers.onSystem?.(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener('machine-status', (e) => {
      handlers.onMachineStatus?.(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener('realtime-update', (e) => {
      handlers.onRealtimeUpdate?.(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener('spc-update', (e) => {
      handlers.onSpcUpdate?.(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener('machine-alert', (e) => {
      handlers.onMachineAlert?.(JSON.parse((e as MessageEvent).data));
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);
}
```

### 3) Example component (client)

`src/app/sse-demo/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSseStream } from '@/hooks/useSseStream';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

export default function SseDemo() {
  const [alertUrl, setAlertUrl] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // Use your own secure login flow in production.
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tuchenhsien@gmail.com', password: 'abc123' }),
      });
      const { access_token } = await loginRes.json();

      const alertTicketRes = await fetch(`${API_BASE}/sse/stream-ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose: 'alerts', ttlSeconds: 300 }),
      });
      const { ticket: alertTicket } = await alertTicketRes.json();

      const dataTicketRes = await fetch(`${API_BASE}/sse/stream-ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose: 'data', ttlSeconds: 300 }),
      });
      const { ticket: dataTicket } = await dataTicketRes.json();

      setAlertUrl(`${API_BASE}/sse/alerts?ticket=${encodeURIComponent(alertTicket)}`);
      setDataUrl(`${API_BASE}/sse/stream?deviceId=C02&ticket=${encodeURIComponent(dataTicket)}`);
    }

    init();
  }, []);

  useSseStream(alertUrl, {
    onSystem: (data) => console.log('alerts heartbeat', data),
    onMachineAlert: (data) => console.log('alert', data),
    onError: (e) => console.error('alerts error', e),
  });

  useSseStream(dataUrl, {
    onMachineStatus: (data) => console.log('status', data),
    onRealtimeUpdate: (data) => console.log('realtime', data),
    onSpcUpdate: (data) => console.log('spc', data),
    onError: (e) => console.error('data error', e),
  });

  return (
    <div>
      <h1>Dual Stream SSE Demo</h1>
      <p>Alerts: {alertUrl ? 'connected' : 'not connected'}</p>
      <p>Data: {dataUrl ? 'connected' : 'not connected'}</p>
    </div>
  );
}
```

---

## Recommended Reconnect Strategy

- If an SSE connection errors or closes unexpectedly, **refresh the ticket** and reconnect.
- Use exponential backoff:
  - 1s → 2s → 4s → 8s → 16s (cap at 30s)
- Always call `EventSource.close()` on component unmount.

---

## CORS + Credentials

- Use `withCredentials: true` if backend sets cookies or requires them.
- Ensure backend allows your frontend origin in CORS config.
- If you hit CORS errors, verify `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` headers.

---

## Common Pitfalls

- **Using data ticket on alerts endpoint** → `401 Unauthorized`.
- **Using alerts ticket on data endpoint** → `401 Unauthorized`.
- **More than 10 devices in one stream** → `400 Bad Request`.
- **Expired ticket** → `401 Unauthorized`.
- **Second stream of same purpose for same user** → `429 Too Many Requests`.

---

## Testing Checklist (Frontend)

- Alerts stream connects and receives heartbeat.
- Data stream receives `machine-status` then `realtime-update`/`spc-update`.
- Alerts stream never receives data events.
- Data stream never receives alert events.
- Error handling gracefully retries with a fresh ticket.

---

## Production Notes

- Do not embed user credentials in frontend code.
- Store JWT securely (prefer httpOnly cookies from a backend login proxy).
- Refresh stream tickets in a background task before expiry.
- Consider backpressure / UI batching for high-frequency data events.

---

**End of Guide**
