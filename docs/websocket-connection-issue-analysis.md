# WebSocket Connection Issue Analysis

**Date:** 2026-01-08
**Status:** Frontend Issue - Backend Configuration Verified
**Severity:** High - Frontend Page Continuously Reloading

---

## Issue Summary

After a frontend update, the application is experiencing continuous page reloads with WebSocket clients connecting and disconnecting rapidly (0 seconds duration). Backend logs show:

1. WebSocket clients connecting and immediately disconnecting
2. MQTT "health check" messages failing JSON parsing
3. Realtime updates broadcasting to rooms with 0 subscribers

---

## Log Analysis

### 1. Rapid Connect/Disconnect Cycle

```
[Nest] 35097  - 01/08/2026, 9:00:07 AM     LOG [MachineGateway] Client connected: Zasivijuu_APJ6w6ABL9 from ::1 (1/5)
[Nest] 35097  - 01/08/2026, 9:00:07 AM     LOG [MachineGateway] Client disconnected: Zasivijuu_APJ6w6ABL9
[Nest] 35097  - 01/08/2026, 9:00:07 AM   DEBUG [MachineGateway] Client Zasivijuu_APJ6w6ABL9 was connected for 0s
```

**Root Cause:** The WebSocket gateway has a 5-minute inactivity timeout. If the frontend doesn't send events (`ping`, `subscribe-machine`, etc.) immediately after connecting, the client may be disconnected.

**Backend Configuration:**
- Connection timeout: 5 minutes of inactivity
- Connection limit: 5 connections per IP address
- WebSocket endpoint: `ws://localhost:3000/socket.io/`

### 2. MQTT Health Check JSON Parse Error

```
[Nest] 35097  - 01/08/2026, 9:00:08 AM   DEBUG [MqttProcessorService] 📨 Received MQTT message on topic: test
[Nest] 35097  - 01/08/2026, 9:00:08 AM   ERROR [MqttProcessorService] 💥 Failed to handle MQTT message from topic test:
[Nest] 35097  - 01/08/2026, 9:00:08 AM   ERROR [MqttProcessorService] SyntaxError: Unexpected token 'h', "health check" is not valid JSON
```

**Root Cause:** The Docker Compose health check sends a plain text "health check" message to the MQTT broker, which the backend MQTT processor tries to parse as JSON. This is expected behavior and not a frontend concern - it's a backend logging issue that can be safely ignored.

### 3. Broadcasting to Empty Rooms

```
[Nest] 35097  - 01/08/2026, 9:00:08 AM   DEBUG [MachineGateway] 📊 Broadcasting realtime update to room machine-postgres machine 1 with 0 subscribers
[Nest] 35097  - 01/08/2026, 9:00:08 AM     LOG [MachineGateway] ✅ Broadcasted realtime update for device postgres machine 1 to room machine-postgres machine 1 (0 clients)
```

**Root Cause:** Clients are disconnecting before they can subscribe to machine rooms, so updates are broadcasted to empty rooms.

---

## Frontend Issues & Solutions

### Issue 1: No Events Sent After Connection

**Problem:** The frontend connects to the WebSocket but doesn't send any events immediately, causing potential timeout issues.

**Solution:** Send a `ping` or `subscribe-machine` event immediately after connection:

```javascript
// After socket connection is established
socket.on('connect', () => {
  console.log('Connected to WebSocket');

  // Send ping immediately to keep connection alive
  socket.emit('ping');

  // OR subscribe to a machine right away
  socket.emit('subscribe-machine', {
    deviceId: 'your-machine-name'
  });
});
```

### Issue 2: Missing Reconnection Logic

**Problem:** The frontend doesn't automatically reconnect when disconnected.

**Solution:** Implement reconnection with exponential backoff:

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
});
```

### Issue 3: Incorrect Device ID Format

**Problem:** Using wrong deviceId format for subscriptions.

**Solution:** Use the exact `machineName` from the database (NOT an ID or UUID):

```javascript
// CORRECT - use the machine name from database
socket.emit('subscribe-machine', {
  deviceId: 'postgres machine 1'  // Exact name from DB
});

// INCORRECT - don't use UUID or ID
socket.emit('subscribe-machine', {
  deviceId: '123e4567-e89b-12d3-a456-426614174000'  // Wrong!
});
```

### Issue 4: No Error Handling

**Problem:** Frontend doesn't handle WebSocket errors or disconnection events.

**Solution:** Add comprehensive error handling:

```javascript
socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error);
  // Implement retry logic
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  // Reconnect if it was an unexpected disconnection
  if (reason === 'io server disconnect') {
    // Server initiated disconnect - reconnect manually
    socket.connect();
  }
  // Socket.io will auto-reconnect for other reasons
});
```

---

## Recommended Frontend Connection Sequence

```javascript
import { io } from 'socket.io-client';

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.socket = io('ws://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Connection established
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket.id);
      this.reconnectAttempts = 0;

      // Send ping immediately to prevent timeout
      this.socket.emit('ping');

      // Subscribe to machines after successful connection
      this.subscribeToMachines();
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        // Show user-facing error message
      }
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);

      if (reason === 'io server disconnect') {
        // Server initiated disconnect - manual reconnect
        setTimeout(() => this.socket.connect(), 1000);
      }
    });

    // Pong response
    this.socket.on('pong', () => {
      console.log('🏓 Pong received');
    });

    // Realtime updates
    this.socket.on('realtime-update', (data) => {
      console.log('📊 Realtime update received:', data);
      // Handle update in your UI
    });

    // SPC updates
    this.socket.on('spc-update', (data) => {
      console.log('📈 SPC update received:', data);
      // Handle update in your UI
    });

    // Machine alerts
    this.socket.on('machine-alert', (data) => {
      console.log('🚨 Machine alert received:', data);
      // Handle alert in your UI
    });
  }

  subscribeToMachines(machineNames) {
    if (!Array.isArray(machineNames)) {
      machineNames = [machineNames];
    }

    machineNames.forEach(machineName => {
      this.socket.emit('subscribe-machine', {
        deviceId: machineName
      });
      console.log(`📡 Subscribed to machine: ${machineName}`);
    });
  }

  unsubscribeFromMachine(machineName) {
    this.socket.emit('unsubscribe-machine', {
      deviceId: machineName
    });
  }

  getMachineStatus(machineName) {
    this.socket.emit('get-machine-status', {
      deviceId: machineName
    });
  }
}

// Usage
const wsManager = new WebSocketManager();
wsManager.connect();

// Subscribe to machines after fetching from API
fetchMachines().then(machines => {
  const machineNames = machines.map(m => m.name);
  wsManager.subscribeToMachines(machineNames);
});
```

---

## Testing Checklist

After implementing the fixes, verify:

- [ ] WebSocket connection stays stable without immediate disconnection
- [ ] `ping`/`pong` events are working
- [ ] `subscribe-machine` event is sent immediately after connection
- [ ] `realtime-update` events are received after subscription
- [ ] Page doesn't continuously reload
- [ ] Reconnection works when connection is lost
- [ ] No console errors related to WebSocket

---

## Additional Notes

1. **MQTT health check errors can be ignored** - This is a backend issue with Docker health checks and doesn't affect frontend functionality.

2. **Connection limit is 5 per IP** - If testing with multiple tabs, be aware of this limit.

3. **Use machine names, not IDs** - Always use the exact `machineName` from the database for subscriptions.

4. **Monitor connection duration** - The backend logs connection duration; anything above 0s indicates a stable connection.

---

## Backend WebSocket Events Reference

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe-machine` | `{ deviceId: string }` | Subscribe to realtime updates for a machine |
| `unsubscribe-machine` | `{ deviceId: string }` | Unsubscribe from machine updates |
| `get-machine-status` | `{ deviceId: string }` | Request current machine status |
| `ping` | None | Keep-alive ping |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `realtime-update` | RealtimeUpdateData | Machine realtime data update |
| `spc-update` | SPCUpdateData | SPC data update |
| `machine-alert` | AlertData | Machine alert/notification |
| `machine-status` | StatusData | Current machine status |
| `pong` | None | Response to ping |

---

**Need Help?**
- Backend API Docs: See `FRONTEND_INTEGRATION.md`
- WebSocket Gateway: `src/websocket/machine.gateway.ts`
- MQTT Processor: `src/mqtt-processor/mqtt-processor.service.ts`
