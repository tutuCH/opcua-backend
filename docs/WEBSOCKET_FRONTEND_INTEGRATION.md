# WebSocket Frontend Integration Guide

This document provides comprehensive guidance for frontend developers integrating with the OPC UA Dashboard WebSocket API.

## 🚀 Recent Updates (v2.0)

**Major Architecture Change - Hybrid Communication Pattern:**
- **WebSocket**: Now optimized for real-time streaming only (realtime-update, spc-update, machine-alert)
- **REST API**: New endpoints for historical data with pagination and streaming
- **Performance**: Eliminated large data transfers over WebSocket (no more 1000+ data points blocking connections)
- **Bulk Data**: Use new REST endpoints for historical data instead of WebSocket

## Connection Details

### WebSocket Endpoint
```
ws://localhost:3000/socket.io/
```

### Transport
- **Protocol**: Socket.IO WebSocket
- **CORS**: Enabled for all origins (`*`)
- **Transport**: WebSocket only (no polling fallback)

## Client-to-Server Events

### 1. Connection Lifecycle

#### Initial Connection
```javascript
const socket = io('ws://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to OPC UA Dashboard');
});

socket.on('connection', (data) => {
  // Server confirms connection
  console.log(data.message); // "Connected to OPC UA Dashboard"
});
```

### 2. Machine Subscription Management

#### Subscribe to Machine Data
```javascript
// Request payload
const subscribePayload = {
  deviceId: "MACHINE_001" // Required: Machine identifier
};

socket.emit('subscribe-machine', subscribePayload);

// Response
socket.on('subscription-confirmed', (data) => {
  console.log(`Subscribed to machine: ${data.deviceId}`);
});
```

#### Unsubscribe from Machine Data
```javascript
const unsubscribePayload = {
  deviceId: "MACHINE_001"
};

socket.emit('unsubscribe-machine', unsubscribePayload);

socket.on('unsubscription-confirmed', (data) => {
  console.log(`Unsubscribed from machine: ${data.deviceId}`);
});
```

### 3. Data Requests

#### Request Current Machine Status
```javascript
const statusRequest = {
  deviceId: "MACHINE_001"
};

socket.emit('get-machine-status', statusRequest);
```

#### ⚠️ Historical Data (DEPRECATED - Use REST API Instead)
```javascript
// DEPRECATED: This method sends large amounts of data over WebSocket
// Use the new REST API endpoints instead for better performance

const historyRequest = {
  deviceId: "MACHINE_001",
  timeRange: "-1h" // Optional: defaults to "-1h", supports InfluxDB time syntax
};

socket.emit('get-machine-history', historyRequest);
```

**🔄 NEW: Use REST API for Historical Data**
```javascript
// Recommended approach for historical data
const token = 'your-jwt-token';

// Paginated realtime history
const realtimeHistory = await fetch(`/api/machines/1/realtime-history?timeRange=-1h&limit=100&offset=0`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json());

// Paginated SPC history
const spcHistory = await fetch(`/api/machines/1/spc-history?timeRange=-1h&limit=50`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json());

// Current machine status
const machineStatus = await fetch(`/api/machines/1/status`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json());

// Streaming large datasets
const streamingData = await fetch(`/api/machines/1/history/stream?timeRange=-4h&dataType=realtime`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json());
```

#### Health Check
```javascript
socket.emit('ping');

socket.on('pong', (data) => {
  console.log('Server timestamp:', data.timestamp);
});
```

## Server-to-Client Events

### 1. Machine Status Data

#### Current Status Response
```javascript
socket.on('machine-status', (data) => {
  console.log('Machine Status:', data);
  /*
  {
    deviceId: "MACHINE_001",
    data: {
      // Cached machine status data (varies by implementation)
      lastUpdate: "2024-01-15T10:30:00Z",
      status: "running",
      // ... additional status fields
    },
    source: "cache" | "requested" // Indicates if from cache or direct request
  }
  */
});
```

### 2. Real-Time Data Streams

#### Real-Time Machine Data
```javascript
socket.on('realtime-update', (data) => {
  console.log('Realtime Update:', data);
  /*
  {
    deviceId: "MACHINE_001",
    data: {
      devId: "MACHINE_001",
      topic: "realtime",
      sendTime: "2024-01-15 10:30:00",
      sendStamp: 1642248600000,
      time: "2024-01-15 10:29:59",
      timestamp: 1642248599000,
      Data: {
        OT: 52.3,      // Oil Temperature (°C)
        ATST: 0,       // Auto Time Start
        OPM: 2,        // Operation Mode (1=Semi-auto, 2=Eye auto, 3=Time auto)
        STS: 2,        // Status (2=Production)
        T1: 221.5,     // Temperature Zone 1 (°C)
        T2: 220.8,     // Temperature Zone 2 (°C)
        T3: 222.1,     // Temperature Zone 3 (°C)
        T4: 219.7,     // Temperature Zone 4 (°C)
        T5: 221.9,     // Temperature Zone 5 (°C)
        T6: 220.4,     // Temperature Zone 6 (°C)
        T7: 222.3      // Temperature Zone 7 (°C)
      }
    },
    timestamp: "2024-01-15T10:30:00.000Z"
  }
  */
});
```

#### Statistical Process Control (SPC) Data
```javascript
socket.on('spc-update', (data) => {
  console.log('SPC Update:', data);
  /*
  {
    deviceId: "MACHINE_001",
    data: {
      devId: "MACHINE_001",
      topic: "spc",
      sendTime: "2024-01-15 10:30:00",
      sendStamp: 1642248600000,
      time: "2024-01-15 10:29:59",
      timestamp: 1642248599000,
      Data: {
        CYCN: "1234",           // Cycle Number
        ECYCT: "45.2",          // Effective Cycle Time (seconds)
        EISS: "2024-01-15T10:29:14.000Z", // Effective Injection Start Time
        EIVM: "152.3",          // Effective Injection Velocity Max (mm/s)
        EIPM: "78.5",           // Effective Injection Pressure Max (bar)
        ESIPT: "2.5",           // Effective Switch-over Injection Pressure Time (s)
        ESIPP: "87.2",          // Effective Switch-over Injection Pressure Position (%)
        ESIPS: "32.1",          // Effective Switch-over Injection Pressure Speed (mm/s)
        EIPT: "5.2",            // Effective Injection Pressure Time (s)
        EIPSE: "2024-01-15T10:29:19.000Z", // Effective Injection Pressure Start End
        EPLST: "4.1",           // Effective Plasticizing Time (s)
        EPLSSE: "2024-01-15T10:29:23.000Z", // Effective Plasticizing Start End
        EPLSPM: "118.7",        // Effective Plasticizing Pressure Max (bar)
        ET1: "221.5",           // Effective Temperature 1 (°C)
        ET2: "220.8",           // Effective Temperature 2 (°C)
        ET3: "222.1",           // Effective Temperature 3 (°C)
        ET4: "219.7",           // Effective Temperature 4 (°C)
        ET5: "221.9",           // Effective Temperature 5 (°C)
        ET6: "220.4",           // Effective Temperature 6 (°C)
        ET7: "222.3",           // Effective Temperature 7 (°C)
        ET8: "220.9",           // Effective Temperature 8 (°C)
        ET9: "221.2",           // Effective Temperature 9 (°C)
        ET10: "222.0"           // Effective Temperature 10 (°C)
      }
    },
    timestamp: "2024-01-15T10:30:00.000Z"
  }
  */
});
```

### 3. Historical Data

#### ⚠️ Machine History Response (DEPRECATED)
```javascript
// DEPRECATED: This event can send large amounts of data over WebSocket
// Use REST API endpoints instead for better performance
socket.on('machine-history', (data) => {
  console.log('Machine History:', data);
  /*
  {
    deviceId: "MACHINE_001",
    data: {
      realtime: [
        // Array of realtime data points (same structure as realtime-update.data)
      ],
      spc: [
        // Array of SPC data points (same structure as spc-update.data)
      ]
    },
    timeRange: "-1h"
  }
  */
});
```

#### 🔄 NEW: REST API Response Formats
```javascript
// Paginated realtime history response
{
  "data": [
    {
      "_time": "2025-01-15T10:30:00Z",
      "device_id": "MACHINE_001",
      "oil_temp": 52.3,
      "operate_mode": 2,
      "status": 2,
      "temp_1": 221.5,
      // ... additional fields
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 100,
    "offset": 0
  },
  "metadata": {
    "deviceId": "MACHINE_001",
    "timeRange": "-1h",
    "aggregate": "none"
  }
}

// Machine status response
{
  "deviceId": "MACHINE_001",
  "status": {
    "devId": "MACHINE_001",
    "Data": {
      "OT": 52.3,
      "STS": 2,
      "OPM": 2,
      // ... additional status fields
    },
    "lastUpdated": "2025-01-15T10:30:00Z"
  },
  "lastUpdated": "2025-01-15T10:30:00Z"
}
```

### 4. Alerts and Notifications

#### Machine Alerts
```javascript
socket.on('machine-alert', (data) => {
  console.log('Machine Alert:', data);
  /*
  {
    deviceId: "MACHINE_001",
    alert: {
      type: "warning" | "error" | "info",
      message: "Temperature threshold exceeded",
      severity: "high" | "medium" | "low",
      // Additional alert-specific fields
    },
    timestamp: "2024-01-15T10:30:00.000Z"
  }
  */
});
```

### 5. Error Handling

#### Error Responses
```javascript
socket.on('error', (error) => {
  console.error('WebSocket Error:', error);
  /*
  {
    message: "Error description",
    // Additional error context
  }
  */
});
```

## NEW REST API Endpoints

### Available Endpoints

| Endpoint | Method | Description | Query Parameters |
|----------|--------|-------------|------------------|
| `/machines/:id/realtime-history` | GET | Paginated realtime data | `timeRange`, `limit`, `offset`, `aggregate` |
| `/machines/:id/spc-history` | GET | Paginated SPC data | `timeRange`, `limit`, `offset`, `aggregate` |
| `/machines/:id/status` | GET | Current machine status | None |
| `/machines/:id/history/stream` | GET | Streaming large datasets | `timeRange`, `dataType` |

### Query Parameters

- **timeRange**: InfluxDB time syntax (e.g., `-1h`, `-30m`, `-1d`)
- **limit**: Number of records per page (default: 1000)
- **offset**: Starting record offset (default: 0)
- **aggregate**: Data aggregation level (`none`, `1m`, `5m`, `1h`)
- **dataType**: Type of data (`realtime`, `spc`, `both`)

## Complete Frontend Integration Example (Updated v2.0)

```javascript
import { io } from 'socket.io-client';

class MachineDataService {
  constructor() {
    this.socket = null;
    this.subscribedMachines = new Set();
    this.authToken = null; // JWT token for REST API calls
  }

  connect() {
    this.socket = io('ws://localhost:3000', {
      transports: ['websocket']
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to OPC UA Dashboard');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from OPC UA Dashboard');
      this.subscribedMachines.clear();
    });

    // Data event listeners
    this.socket.on('realtime-update', (data) => {
      this.handleRealtimeUpdate(data);
    });

    this.socket.on('spc-update', (data) => {
      this.handleSPCUpdate(data);
    });

    this.socket.on('machine-alert', (data) => {
      this.handleMachineAlert(data);
    });

    this.socket.on('machine-status', (data) => {
      this.handleMachineStatus(data);
    });

    this.socket.on('machine-history', (data) => {
      this.handleMachineHistory(data);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  subscribeToMachine(deviceId) {
    if (!this.subscribedMachines.has(deviceId)) {
      this.socket.emit('subscribe-machine', { deviceId });
      this.subscribedMachines.add(deviceId);
    }
  }

  unsubscribeFromMachine(deviceId) {
    if (this.subscribedMachines.has(deviceId)) {
      this.socket.emit('unsubscribe-machine', { deviceId });
      this.subscribedMachines.delete(deviceId);
    }
  }

  requestMachineStatus(deviceId) {
    this.socket.emit('get-machine-status', { deviceId });
  }

  // DEPRECATED: Use REST API methods instead
  requestMachineHistory(deviceId, timeRange = '-1h') {
    console.warn('DEPRECATED: Use getRealtimeHistory() or getSPCHistory() REST methods instead');
    this.socket.emit('get-machine-history', { deviceId, timeRange });
  }

  // NEW: REST API methods for historical data
  setAuthToken(token) {
    this.authToken = token;
  }

  async getRealtimeHistory(machineId, options = {}) {
    const params = new URLSearchParams({
      timeRange: options.timeRange || '-1h',
      limit: options.limit || '100',
      offset: options.offset || '0',
      aggregate: options.aggregate || 'none'
    });

    const response = await fetch(`/machines/${machineId}/realtime-history?${params}`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) throw new Error(`Failed to fetch realtime history: ${response.statusText}`);
    return await response.json();
  }

  async getSPCHistory(machineId, options = {}) {
    const params = new URLSearchParams({
      timeRange: options.timeRange || '-1h',
      limit: options.limit || '50',
      offset: options.offset || '0',
      aggregate: options.aggregate || 'none'
    });

    const response = await fetch(`/machines/${machineId}/spc-history?${params}`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) throw new Error(`Failed to fetch SPC history: ${response.statusText}`);
    return await response.json();
  }

  async getMachineStatusREST(machineId) {
    const response = await fetch(`/machines/${machineId}/status`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) throw new Error(`Failed to fetch machine status: ${response.statusText}`);
    return await response.json();
  }

  async streamHistoryData(machineId, options = {}) {
    const params = new URLSearchParams({
      timeRange: options.timeRange || '-4h',
      dataType: options.dataType || 'both'
    });

    const response = await fetch(`/machines/${machineId}/history/stream?${params}`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) throw new Error(`Failed to stream history data: ${response.statusText}`);
    return await response.json();
  }

  // Event handlers
  handleRealtimeUpdate(data) {
    // Update real-time dashboard components
    console.log(`Realtime data for ${data.deviceId}:`, data.data);
  }

  handleSPCUpdate(data) {
    // Update SPC charts and analysis
    console.log(`SPC data for ${data.deviceId}:`, data.data);
  }

  handleMachineAlert(data) {
    // Show notifications or alerts
    console.log(`Alert for ${data.deviceId}:`, data.alert);
  }

  handleMachineStatus(data) {
    // Update machine status displays
    console.log(`Status for ${data.deviceId}:`, data.data);
  }

  handleMachineHistory(data) {
    // Populate historical charts and data tables
    console.log(`History for ${data.deviceId}:`, data.data);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.subscribedMachines.clear();
    }
  }
}

// Usage (Updated v2.0)
const machineService = new MachineDataService();
machineService.connect();
machineService.setAuthToken('your-jwt-token');

// Subscribe to machines for real-time updates
machineService.subscribeToMachine('MACHINE_001');
machineService.subscribeToMachine('MACHINE_002');

// Request real-time status via WebSocket (for immediate status)
machineService.requestMachineStatus('MACHINE_001');

// NEW: Get historical data via REST API (recommended for bulk data)
try {
  // Get paginated realtime history
  const realtimeHistory = await machineService.getRealtimeHistory('1', {
    timeRange: '-2h',
    limit: '50',
    offset: '0'
  });

  // Get SPC data
  const spcHistory = await machineService.getSPCHistory('1', {
    timeRange: '-1h',
    limit: '20'
  });

  // Get current status via REST (alternative to WebSocket)
  const currentStatus = await machineService.getMachineStatusREST('1');

  // Stream large datasets efficiently
  const streamData = await machineService.streamHistoryData('1', {
    timeRange: '-24h',
    dataType: 'realtime'
  });

} catch (error) {
  console.error('Failed to fetch data:', error);
}
```

## Data Flow Architecture (Updated v2.0)

```
MQTT Broker → NestJS Backend → Redis Queue → Processing → InfluxDB Storage
                    ↓                              ↓
            WebSocket Gateway ← Redis Pub/Sub     REST API Controllers
            (Real-time only)                      (Historical data)
                    ↓                              ↓
              Frontend Client ←------------------→ Frontend Client
              (Live updates)                      (Bulk data)
```

### Communication Pattern

| Data Type | Channel | Use Case | Performance |
|-----------|---------|----------|-------------|
| **Real-time updates** | WebSocket | Live machine data, SPC events, alerts | ⚡ Instant streaming |
| **Historical data** | REST API | Charts, reports, analysis | 📊 Paginated & compressed |
| **Machine status** | Both | Current status (WebSocket for immediate, REST for on-demand) | 🔄 Flexible |
| **Bulk datasets** | REST API | Data export, large time ranges | 🗜️ Streaming & compressed |

## Best Practices

### 1. Connection Management
- Implement reconnection logic for production use
- Handle connection state in your application
- Clean up subscriptions on component unmount

### 2. Data Handling (Updated v2.0)
- **WebSocket**: Buffer real-time data to prevent UI blocking
- **REST API**: Use pagination for large datasets instead of loading all at once
- **Validation**: Implement data validation for incoming messages
- **Charts**: Use appropriate chart libraries for time-series data
- **Caching**: Cache REST API responses to reduce server load

### 3. Performance (Updated v2.0)
- **WebSocket**: Limit simultaneous machine subscriptions (recommended: 5-10 machines)
- **Real-time**: Implement data throttling for high-frequency updates
- **Historical**: Use REST API pagination instead of large WebSocket transfers
- **UI**: Use virtualization for large datasets in charts/tables
- **Compression**: REST API responses are automatically compressed (gzip)
- **Streaming**: Use streaming endpoints for datasets >1000 records

### 4. Error Handling (Updated v2.0)
- **WebSocket**: Always listen for 'error' events
- **REST API**: Implement proper HTTP error handling (401, 403, 404, 500)
- **Fallback**: WebSocket disconnection → Switch to REST API polling temporarily
- **Retry**: Implement exponential backoff for failed REST requests
- **Logging**: Log errors for debugging purposes
- **User Experience**: Show loading states and error messages appropriately

## Environment Configuration

### Development
```javascript
const socket = io('ws://localhost:3000');
```

### Production
```javascript
const socket = io('wss://your-production-domain.com');
```

## Migration Guide (v1.0 → v2.0)

### Breaking Changes
1. **WebSocket no longer sends bulk historical data automatically**
2. **`get-machine-history` WebSocket event is deprecated**
3. **REST API authentication required via JWT tokens**

### Migration Steps

#### 1. Replace WebSocket Historical Data Calls
```javascript
// OLD (v1.0) - DEPRECATED
socket.emit('get-machine-history', { deviceId: 'MACHINE_001', timeRange: '-2h' });
socket.on('machine-history', (data) => {
  // Handle large data over WebSocket
});

// NEW (v2.0) - RECOMMENDED
const token = await getAuthToken();
const response = await fetch('/machines/1/realtime-history?timeRange=-2h&limit=100', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
```

#### 2. Add JWT Authentication
```javascript
// Login and get token
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password' })
});
const { access_token } = await loginResponse.json();

// Use token for REST API calls
machineService.setAuthToken(access_token);
```

#### 3. Update Data Loading Logic
```javascript
// OLD: Everything via WebSocket
class Dashboard {
  loadMachineData(deviceId) {
    socket.emit('subscribe-machine', { deviceId });
    socket.emit('get-machine-history', { deviceId, timeRange: '-1h' });
  }
}

// NEW: Hybrid approach
class Dashboard {
  async loadMachineData(deviceId) {
    // Real-time updates via WebSocket
    socket.emit('subscribe-machine', { deviceId });

    // Historical data via REST API
    const history = await machineService.getRealtimeHistory(deviceId, {
      timeRange: '-1h',
      limit: 100
    });

    this.renderChart(history.data);
  }
}
```

## Security Considerations (Updated v2.0)

- **CORS**: The current implementation allows all CORS origins (`*`)
- **Authentication**: JWT tokens required for REST API endpoints
- **WebSocket**: No authentication required (configure in production)
- **Rate Limiting**: Consider implementing for both WebSocket and REST API
- **Data Validation**: Validate all incoming data on the frontend
- **Token Storage**: Securely store JWT tokens (localStorage/sessionStorage considerations)

## Troubleshooting

### Common Issues (Updated v2.0)

1. **WebSocket Connection Failed**: Check if backend server is running on port 3000
2. **No Real-time Data**: Ensure proper machine subscription via `subscribe-machine`
3. **Historical Data 401/403**: Check JWT token validity and authentication
4. **Large Data Loading Slowly**: Use REST API pagination instead of loading all at once
5. **High CPU Usage**: Implement data throttling for WebSocket real-time updates
6. **Memory Leaks**: Clean up event listeners and subscriptions
7. **REST API CORS Issues**: Ensure frontend origin is in CORS whitelist

### New v2.0 Specific Issues

1. **"machine-history not received"**: Use new REST API endpoints instead
2. **"Too much data over WebSocket"**: Switch to REST API for historical data
3. **Authentication errors**: Ensure JWT token is included in REST requests
4. **Slow historical data**: Use streaming endpoint for large datasets

### Debug Mode
```javascript
const socket = io('ws://localhost:3000', {
  forceNew: true,
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Socket ID:', socket.id);
});
```