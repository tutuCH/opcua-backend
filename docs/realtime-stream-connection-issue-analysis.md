**Date:** 2026-01-08
**Status:** Frontend Issue - Backend Configuration Verified
**Severity:** High - Frontend Page Continuously Reloading

---

# Realtime Stream Connection Issue Analysis (SSE)

## Issue Summary

After a frontend update, the application is experiencing continuous page reloads with SSE clients connecting and disconnecting rapidly. Backend logs show stream connections opening and closing within seconds, and realtime updates being published with no active subscribers.

---

## Root Causes

1. **Missing or expired stream ticket**

   - The SSE endpoint requires a short-lived `ticket` query param.
   - Tickets expire; EventSource reconnects must use a valid ticket.

2. **Missing `deviceId` query param**

   - The stream requires `deviceId` (machine name) or `deviceIds` list.
   - No device filter means no events are emitted.

3. **Connection limits per IP**

   - Max 5 concurrent connections per IP.
   - Additional connections are rejected with HTTP 429.

4. **Proxy idle timeouts**
   - SSE streams need a heartbeat every ~25s to keep connections alive.
   - Missing heartbeat or proxy buffering can cause disconnects.

---

## Recommended Frontend Connection Sequence

```javascript
// 1) Request a stream ticket
const ticketResponse = await fetch('/sse/stream-ticket', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { ticket } = await ticketResponse.json();

// 2) Connect to SSE stream
const deviceId = 'Machine 1';
const streamUrl = `/sse/stream?deviceId=${encodeURIComponent(deviceId)}&ticket=${ticket}`;
const stream = new EventSource(streamUrl, { withCredentials: true });

// 3) Listen for events
stream.addEventListener('realtime-update', (event) => {
  const payload = JSON.parse(event.data);
  updateDashboard(payload);
});

stream.addEventListener('machine-alert', (event) => {
  const payload = JSON.parse(event.data);
  showAlert(payload);
});

stream.onerror = (error) => {
  console.error('SSE error:', error);
  // Request a new ticket if the connection fails repeatedly
};
```

---

## Quick Checklist

- [ ] Stream ticket request succeeds (HTTP 200).
- [ ] Stream URL includes `deviceId` and `ticket`.
- [ ] No more than 5 concurrent EventSource connections per IP.
- [ ] SSE events `realtime-update`, `spc-update`, and `machine-alert` arrive.
- [ ] Heartbeat (`system` event) arrives every ~25s.
