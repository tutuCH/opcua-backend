# WebSocket Frontend Integration Guide

This document provides comprehensive guidance for frontend developers integrating with the OPC UA Dashboard WebSocket API.

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

#### Request Machine Historical Data
```javascript
const historyRequest = {
  deviceId: "MACHINE_001",
  timeRange: "-1h" // Optional: defaults to "-1h", supports InfluxDB time syntax
};

socket.emit('get-machine-history', historyRequest);
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

#### Machine History Response
```javascript
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

## Complete Frontend Integration Example

```javascript
import { io } from 'socket.io-client';

class MachineDataService {
  constructor() {
    this.socket = null;
    this.subscribedMachines = new Set();
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

  requestMachineHistory(deviceId, timeRange = '-1h') {
    this.socket.emit('get-machine-history', { deviceId, timeRange });
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

// Usage
const machineService = new MachineDataService();
machineService.connect();

// Subscribe to machines
machineService.subscribeToMachine('MACHINE_001');
machineService.subscribeToMachine('MACHINE_002');

// Request data
machineService.requestMachineStatus('MACHINE_001');
machineService.requestMachineHistory('MACHINE_001', '-2h');
```

## Data Flow Architecture

```
MQTT Broker → NestJS Backend → Redis Queue → Processing → InfluxDB Storage
                    ↓
            WebSocket Gateway ← Redis Pub/Sub ← Message Processor
                    ↓
              Frontend Client
```

## Best Practices

### 1. Connection Management
- Implement reconnection logic for production use
- Handle connection state in your application
- Clean up subscriptions on component unmount

### 2. Data Handling
- Buffer real-time data to prevent UI blocking
- Implement data validation for incoming messages
- Use appropriate chart libraries for time-series data

### 3. Performance
- Limit simultaneous machine subscriptions
- Implement data throttling for high-frequency updates
- Use virtualization for large datasets

### 4. Error Handling
- Always listen for 'error' events
- Implement fallback mechanisms for connectivity issues
- Log errors for debugging purposes

## Environment Configuration

### Development
```javascript
const socket = io('ws://localhost:3000');
```

### Production
```javascript
const socket = io('wss://your-production-domain.com');
```

## Security Considerations

- The current implementation allows all CORS origins (`*`)
- Authentication may be required in production
- Consider rate limiting for WebSocket connections
- Validate all incoming data on the frontend

## Troubleshooting

### Common Issues

1. **Connection Failed**: Check if backend server is running on port 3000
2. **No Data Received**: Ensure proper machine subscription
3. **High CPU Usage**: Implement data throttling and buffering
4. **Memory Leaks**: Clean up event listeners and subscriptions

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