# Frontend Integration Guide

This document provides comprehensive information for integrating with the OPC UA Dashboard backend API and WebSocket services.

## Table of Contents

- [Authentication](#authentication)
- [REST API Endpoints](#rest-api-endpoints)
- [WebSocket Integration](#websocket-integration)
- [Data Models](#data-models)
- [Integration Examples](#integration-examples)

## Authentication

The API uses JWT (JSON Web Tokens) for authentication with AWS Cognito integration.

### Base URL
```
http://localhost:3000  # Development
https://your-production-domain.com  # Production
```

### Authentication Endpoints

#### POST /auth/login
Authenticate user and receive JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "email": "user@example.com",
    "username": "john_doe"
  }
}
```

#### POST /auth/sign-up
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "john_doe"
}
```

#### GET /auth/profile
Get current user profile (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

#### POST /auth/forget-password
Request password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/reset-password/:token
Reset password with token.

**Request:**
```json
{
  "password": "newpassword123"
}
```

## REST API Endpoints

All protected endpoints require the `Authorization: Bearer <token>` header.

### Factories API

#### GET /factories
Get all factories for the authenticated user.

**Response:**
```json
[
  {
    "factoryId": 1,
    "factoryName": "Production Line A",
    "factoryIndex": "1",
    "width": "100",
    "height": "50",
    "createdAt": "2024-01-15T10:00:00Z",
    "machines": [...]
  }
]
```

#### POST /factories
Create a new factory.

**Request:**
```json
{
  "factoryName": "New Factory",
  "factoryIndex": 1,
  "width": 100,
  "height": 50
}
```

#### GET /factories/:id
Get a specific factory by ID.

#### PATCH /factories/:factoryId
Update factory information.

#### DELETE /factories/:id
Delete a factory.

#### GET /factories/user/factories
Get factories for current user (alternative endpoint).

### Machines API

#### GET /machines/factories-machines
Get all factories and their machines for the authenticated user.

**Response:**
```json
[
  {
    "factoryId": 1,
    "factoryName": "Production Line A",
    "machines": [
      {
        "machineId": 1,
        "machineName": "Injection Molding #1",
        "machineIpAddress": "192.168.1.100",
        "machineIndex": "001",
        "status": "running",
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ]
  }
]
```

#### POST /machines
Register a new machine.

**Request:**
```json
{
  "machineName": "New Machine",
  "machineIpAddress": "192.168.1.101",
  "machineIndex": "002",
  "factoryId": 1,
  "factoryIndex": 1,
  "status": "offline"
}
```

#### GET /machines/:id
Get machine details by ID.

#### PATCH /machines/:id
Update machine information.

#### POST /machines/update-index
Update machine index.

**Request:**
```json
{
  "machineId": 1,
  "newIndex": "003"
}
```

#### DELETE /machines/:id
Delete a machine.

### User API

#### GET /user
Get user information.

#### PATCH /user
Update user profile.

### Subscription API

#### GET /subscription/billing
Get user subscription information.

#### POST /subscription/create-payment-intent
Create Stripe payment intent.

#### POST /subscription/webhook
Stripe webhook endpoint (internal use).

### Debug API (Development Only)

#### GET /debug/redis/queue-lengths
Get MQTT queue lengths.

#### GET /debug/processor/status
Get MQTT processor status.

## WebSocket Integration

### Connection

Connect to the WebSocket server:

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  transports: ['websocket'],
  autoConnect: true
});
```

### Connection Events

#### connection
Emitted when client connects successfully.

```javascript
socket.on('connection', (data) => {
  console.log('Connected:', data);
  // {
  //   message: 'Connected to OPC UA Dashboard',
  //   serverTime: '2024-01-15T10:00:00.000Z',
  //   clientId: 'socket_id_123',
  //   connectionsFromIP: 1,
  //   maxConnections: 5
  // }
});
```

#### error
Emitted when connection errors occur.

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### Machine Subscription System

#### subscribe-machine
Subscribe to real-time updates for a specific machine.

```javascript
socket.emit('subscribe-machine', { deviceId: 'machine-001' });

socket.on('subscription-confirmed', (data) => {
  console.log('Subscribed to machine:', data.deviceId);
});
```

#### unsubscribe-machine
Unsubscribe from machine updates.

```javascript
socket.emit('unsubscribe-machine', { deviceId: 'machine-001' });

socket.on('unsubscription-confirmed', (data) => {
  console.log('Unsubscribed from machine:', data.deviceId);
});
```

### Real-Time Data Events

#### realtime-update
Emitted when new real-time data is available.

```javascript
socket.on('realtime-update', (data) => {
  console.log('Real-time data:', data);
  // Expected response format:
  // {
  //   deviceId: 'postgres machine 1',
  //   data: {
  //     devId: 'postgres machine 1',
  //     topic: 'realtime',
  //     sendTime: '2025-09-13 14:41:07',
  //     sendStamp: 1726238467000,
  //     time: '2025-09-13 14:41:06',
  //     timestamp: 1726238466000,
  //     Data: {
  //       OT: 52.3,      // Oil Temperature (°C)
  //       ATST: 0,       // Auto Start (0=off, 1=on)
  //       OPM: 2,        // Operation Mode (1=Semi-auto, 2=Eye auto, 3=Time auto)
  //       STS: 2,        // Status (2=Production)
  //       T1: 221.5,     // Temperature Zone 1 (°C)
  //       T2: 220.8,     // Temperature Zone 2 (°C)
  //       T3: 222.1,     // Temperature Zone 3 (°C)
  //       T4: 219.7,     // Temperature Zone 4 (°C)
  //       T5: 221.9,     // Temperature Zone 5 (°C)
  //       T6: 220.4,     // Temperature Zone 6 (°C)
  //       T7: 222.3      // Temperature Zone 7 (°C)
  //     }
  //   },
  //   timestamp: '2025-09-13T14:41:07.000Z'
  // }
});
```

#### spc-update
Emitted when new SPC (Statistical Process Control) data is available.

```javascript
socket.on('spc-update', (data) => {
  console.log('SPC data:', data);
  // Expected response format:
  // {
  //   deviceId: 'postgres machine 1',
  //   data: {
  //     devId: 'postgres machine 1',
  //     topic: 'spc',
  //     sendTime: '2025-09-13 14:41:02',
  //     sendStamp: 1726238462000,
  //     time: '2025-09-13 14:41:01',
  //     timestamp: 1726238461000,
  //     Data: {
  //       CYCN: '6026',           // Cycle Number
  //       ECYCT: '45.2',          // Effective Cycle Time (seconds)
  //       EISS: '2025-09-13T14:40:16.000Z', // Effective Injection Start Time
  //       EIVM: '152.3',          // Effective Injection Velocity Max (mm/s)
  //       EIPM: '78.5',           // Effective Injection Pressure Max (bar)
  //       ESIPT: '2.5',           // Effective Switch-over Injection Pressure Time (s)
  //       ESIPP: '87.2',          // Effective Switch-over Injection Pressure Position (%)
  //       ESIPS: '32.1',          // Effective Switch-over Injection Pressure Speed (mm/s)
  //       EIPT: '5.2',            // Effective Injection Pressure Time (s)
  //       EIPSE: '2025-09-13T14:40:22.000Z', // Effective Injection Pressure Start End
  //       EPLST: '4.1',           // Effective Plasticizing Time (s)
  //       EPLSSE: '2025-09-13T14:40:26.000Z', // Effective Plasticizing Start End
  //       EPLSPM: '118.7',        // Effective Plasticizing Pressure Max (bar)
  //       ET1: '221.5',           // Effective Temperature 1 (°C)
  //       ET2: '220.8',           // Effective Temperature 2 (°C)
  //       ET3: '222.1',           // Effective Temperature 3 (°C)
  //       ET4: '219.7',           // Effective Temperature 4 (°C)
  //       ET5: '221.9',           // Effective Temperature 5 (°C)
  //       ET6: '220.4',           // Effective Temperature 6 (°C)
  //       ET7: '222.3',           // Effective Temperature 7 (°C)
  //       ET8: '220.9',           // Effective Temperature 8 (°C)
  //       ET9: '221.2',           // Effective Temperature 9 (°C)
  //       ET10: '222.0'           // Effective Temperature 10 (°C)
  //     }
  //   },
  //   timestamp: '2025-09-13T14:41:02.000Z'
  // }
});
```

#### machine-alert
Emitted when machine alerts occur.

```javascript
socket.on('machine-alert', (data) => {
  console.log('Machine alert:', data);
  // {
  //   deviceId: 'machine-001',
  //   alert: {
  //     level: 'warning',
  //     message: 'Temperature threshold exceeded',
  //     code: 'TEMP_HIGH'
  //   },
  //   timestamp: '2024-01-15T10:00:00.000Z'
  // }
});
```

### Data Request Events

#### get-machine-status
Request current machine status.

```javascript
socket.emit('get-machine-status', { deviceId: 'machine-001' });

socket.on('machine-status', (data) => {
  console.log('Machine status:', data);
  // {
  //   deviceId: 'machine-001',
  //   data: { ... current status ... },
  //   source: 'requested'
  // }
});
```

#### get-machine-history
Request historical data for a machine.

```javascript
socket.emit('get-machine-history', {
  deviceId: 'machine-001',
  timeRange: '-1h'  // Options: -5m, -1h, -6h, -24h
});

socket.on('machine-history', (data) => {
  console.log('Machine history:', data);
  // {
  //   deviceId: 'machine-001',
  //   data: {
  //     realtime: [...],
  //     spc: [...]
  //   },
  //   timeRange: '-1h'
  // }
});
```

### Health Check

#### ping/pong
Check connection health.

```javascript
socket.emit('ping');

socket.on('pong', (data) => {
  console.log('Pong received:', data.timestamp);
});
```

## Data Models

### User Entity
```typescript
interface User {
  userId: number;
  username: string;
  email: string;
  createdAt: Date;
}
```

### Factory Entity
```typescript
interface Factory {
  factoryId: number;
  factoryName: string;
  factoryIndex: string;
  width: string;
  height: string;
  createdAt: Date;
  machines: Machine[];
}
```

### Machine Entity
```typescript
interface Machine {
  machineId: number;
  machineName: string;
  machineIpAddress: string;
  machineIndex: string;
  status: string;
  createdAt: Date;
  factory: Factory;
  user: User;
}
```

### Real-Time Data Structure
```typescript
interface RealtimeData {
  devId: string;
  topic: string;
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    OT: number;    // Oil Temperature
    ATST: number;  // Auto Start
    OPM: number;   // Operation Mode
    STS: number;   // Status
    T1: number;    // Temperature 1
    T2: number;    // Temperature 2
    T3: number;    // Temperature 3
    T4: number;    // Temperature 4
    T5: number;    // Temperature 5
    T6: number;    // Temperature 6
    T7: number;    // Temperature 7
  };
}
```

### SPC Data Structure
```typescript
interface SPCData {
  devId: string;
  topic: string;
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    CYCN: string;    // Cycle Number
    ECYCT: string;   // Cycle Time
    EISS: string;    // Injection Start Signal
    EIVM: string;    // Injection Velocity Max
    EIPM: string;    // Injection Pressure Max
    ESIPT: string;   // Switch Pack Time
    ESIPP?: string;  // Switch Pack Pressure (optional)
    ESIPS?: string;  // Switch Pack Position (optional)
    EIPT?: string;   // Injection Time (optional)
    EIPSE?: string;  // Injection Position End (optional)
    EPLST?: string;  // Plasticizing Time (optional)
    EPLSSE?: string; // Plasticizing Screw End (optional)
    EPLSPM?: string; // Plasticizing Pressure Max (optional)
    ET1: string;     // Temperature 1
    ET2: string;     // Temperature 2
    ET3: string;     // Temperature 3
    ET4?: string;    // Temperature 4 (optional)
    ET5?: string;    // Temperature 5 (optional)
    ET6?: string;    // Temperature 6 (optional)
    ET7?: string;    // Temperature 7 (optional)
    ET8?: string;    // Temperature 8 (optional)
    ET9?: string;    // Temperature 9 (optional)
    ET10?: string;   // Temperature 10 (optional)
  };
}
```

## Integration Examples

### React/TypeScript Example

```typescript
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface MachineData {
  deviceId: string;
  data: any;
  timestamp: string;
}

const MachineMonitor: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeData, setRealtimeData] = useState<MachineData | null>(null);
  const [spcData, setSPCData] = useState<MachineData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io('ws://localhost:3000', {
      transports: ['websocket'],
      autoConnect: true
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket server');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket server');
    });

    // Data event handlers
    socketInstance.on('realtime-update', (data: MachineData) => {
      setRealtimeData(data);
    });

    socketInstance.on('spc-update', (data: MachineData) => {
      setSPCData(data);
    });

    socketInstance.on('machine-alert', (data: any) => {
      console.warn('Machine Alert:', data);
    });

    // Error handling
    socketInstance.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    setSocket(socketInstance);

    // Cleanup on component unmount
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const subscribeToMachine = (deviceId: string) => {
    if (socket && isConnected) {
      socket.emit('subscribe-machine', { deviceId });
    }
  };

  const unsubscribeFromMachine = (deviceId: string) => {
    if (socket && isConnected) {
      socket.emit('unsubscribe-machine', { deviceId });
    }
  };

  return (
    <div>
      <h2>Machine Monitor</h2>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>

      <button onClick={() => subscribeToMachine('machine-001')}>
        Subscribe to Machine 001
      </button>

      {realtimeData && (
        <div>
          <h3>Real-time Data</h3>
          <p>Device: {realtimeData.deviceId}</p>
          <p>Oil Temperature: {realtimeData.data.oil_temp}°C</p>
          <p>Status: {realtimeData.data.status}</p>
        </div>
      )}

      {spcData && (
        <div>
          <h3>SPC Data</h3>
          <p>Device: {spcData.deviceId}</p>
          <p>Cycle Number: {spcData.data.cycle_number}</p>
          <p>Cycle Time: {spcData.data.cycle_time}s</p>
        </div>
      )}
    </div>
  );
};

export default MachineMonitor;
```

### API Client Example

```typescript
class OPCUADashboardAPI {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL;
  }

  // Set authentication token
  setToken(token: string) {
    this.token = token;
  }

  // Get headers with authentication
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Authentication methods
  async login(email: string, password: string) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    this.setToken(data.access_token);
    return data;
  }

  async signUp(email: string, password: string, username: string) {
    const response = await fetch(`${this.baseURL}/auth/sign-up`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password, username }),
    });

    if (!response.ok) {
      throw new Error('Sign up failed');
    }

    return response.json();
  }

  // Factory methods
  async getFactories() {
    const response = await fetch(`${this.baseURL}/factories`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch factories');
    }

    return response.json();
  }

  async createFactory(factoryData: any) {
    const response = await fetch(`${this.baseURL}/factories`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(factoryData),
    });

    if (!response.ok) {
      throw new Error('Failed to create factory');
    }

    return response.json();
  }

  // Machine methods
  async getFactoriesAndMachines() {
    const response = await fetch(`${this.baseURL}/machines/factories-machines`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch factories and machines');
    }

    return response.json();
  }

  async createMachine(machineData: any) {
    const response = await fetch(`${this.baseURL}/machines`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(machineData),
    });

    if (!response.ok) {
      throw new Error('Failed to create machine');
    }

    return response.json();
  }
}

// Usage example
const api = new OPCUADashboardAPI();

// Login and use API
api.login('user@example.com', 'password123')
  .then(() => api.getFactoriesAndMachines())
  .then(data => console.log('Factories and machines:', data))
  .catch(error => console.error('API error:', error));
```

## Error Handling

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### WebSocket Error Handling
```javascript
socket.on('error', (error) => {
  switch (error.code) {
    case 'CONNECTION_LIMIT_EXCEEDED':
      console.error('Too many connections from this IP');
      break;
    default:
      console.error('Socket error:', error.message);
  }
});

// Reconnection logic
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, reconnect manually
    socket.connect();
  }
  // Client-side disconnects will auto-reconnect
});
```

## CORS Configuration

The server is configured to accept requests from multiple origins:
- `http://localhost:3000`
- `http://localhost:3001`
- `https://*.vercel.app`
- `https://*.netlify.app`

For production deployments, ensure your domain is added to the CORS configuration.

## Rate Limiting

- WebSocket connections are limited to 5 per IP address
- Connection timeout is set to 5 minutes of inactivity
- MQTT message processing has built-in backpressure handling

## Testing WebSocket Connections

### Using curl (Limited WebSocket Support)

While curl has limited WebSocket support, you can test the HTTP upgrade request:

```bash
# Test WebSocket connection upgrade
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     http://localhost:3000/socket.io/?EIO=4&transport=websocket
```

### Postman WebSocket Testing

**Step 1: Create WebSocket Request**
1. In Postman, create a new WebSocket request
2. URL: `ws://localhost:3000/socket.io/?EIO=4&transport=websocket`
3. Connect to establish the WebSocket connection

**Step 2: Send Socket.IO Messages**

Socket.IO uses a specific message format. Send these messages after connecting:

**Connect to Socket.IO:**
```
40
```

**Subscribe to Machine (use your actual machine name):**
```
42["subscribe-machine",{"deviceId":"postgres machine 1"}]
```

**Request Machine Status:**
```
42["get-machine-status",{"deviceId":"postgres machine 1"}]
```

**Request Machine History:**
```
42["get-machine-history",{"deviceId":"postgres machine 1","timeRange":"-1h"}]
```

**Ping Health Check:**
```
42["ping"]
```

**Unsubscribe from Machine:**
```
42["unsubscribe-machine",{"deviceId":"machine-001"}]
```

### Better WebSocket Testing Tools

#### 1. WebSocket King (Browser Extension)
```
URL: ws://localhost:3000/socket.io/?EIO=4&transport=websocket
```

#### 2. wscat (Node.js CLI tool)
```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket"

# After connection, send:
40
42["subscribe-machine",{"deviceId":"machine-001"}]
```

#### 3. Socket.IO Client Tester (JavaScript)
```javascript
// Save as test-websocket.js and run with node
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✓ Connected to server');

  // Test machine subscription
  socket.emit('subscribe-machine', { deviceId: 'machine-001' });
});

socket.on('subscription-confirmed', (data) => {
  console.log('✓ Subscription confirmed:', data);

  // Request machine status
  socket.emit('get-machine-status', { deviceId: 'machine-001' });
});

socket.on('machine-status', (data) => {
  console.log('✓ Machine status received:', data);
});

socket.on('realtime-update', (data) => {
  console.log('✓ Real-time update:', data);
});

socket.on('spc-update', (data) => {
  console.log('✓ SPC update:', data);
});

socket.on('error', (error) => {
  console.error('✗ Error:', error);
});

// Run: node test-websocket.js
```

### REST API Testing with curl

#### Authentication
```bash
# Login and get JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Save the access_token from response for subsequent requests
export TOKEN="your_jwt_token_here"
```

#### Factory Management
```bash
# Get all factories
curl -X GET http://localhost:3000/factories \
  -H "Authorization: Bearer $TOKEN"

# Create factory
curl -X POST http://localhost:3000/factories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factoryName": "Test Factory",
    "factoryIndex": 1,
    "width": 100,
    "height": 50
  }'
```

#### Machine Management
```bash
# Get factories and machines
curl -X GET http://localhost:3000/machines/factories-machines \
  -H "Authorization: Bearer $TOKEN"

# Create machine
curl -X POST http://localhost:3000/machines \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "machineName": "Test Machine",
    "machineIpAddress": "192.168.1.100",
    "machineIndex": "001",
    "factoryId": 1,
    "factoryIndex": 1,
    "status": "offline"
  }'
```

#### Debug Endpoints (Development Only)
```bash
# Check MQTT queue lengths
curl -X GET http://localhost:3000/debug/redis/queue-lengths

# Check processor status
curl -X GET http://localhost:3000/debug/processor/status

# Process single realtime message
curl -X GET http://localhost:3000/debug/process/single-realtime

# Process single SPC message
curl -X GET http://localhost:3000/debug/process/single-spc

# Test InfluxDB connection
curl -X GET http://localhost:3000/debug/influxdb/test-connection
```

### Testing Your Mock Data Setup

Since you're seeing logs like:
```
[Nest] 23036  - 09/13/2025, 2:40:52 PM   DEBUG [MockDataService] Generated realtime data for postgres machine 1
[Nest] 23036  - 09/13/2025, 2:41:02 PM   DEBUG [MockDataService] Generated SPC data for postgres machine 1, cycle 6026
```

Here's how to test and verify the WebSocket data is being sent to the frontend:

#### Quick WebSocket Test with wscat
```bash
# Install wscat if you haven't
npm install -g wscat

# Connect to your WebSocket server
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket"

# After connecting, send these commands:
40
42["subscribe-machine",{"deviceId":"postgres machine 1"}]

# You should now see real-time data every ~5 seconds and SPC data every ~30-60 seconds
```

#### Expected WebSocket Responses

After subscribing to "postgres machine 1", you should receive:

**1. Subscription Confirmation:**
```json
42["subscription-confirmed",{"deviceId":"postgres machine 1"}]
```

**2. Real-time Updates (every 5 seconds):**
```json
42["realtime-update",{
  "deviceId":"postgres machine 1",
  "data":{
    "devId":"postgres machine 1",
    "topic":"realtime",
    "sendTime":"2025-09-13 14:41:07",
    "sendStamp":1726238467000,
    "time":"2025-09-13 14:41:06",
    "timestamp":1726238466000,
    "Data":{
      "OT":52.3,
      "ATST":0,
      "OPM":2,
      "STS":2,
      "T1":221.5,
      "T2":220.8,
      "T3":222.1,
      "T4":219.7,
      "T5":221.9,
      "T6":220.4,
      "T7":222.3
    }
  },
  "timestamp":"2025-09-13T14:41:07.000Z"
}]
```

**3. SPC Updates (every 30-60 seconds):**
```json
42["spc-update",{
  "deviceId":"postgres machine 1",
  "data":{
    "devId":"postgres machine 1",
    "topic":"spc",
    "sendTime":"2025-09-13 14:41:02",
    "sendStamp":1726238462000,
    "time":"2025-09-13 14:41:01",
    "timestamp":1726238461000,
    "Data":{
      "CYCN":"6026",
      "ECYCT":"45.2",
      "EISS":"2025-09-13T14:40:16.000Z",
      "EIVM":"152.3",
      "EIPM":"78.5",
      "ESIPT":"2.5",
      "ESIPP":"87.2",
      "ESIPS":"32.1",
      "EIPT":"5.2",
      "EIPSE":"2025-09-13T14:40:22.000Z",
      "EPLST":"4.1",
      "EPLSSE":"2025-09-13T14:40:26.000Z",
      "EPLSPM":"118.7",
      "ET1":"221.5",
      "ET2":"220.8",
      "ET3":"222.1",
      "ET4":"219.7",
      "ET5":"221.9",
      "ET6":"220.4",
      "ET7":"222.3",
      "ET8":"220.9",
      "ET9":"221.2",
      "ET10":"222.0"
    }
  },
  "timestamp":"2025-09-13T14:41:02.000Z"
}]
```

#### Debugging Steps

1. **Check if WebSocket Gateway is receiving data:**
   ```bash
   # Look for these log messages in your console:
   # [MachineGateway] Broadcasted realtime update for device postgres machine 1
   # [MachineGateway] Broadcasted SPC update for device postgres machine 1
   ```

2. **Check Redis queues:**
   ```bash
   curl -X GET http://localhost:3000/debug/redis/queue-lengths
   # Should show queue lengths, ideally should be low if processing is working
   ```

3. **Check MQTT processor status:**
   ```bash
   curl -X GET http://localhost:3000/debug/processor/status
   # Should show connected: true and processing: true
   ```

4. **Verify machine exists in database:**
   Make sure you have a machine named "postgres machine 1" in your PostgreSQL database.

#### Simple HTML Test Page

Create a test file to quickly verify WebSocket functionality:

```html
<!DOCTYPE html>
<html>
<head>
    <title>OPC UA WebSocket Test</title>
    <script src="https://cdn.socket.io/4.7.1/socket.io.min.js"></script>
</head>
<body>
    <h1>OPC UA WebSocket Test</h1>
    <div id="status">Disconnected</div>
    <div id="data"></div>

    <script>
        const socket = io('ws://localhost:3000', {
            transports: ['websocket']
        });

        const statusDiv = document.getElementById('status');
        const dataDiv = document.getElementById('data');

        socket.on('connect', () => {
            statusDiv.innerHTML = 'Connected';
            console.log('Connected to server');

            // Subscribe to your machine
            socket.emit('subscribe-machine', { deviceId: 'postgres machine 1' });
        });

        socket.on('subscription-confirmed', (data) => {
            console.log('Subscription confirmed:', data);
            statusDiv.innerHTML = `Connected & Subscribed to ${data.deviceId}`;
        });

        socket.on('realtime-update', (data) => {
            console.log('Realtime data:', data);
            dataDiv.innerHTML = `<h3>Real-time Data</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
        });

        socket.on('spc-update', (data) => {
            console.log('SPC data:', data);
            dataDiv.innerHTML += `<h3>SPC Data</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            statusDiv.innerHTML = 'Error: ' + error.message;
        });

        socket.on('disconnect', () => {
            statusDiv.innerHTML = 'Disconnected';
        });
    </script>
</body>
</html>
```

### Complete Testing Script

Create a bash script to test the entire flow:

```bash
#!/bin/bash
# save as test-api.sh

BASE_URL="http://localhost:3000"

echo "🔐 Testing Authentication..."
# Login
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:20}..."

echo -e "\n🏭 Testing Factories..."
# Get factories
FACTORIES=$(curl -s -X GET $BASE_URL/factories \
  -H "Authorization: Bearer $TOKEN")
echo "Factories: $FACTORIES"

echo -e "\n🤖 Testing Machines..."
# Get machines
MACHINES=$(curl -s -X GET $BASE_URL/machines/factories-machines \
  -H "Authorization: Bearer $TOKEN")
echo "Machines: $MACHINES"

echo -e "\n📊 Testing Debug Endpoints..."
# Queue lengths
QUEUES=$(curl -s -X GET $BASE_URL/debug/redis/queue-lengths)
echo "Queue lengths: $QUEUES"

# Processor status
STATUS=$(curl -s -X GET $BASE_URL/debug/processor/status)
echo "Processor status: $STATUS"

echo -e "\n✅ API testing complete"
```

Make it executable and run:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Development Tools

### Debug Endpoints (Development Only)
- `GET /debug/redis/queue-lengths` - Check message queue status
- `GET /debug/processor/status` - Check MQTT processor status
- `GET /debug/process/single-realtime` - Process one realtime message
- `GET /debug/process/single-spc` - Process one SPC message

These endpoints are marked as `@Public()` and should be removed in production.