# Frontend Integration Guide

This document provides comprehensive information for integrating with the OPC UA Dashboard backend API and WebSocket services.

## Table of Contents

- [Authentication](#authentication)
- [REST API Endpoints](#rest-api-endpoints)
  - [Authentication API](#authentication-api)
  - [Factories API](#factories-api)
  - [Machines API](#machines-api)
  - [Historical Data API](#historical-data-api)
  - [User API](#user-api)
  - [Subscription API](#subscription-api)
  - [MQTT Connection API](#mqtt-connection-api)
  - [Health Check API](#health-check-api)
  - [Debug API](#debug-api-development-only)
- [WebSocket Integration](#websocket-integration)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)

## Authentication

The API uses JWT (JSON Web Tokens) for authentication with AWS Cognito integration.

### Base URL
```
http://localhost:3000  # Development
https://your-production-domain.com  # Production
```

### Authentication Flow

1. Register a new account or sign in with existing credentials
2. Receive a JWT access token in the response
3. Include the token in the `Authorization` header for all subsequent requests
4. Token format: `Authorization: Bearer <jwt_token>`

---

## REST API Endpoints

All protected endpoints require the `Authorization: Bearer <token>` header unless marked as `@Public()`.

### Authentication API

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
    "username": "john_doe",
    "accessLevel": "user",
    "createdAt": "2024-01-15T10:00:00Z"
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

**Response:**
```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "userId": 1
}
```

#### GET /auth/verify-email
Verify user email with token.

**Query Parameters:**
- `token` (string, required) - Email verification token

**Response:**
```json
{
  "message": "Email verified successfully",
  "verified": true
}
```

#### GET /auth/profile
Get current user profile (requires authentication).

**Response:**
```json
{
  "userId": 1,
  "email": "user@example.com",
  "username": "john_doe",
  "accessLevel": "user",
  "stripeCustomerId": "cus_xxxxx",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### POST /auth/forget-password
Request password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "Password reset email sent successfully"
}
```

#### POST /auth/reset-password/:token
Reset password with token.

**URL Parameters:**
- `token` (string) - Password reset token

**Request:**
```json
{
  "password": "newpassword123"
}
```

**Response:**
```json
{
  "message": "Password reset successfully"
}
```

---

### Factories API

#### GET /factories
Get all factories for the authenticated user.

**Response:**
```json
[
  {
    "factoryId": 1,
    "factoryName": "Production Line A",
    "factoryIndex": 1,
    "width": 100,
    "height": 50,
    "createdAt": "2024-01-15T10:00:00Z",
    "machines": [
      {
        "machineId": 1,
        "machineName": "Machine 001",
        "machineIpAddress": "192.168.1.100",
        "machineIndex": "001",
        "status": "running",
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ]
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

**Response:**
```json
{
  "factoryId": 2,
  "factoryName": "New Factory",
  "factoryIndex": 1,
  "width": 100,
  "height": 50,
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### GET /factories/:id
Get a specific factory by ID.

**URL Parameters:**
- `id` (number) - Factory ID

**Response:**
```json
{
  "factoryId": 1,
  "factoryName": "Production Line A",
  "factoryIndex": 1,
  "width": 100,
  "height": 50,
  "createdAt": "2024-01-15T10:00:00Z",
  "machines": [...]
}
```

#### GET /factories/user/factories
Get factories for current user (alternative endpoint).

**Response:** Same as `GET /factories`

#### PATCH /factories/:factoryId
Update factory information.

**URL Parameters:**
- `factoryId` (number) - Factory ID

**Request:**
```json
{
  "factoryName": "Updated Factory Name",
  "width": 120,
  "height": 60
}
```

**Response:**
```json
{
  "factoryId": 1,
  "factoryName": "Updated Factory Name",
  "factoryIndex": 1,
  "width": 120,
  "height": 60,
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### DELETE /factories/:id
Delete a factory.

**URL Parameters:**
- `id` (number) - Factory ID

**Response:**
```json
{
  "message": "Factory deleted successfully",
  "deleted": true
}
```

---

### Machines API

#### GET /machines/factories-machines
Get all factories and their machines for the authenticated user.

**Response:**
```json
[
  {
    "factoryId": 1,
    "factoryName": "Production Line A",
    "factoryIndex": 1,
    "width": 100,
    "height": 50,
    "machines": [
      {
        "machineId": 1,
        "machineName": "Injection Molding #1",
        "machineIpAddress": "192.168.1.100",
        "machineIndex": "001",
        "status": "running",
        "createdAt": "2024-01-15T10:00:00Z"
      },
      {
        "machineId": 2,
        "machineName": "Injection Molding #2",
        "machineIpAddress": "192.168.1.101",
        "machineIndex": "002",
        "status": "offline",
        "createdAt": "2024-01-15T11:00:00Z"
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

**Response:**
```json
{
  "machineId": 2,
  "machineName": "New Machine",
  "machineIpAddress": "192.168.1.101",
  "machineIndex": "002",
  "status": "offline",
  "createdAt": "2024-01-15T10:00:00Z",
  "factory": {
    "factoryId": 1,
    "factoryName": "Production Line A"
  }
}
```

#### GET /machines/:id
Get machine details by ID.

**URL Parameters:**
- `id` (number) - Machine ID

**Response:**
```json
{
  "machineId": 1,
  "machineName": "Injection Molding #1",
  "machineIpAddress": "192.168.1.100",
  "machineIndex": "001",
  "status": "running",
  "createdAt": "2024-01-15T10:00:00Z",
  "factory": {
    "factoryId": 1,
    "factoryName": "Production Line A"
  }
}
```

#### PATCH /machines/:id
Update machine information.

**URL Parameters:**
- `id` (number) - Machine ID

**Request:**
```json
{
  "machineName": "Updated Machine Name",
  "machineIpAddress": "192.168.1.105",
  "status": "maintenance"
}
```

**Response:**
```json
{
  "machineId": 1,
  "machineName": "Updated Machine Name",
  "machineIpAddress": "192.168.1.105",
  "machineIndex": "001",
  "status": "maintenance",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### POST /machines/update-index
Update machine index.

**Request:**
```json
{
  "machineId": 1,
  "newIndex": "003"
}
```

**Response:**
```json
{
  "machineId": 1,
  "machineIndex": "003",
  "message": "Machine index updated successfully"
}
```

#### DELETE /machines/:id
Delete a machine.

**URL Parameters:**
- `id` (number) - Machine ID

**Response:**
```json
{
  "message": "Machine deleted successfully",
  "deleted": true
}
```

---

### Historical Data API

These endpoints provide access to historical time-series data stored in InfluxDB. All endpoints verify user ownership of the machine.

#### GET /machines/:id/realtime-history
Get paginated realtime historical data for a machine.

**URL Parameters:**
- `id` (number) - Machine ID

**Query Parameters:**
- `timeRange` (string, optional) - Time range for data query. Options: `-5m`, `-1h`, `-6h`, `-24h`, `-7d`. Default: `-1h`
- `limit` (number, optional) - Maximum number of records to return. Default: `1000`
- `offset` (number, optional) - Number of records to skip. Default: `0`
- `aggregate` (string, optional) - Aggregation method. Options: `none`, `mean`, `max`, `min`. Default: `none`

**Response:**
```json
{
  "data": [
    {
      "time": "2025-09-13T14:41:06.000Z",
      "devId": "postgres machine 1",
      "topic": "realtime",
      "OT": 52.3,
      "ASTS": 0,
      "OPM": 2,
      "STS": 2,
      "T1": 221.5,
      "T2": 220.8,
      "T3": 222.1,
      "T4": 219.7,
      "T5": 221.9,
      "T6": 220.4,
      "T7": 222.3
    }
  ],
  "pagination": {
    "total": 145,
    "limit": 1000,
    "offset": 0
  },
  "metadata": {
    "deviceId": "postgres machine 1",
    "timeRange": "-1h",
    "aggregate": "none"
  }
}
```

#### GET /machines/:id/spc-history
Get paginated SPC (Statistical Process Control) historical data for a machine.

**URL Parameters:**
- `id` (number) - Machine ID

**Query Parameters:**
- `timeRange` (string, optional) - Time range for data query. Options: `-5m`, `-1h`, `-6h`, `-24h`, `-7d`. Default: `-1h`
- `limit` (number, optional) - Maximum number of records to return. Default: `1000`
- `offset` (number, optional) - Number of records to skip. Default: `0`
- `aggregate` (string, optional) - Aggregation method. Options: `none`, `mean`, `max`, `min`. Default: `none`

**Response:**
```json
{
  "data": [
    {
      "time": "2025-09-13T14:41:01.000Z",
      "devId": "postgres machine 1",
      "topic": "spc",
      "CYCN": "6026",
      "ECYCT": "45.2",
      "EISS": "2025-09-13T14:40:16.000Z",
      "EIVM": "152.3",
      "EIPM": "78.5",
      "ESIPT": "2.5",
      "ESIPP": "87.2",
      "ESIPS": "32.1",
      "EIPT": "5.2",
      "EIPSE": "2025-09-13T14:40:22.000Z",
      "EPLST": "4.1",
      "EPLSSE": "2025-09-13T14:40:26.000Z",
      "EPLSPM": "118.7",
      "ET1": "221.5",
      "ET2": "220.8",
      "ET3": "222.1",
      "ET4": "219.7",
      "ET5": "221.9",
      "ET6": "220.4",
      "ET7": "222.3",
      "ET8": "220.9",
      "ET9": "221.2",
      "ET10": "222.0"
    }
  ],
  "pagination": {
    "total": 48,
    "limit": 1000,
    "offset": 0
  },
  "metadata": {
    "deviceId": "postgres machine 1",
    "timeRange": "-1h",
    "aggregate": "none"
  }
}
```

#### GET /machines/:id/status
Get current machine status from Redis cache.

**URL Parameters:**
- `id` (number) - Machine ID

**Response:**
```json
{
  "deviceId": "postgres machine 1",
  "status": {
    "devId": "postgres machine 1",
    "topic": "realtime",
    "time": "2025-09-13T14:41:06.000Z",
    "Data": {
      "OT": 52.3,
      "ASTS": 0,
      "OPM": 2,
      "STS": 2,
      "T1": 221.5,
      "T2": 220.8,
      "T3": 222.1,
      "T4": 219.7,
      "T5": 221.9,
      "T6": 220.4,
      "T7": 222.3
    },
    "lastUpdated": "2025-09-13T14:41:07.000Z"
  },
  "lastUpdated": "2025-09-13T14:41:07.000Z"
}
```

#### GET /machines/:id/history/stream
Stream large historical datasets. Returns combined realtime and SPC data.

**URL Parameters:**
- `id` (number) - Machine ID

**Query Parameters:**
- `timeRange` (string, optional) - Time range for data query. Options: `-5m`, `-1h`, `-6h`, `-24h`, `-7d`. Default: `-1h`
- `dataType` (string, optional) - Type of data to stream. Options: `realtime`, `spc`, `both`. Default: `both`

**Response Headers:**
- `Content-Type: application/json`
- `Transfer-Encoding: chunked`
- `Cache-Control: no-cache`

**Response:**
```json
{
  "deviceId": "postgres machine 1",
  "timeRange": "-1h",
  "data": {
    "realtime": [...],
    "spc": [...]
  },
  "totalRecords": 193
}
```

---

### User API

#### GET /user
Get all users (admin only).

**Response:**
```json
[
  {
    "userId": 1,
    "username": "john_doe",
    "email": "user@example.com",
    "accessLevel": "user",
    "createdAt": "2024-01-15T10:00:00Z"
  }
]
```

#### GET /user/:email
Get user by email.

**URL Parameters:**
- `email` (string) - User email

**Response:**
```json
{
  "userId": 1,
  "username": "john_doe",
  "email": "user@example.com",
  "accessLevel": "user",
  "stripeCustomerId": "cus_xxxxx",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### PATCH /user/:id
Update user profile.

**URL Parameters:**
- `id` (number) - User ID

**Request:**
```json
{
  "username": "new_username",
  "accessLevel": "admin"
}
```

**Response:**
```json
{
  "userId": 1,
  "username": "new_username",
  "email": "user@example.com",
  "accessLevel": "admin",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### DELETE /user/:email
Delete user by email.

**URL Parameters:**
- `email` (string) - User email

**Response:**
```json
{
  "message": "User deleted successfully",
  "deleted": true
}
```

---

### Subscription API

All subscription endpoints are prefixed with `/api/subscription` and require authentication.

#### POST /api/subscription/create-checkout-session
Create a Stripe checkout session for subscription.

**Request:**
```json
{
  "lookupKey": "basic_monthly",
  "successUrl": "https://yourdomain.com/success",
  "cancelUrl": "https://yourdomain.com/cancel"
}
```

**Response:**
```json
{
  "sessionId": "cs_test_xxxxx",
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxxxx"
}
```

#### POST /api/subscription/create-portal-session
Create a Stripe customer portal session.

**Request:**
```json
{
  "returnUrl": "https://yourdomain.com/account"
}
```

**Response:**
```json
{
  "url": "https://billing.stripe.com/p/session/xxxxx"
}
```

#### GET /api/subscription/current
Get current user subscription information.

**Response:**
```json
{
  "id": 1,
  "userId": 1,
  "stripeSubscriptionId": "sub_xxxxx",
  "stripeCustomerId": "cus_xxxxx",
  "planLookupKey": "basic_monthly",
  "status": "active",
  "currentPeriodStart": "2024-01-15T10:00:00Z",
  "currentPeriodEnd": "2024-02-15T10:00:00Z",
  "canceledAt": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

#### GET /api/subscription/plans
Get available subscription plans.

**Response:**
```json
[
  {
    "id": "price_xxxxx",
    "lookupKey": "basic_monthly",
    "name": "Basic Plan",
    "price": 999,
    "currency": "usd",
    "interval": "month",
    "features": [
      "Up to 10 machines",
      "Real-time monitoring",
      "Basic analytics"
    ]
  },
  {
    "id": "price_yyyyy",
    "lookupKey": "pro_monthly",
    "name": "Pro Plan",
    "price": 2999,
    "currency": "usd",
    "interval": "month",
    "features": [
      "Unlimited machines",
      "Advanced analytics",
      "Priority support"
    ]
  }
]
```

#### GET /api/subscription/payment-methods
Get user payment methods.

**Response:**
```json
{
  "paymentMethods": [
    {
      "id": "pm_xxxxx",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "expMonth": 12,
        "expYear": 2025
      },
      "isDefault": true
    }
  ]
}
```

#### DELETE /api/subscription/:subscriptionId
Cancel a subscription.

**URL Parameters:**
- `subscriptionId` (string) - Stripe subscription ID

**Response:**
```json
{
  "message": "Subscription cancelled successfully",
  "subscription": {
    "id": "sub_xxxxx",
    "status": "canceled",
    "canceledAt": "2024-01-20T10:00:00Z"
  }
}
```

#### POST /api/webhooks/stripe
Stripe webhook endpoint (internal use, marked as @Public()).

**Note:** This endpoint is for Stripe webhook events only. Do not call this endpoint directly from your frontend.

---

### MQTT Connection API

#### POST /connections
Create a new MQTT connection.

**Request:**
```json
{
  "clientId": "device-001",
  "brokerUrl": "mqtt://localhost:1884",
  "username": "mqtt_user",
  "password": "mqtt_pass"
}
```

**Response:**
```json
{
  "clientId": "device-001",
  "connected": true,
  "message": "Connection created successfully"
}
```

#### DELETE /connections/:clientId
Remove an MQTT connection.

**URL Parameters:**
- `clientId` (string) - MQTT client ID

**Response:**
```json
{
  "clientId": "device-001",
  "message": "Connection removed successfully"
}
```

---

### Health Check API

All health check endpoints are public (no authentication required).

#### GET /health
Get overall system health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z",
  "services": {
    "database": "healthy",
    "influxdb": "healthy",
    "redis": "healthy",
    "mqtt": "healthy",
    "websocket": "healthy"
  },
  "uptime": 3600000
}
```

#### GET /health/database
Get PostgreSQL database health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "responseTime": 12,
  "details": {
    "connected": true,
    "database": "opcua_dashboard"
  }
}
```

#### GET /health/influxdb
Get InfluxDB health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "responseTime": 45,
  "details": {
    "connected": true,
    "bucket": "machine-data",
    "organization": "opcua-org"
  }
}
```

#### GET /health/redis
Get Redis health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "responseTime": 8,
  "details": {
    "connected": true,
    "queueLengths": {
      "mqtt:realtime": 0,
      "mqtt:spc": 0,
      "mqtt:tech": 0
    }
  }
}
```

#### GET /health/mqtt
Get MQTT broker health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "details": {
    "connected": true,
    "brokerUrl": "mqtt://localhost:1884",
    "clientsConnected": 5
  }
}
```

#### GET /health/websocket
Get WebSocket service health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "details": {
    "connectedClients": 12,
    "machineSubscriptions": {
      "postgres machine 1": 3,
      "postgres machine 2": 2
    }
  }
}
```

#### GET /health/demo
Get demo system status (Docker containers).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z",
  "containers": {
    "postgres": "running",
    "influxdb": "running",
    "redis": "running",
    "mosquitto": "running"
  }
}
```

#### GET /health/config
Get system configuration status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z",
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
    "redis": {
      "host": "localhost",
      "port": 6379
    },
    "mqtt": {
      "brokerUrl": "mqtt://localhost:1884"
    }
  }
}
```

---

### Debug API (Development Only)

All debug endpoints are public and should be removed in production.

#### GET /debug/redis/queue-lengths
Check MQTT message queue status.

**Response:**
```json
{
  "success": true,
  "mqtt:realtime": 145,
  "mqtt:spc": 48,
  "mqtt:tech": 0,
  "timestamp": "2024-01-15T10:00:00Z"
}
```

#### GET /debug/redis/peek-message/:queue
Peek at a message in the queue without removing it.

**URL Parameters:**
- `queue` (string) - Queue name (e.g., `mqtt:realtime`, `mqtt:spc`)

**Response:**
```json
{
  "message": {
    "topic": "factory/1/machine/device-001/realtime",
    "payload": {
      "devId": "device-001",
      "Data": {...}
    },
    "timestamp": 1726238467000
  },
  "queue": "mqtt:realtime"
}
```

#### GET /debug/process/single-realtime
Process a single realtime message from the queue.

**Response:**
```json
{
  "success": true,
  "processedMessage": {
    "topic": "factory/1/machine/device-001/realtime",
    "payload": {...}
  },
  "remainingInQueue": 144
}
```

#### GET /debug/process/single-spc
Process a single SPC message from the queue.

**Response:**
```json
{
  "success": true,
  "processedMessage": {
    "topic": "factory/1/machine/device-001/spc",
    "payload": {...}
  },
  "remainingInQueue": 47
}
```

#### GET /debug/influxdb/test-connection
Test InfluxDB connection with a write operation.

**Response:**
```json
{
  "success": true,
  "testData": {
    "devId": "test-device",
    "topic": "test",
    "Data": {...}
  }
}
```

#### GET /debug/processor/status
Get MQTT processor status.

**Response:**
```json
{
  "isConnected": true,
  "processingStats": {
    "totalProcessed": 1523,
    "realtimeProcessed": 982,
    "spcProcessed": 541,
    "errors": 0,
    "lastProcessedAt": "2024-01-15T10:00:00Z"
  }
}
```

#### GET /debug/process/flush-all
Process up to 10 messages from each queue.

**Response:**
```json
{
  "success": true,
  "processedCount": 20,
  "remainingQueues": {
    "mqtt:realtime": 125,
    "mqtt:spc": 28,
    "mqtt:tech": 0
  }
}
```

#### GET /debug/simple-machine-check
Check machines in database.

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:00:00Z",
  "machineCount": 3,
  "machines": [
    {
      "id": 1,
      "name": "postgres machine 1",
      "ip": "192.168.1.100",
      "status": "running"
    }
  ],
  "targetMachineExists": true
}
```

#### GET /debug/comprehensive-diagnostic
Get comprehensive system diagnostic information.

**Response:**
```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "services": {
    "mqttProcessor": {
      "connected": true,
      "stats": {...}
    }
  },
  "machines": {
    "count": 3,
    "machines": [...],
    "targetMachineCache": {
      "exists": true,
      "lastUpdate": "2024-01-15T10:00:00Z"
    }
  },
  "queues": {
    "mqtt:realtime": 0,
    "mqtt:spc": 0,
    "mqtt:tech": 0
  },
  "errors": []
}
```

---

## WebSocket Integration

The backend provides real-time updates through Socket.IO WebSocket connections.

### Connection

Connect to the WebSocket server:

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  transports: ['websocket'],
  autoConnect: true
});
```

### Connection Configuration

The WebSocket gateway has the following configuration:
- **Max Buffer Size**: 1MB
- **Ping Timeout**: 60 seconds
- **Ping Interval**: 25 seconds
- **Upgrade Timeout**: 10 seconds
- **Max Connections per IP**: 5
- **Connection Timeout**: 5 minutes (automatic disconnect)

### Client → Server Events

#### subscribe-machine
Subscribe to real-time updates for a specific machine.

**Payload:**
```json
{
  "deviceId": "postgres machine 1"
}
```

**Response Events:**
- `subscription-confirmed` - Subscription successful
- `machine-status` - Current machine status (if available in cache)
- `error` - If subscription fails

#### unsubscribe-machine
Unsubscribe from machine updates.

**Payload:**
```json
{
  "deviceId": "postgres machine 1"
}
```

**Response Events:**
- `unsubscription-confirmed` - Unsubscription successful
- `error` - If unsubscription fails

#### get-machine-status
Request current machine status from cache.

**Payload:**
```json
{
  "deviceId": "postgres machine 1"
}
```

**Response Events:**
- `machine-status` - Current machine status
- `error` - If request fails

#### ping
Health check ping.

**Payload:** None

**Response Events:**
- `pong` - Health check response

### Server → Client Events

#### connection
Emitted when client connects successfully.

**Payload:**
```json
{
  "message": "Connected to OPC UA Dashboard",
  "serverTime": "2024-01-15T10:00:00.000Z",
  "clientId": "socket_id_123",
  "connectionsFromIP": 1,
  "maxConnections": 5
}
```

#### subscription-confirmed
Emitted when machine subscription is successful.

**Payload:**
```json
{
  "deviceId": "postgres machine 1"
}
```

#### unsubscription-confirmed
Emitted when machine unsubscription is successful.

**Payload:**
```json
{
  "deviceId": "postgres machine 1"
}
```

#### realtime-update
Emitted when new real-time data is available for a subscribed machine.

**Frequency:** Every ~5 seconds per machine

**Payload:**
```json
{
  "deviceId": "postgres machine 1",
  "data": {
    "devId": "postgres machine 1",
    "topic": "realtime",
    "sendTime": "2025-09-13 14:41:07",
    "sendStamp": 1726238467000,
    "time": "2025-09-13 14:41:06",
    "timestamp": 1726238466000,
    "Data": {
      "OT": 52.3,
      "ASTS": 0,
      "OPM": 2,
      "STS": 2,
      "T1": 221.5,
      "T2": 220.8,
      "T3": 222.1,
      "T4": 219.7,
      "T5": 221.9,
      "T6": 220.4,
      "T7": 222.3
    }
  },
  "timestamp": "2025-09-13T14:41:07.000Z"
}
```

**Data Field Descriptions:**
- `OT` - Oil Temperature (°C)
- `ASTS` - Auto Start (0=off, 1=on)
- `OPM` - Operation Mode (1=Semi-auto, 2=Eye auto, 3=Time auto)
- `STS` - Status (1=Idle, 2=Production, 3=Alarm)
- `T1-T7` - Temperature Zones 1-7 (°C)

#### spc-update
Emitted when new SPC (Statistical Process Control) data is available.

**Frequency:** Every ~30-60 seconds per machine

**Payload:**
```json
{
  "deviceId": "postgres machine 1",
  "data": {
    "devId": "postgres machine 1",
    "topic": "spc",
    "sendTime": "2025-09-13 14:41:02",
    "sendStamp": 1726238462000,
    "time": "2025-09-13 14:41:01",
    "timestamp": 1726238461000,
    "Data": {
      "CYCN": "6026",
      "ECYCT": "45.2",
      "EISS": "2025-09-13T14:40:16.000Z",
      "EIVM": "152.3",
      "EIPM": "78.5",
      "ESIPT": "2.5",
      "ESIPP": "87.2",
      "ESIPS": "32.1",
      "EIPT": "5.2",
      "EIPSE": "2025-09-13T14:40:22.000Z",
      "EPLST": "4.1",
      "EPLSSE": "2025-09-13T14:40:26.000Z",
      "EPLSPM": "118.7",
      "ET1": "221.5",
      "ET2": "220.8",
      "ET3": "222.1",
      "ET4": "219.7",
      "ET5": "221.9",
      "ET6": "220.4",
      "ET7": "222.3",
      "ET8": "220.9",
      "ET9": "221.2",
      "ET10": "222.0"
    }
  },
  "timestamp": "2025-09-13T14:41:02.000Z"
}
```

**SPC Data Field Descriptions:**
- `CYCN` - Cycle Number
- `ECYCT` - Effective Cycle Time (seconds)
- `EISS` - Effective Injection Start Time
- `EIVM` - Effective Injection Velocity Max (mm/s)
- `EIPM` - Effective Injection Pressure Max (bar)
- `ESIPT` - Effective Switch-over Injection Pressure Time (s)
- `ESIPP` - Effective Switch-over Injection Pressure Position (%)
- `ESIPS` - Effective Switch-over Injection Pressure Speed (mm/s)
- `EIPT` - Effective Injection Pressure Time (s)
- `EIPSE` - Effective Injection Pressure Start End
- `EPLST` - Effective Plasticizing Time (s)
- `EPLSSE` - Effective Plasticizing Start End
- `EPLSPM` - Effective Plasticizing Pressure Max (bar)
- `ET1-ET10` - Effective Temperatures 1-10 (°C)

#### machine-status
Emitted in response to `get-machine-status` or after subscription.

**Payload:**
```json
{
  "deviceId": "postgres machine 1",
  "data": {
    "devId": "postgres machine 1",
    "topic": "realtime",
    "time": "2025-09-13T14:41:06.000Z",
    "Data": {...},
    "lastUpdated": "2025-09-13T14:41:07.000Z"
  },
  "source": "cache"
}
```

**Source Values:**
- `cache` - Data retrieved from Redis cache after subscription
- `requested` - Data retrieved in response to `get-machine-status` event

#### machine-alert
Emitted when machine alerts occur.

**Payload:**
```json
{
  "deviceId": "postgres machine 1",
  "alert": {
    "level": "warning",
    "message": "Temperature threshold exceeded",
    "code": "TEMP_HIGH",
    "value": 235.5,
    "threshold": 230.0
  },
  "timestamp": "2024-01-15T10:00:00Z"
}
```

**Alert Levels:**
- `info` - Informational message
- `warning` - Warning condition
- `error` - Error condition
- `critical` - Critical condition requiring immediate attention

#### pong
Emitted in response to `ping` event.

**Payload:**
```json
{
  "timestamp": "2024-01-15T10:00:00Z"
}
```

#### error
Emitted when errors occur.

**Payload:**
```json
{
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

**Error Codes:**
- `CONNECTION_LIMIT_EXCEEDED` - Too many connections from IP
- `INVALID_DEVICE_ID` - Device ID is missing or invalid
- `SUBSCRIPTION_FAILED` - Failed to subscribe to machine
- `UNSUBSCRIPTION_FAILED` - Failed to unsubscribe from machine

---

## Data Models

### TypeScript Interfaces

#### User Entity
```typescript
interface User {
  userId: number;
  username: string;
  email: string;
  accessLevel: string; // "user" | "admin"
  stripeCustomerId: string | null;
  createdAt: Date;
}
```

#### Factory Entity
```typescript
interface Factory {
  factoryId: number;
  factoryName: string;
  factoryIndex: number;
  width: number;
  height: number;
  createdAt: Date;
  machines?: Machine[];
}
```

#### Machine Entity
```typescript
interface Machine {
  machineId: number;
  machineName: string;
  machineIpAddress: string;
  machineIndex: string;
  status: string; // "running" | "offline" | "maintenance" | "error"
  createdAt: Date;
  factory?: Factory;
  user?: User;
}
```

#### UserSubscription Entity
```typescript
interface UserSubscription {
  id: number;
  userId: number;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  planLookupKey: string | null;
  status: string; // "active" | "inactive" | "canceled" | "past_due"
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastPaymentDate: Date | null;
  paymentFailedAt: Date | null;
}
```

#### Real-Time Data Structure
```typescript
interface RealtimeData {
  devId: string;
  topic: string; // "realtime"
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    OT: number;    // Oil Temperature (°C)
    ASTS: number;  // Auto Start (0=off, 1=on)
    OPM: number;   // Operation Mode (1=Semi-auto, 2=Eye auto, 3=Time auto)
    STS: number;   // Status (1=Idle, 2=Production, 3=Alarm)
    T1: number;    // Temperature Zone 1 (°C)
    T2: number;    // Temperature Zone 2 (°C)
    T3: number;    // Temperature Zone 3 (°C)
    T4: number;    // Temperature Zone 4 (°C)
    T5: number;    // Temperature Zone 5 (°C)
    T6: number;    // Temperature Zone 6 (°C)
    T7: number;    // Temperature Zone 7 (°C)
  };
}
```

#### SPC Data Structure
```typescript
interface SPCData {
  devId: string;
  topic: string; // "spc"
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    CYCN: string;      // Cycle Number
    ECYCT: string;     // Effective Cycle Time (seconds)
    EISS: string;      // Effective Injection Start Time
    EIVM: string;      // Effective Injection Velocity Max (mm/s)
    EIPM: string;      // Effective Injection Pressure Max (bar)
    ESIPT: string;     // Effective Switch-over Injection Pressure Time (s)
    ESIPP?: string;    // Effective Switch-over Injection Pressure Position (%)
    ESIPS?: string;    // Effective Switch-over Injection Pressure Speed (mm/s)
    EIPT?: string;     // Effective Injection Pressure Time (s)
    EIPSE?: string;    // Effective Injection Pressure Start End
    EPLST?: string;    // Effective Plasticizing Time (s)
    EPLSSE?: string;   // Effective Plasticizing Start End
    EPLSPM?: string;   // Effective Plasticizing Pressure Max (bar)
    ET1: string;       // Effective Temperature 1 (°C)
    ET2: string;       // Effective Temperature 2 (°C)
    ET3: string;       // Effective Temperature 3 (°C)
    ET4?: string;      // Effective Temperature 4 (°C)
    ET5?: string;      // Effective Temperature 5 (°C)
    ET6?: string;      // Effective Temperature 6 (°C)
    ET7?: string;      // Effective Temperature 7 (°C)
    ET8?: string;      // Effective Temperature 8 (°C)
    ET9?: string;      // Effective Temperature 9 (°C)
    ET10?: string;     // Effective Temperature 10 (°C)
  };
}
```

#### WebSocket Event Payloads

```typescript
// Client to Server
interface SubscribeMachinePayload {
  deviceId: string;
}

interface UnsubscribeMachinePayload {
  deviceId: string;
}

interface GetMachineStatusPayload {
  deviceId: string;
}

// Server to Client
interface ConnectionPayload {
  message: string;
  serverTime: string;
  clientId: string;
  connectionsFromIP: number;
  maxConnections: number;
}

interface SubscriptionConfirmedPayload {
  deviceId: string;
}

interface RealtimeUpdatePayload {
  deviceId: string;
  data: RealtimeData;
  timestamp: string;
}

interface SPCUpdatePayload {
  deviceId: string;
  data: SPCData;
  timestamp: string;
}

interface MachineStatusPayload {
  deviceId: string;
  data: RealtimeData;
  source: 'cache' | 'requested';
}

interface MachineAlertPayload {
  deviceId: string;
  alert: {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    code: string;
    value?: number;
    threshold?: number;
  };
  timestamp: string;
}

interface ErrorPayload {
  message: string;
  code?: string;
}

interface PongPayload {
  timestamp: string;
}
```

---

## Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "Email must be a valid email address"
    }
  ]
}
```

### WebSocket Error Handling

```javascript
socket.on('error', (error) => {
  switch (error.code) {
    case 'CONNECTION_LIMIT_EXCEEDED':
      console.error('Too many connections from this IP');
      break;
    case 'INVALID_DEVICE_ID':
      console.error('Device ID is required');
      break;
    case 'SUBSCRIPTION_FAILED':
      console.error('Failed to subscribe to machine');
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

### Common Error Scenarios

#### 1. Authentication Errors

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid or expired token"
}
```

**Solution:** Refresh the JWT token or re-authenticate.

#### 2. Resource Not Found

```json
{
  "statusCode": 404,
  "message": "Machine not found",
  "error": "Not Found"
}
```

**Solution:** Verify the resource ID exists and belongs to the authenticated user.

#### 3. Validation Errors

```json
{
  "statusCode": 400,
  "message": ["factoryName should not be empty", "width must be an integer"],
  "error": "Bad Request"
}
```

**Solution:** Check the request payload against the DTO requirements.

#### 4. Ownership Verification Failed

```json
{
  "statusCode": 403,
  "message": "You do not have permission to access this resource",
  "error": "Forbidden"
}
```

**Solution:** Ensure the authenticated user owns the requested resource.

---

## Integration Examples

### React/TypeScript Example

#### Complete Machine Monitor Component

```typescript
import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface MachineData {
  deviceId: string;
  data: any;
  timestamp: string;
}

interface ConnectionInfo {
  message: string;
  serverTime: string;
  clientId: string;
  connectionsFromIP: number;
  maxConnections: number;
}

const MachineMonitor: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeData, setRealtimeData] = useState<MachineData | null>(null);
  const [spcData, setSPCData] = useState<MachineData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [subscribedMachines, setSubscribedMachines] = useState<Set<string>>(new Set());

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

    socketInstance.on('connection', (data: ConnectionInfo) => {
      setConnectionInfo(data);
      console.log('Connection info:', data);
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket server:', reason);

      // Clear subscribed machines on disconnect
      setSubscribedMachines(new Set());
    });

    // Subscription confirmations
    socketInstance.on('subscription-confirmed', (data: { deviceId: string }) => {
      console.log('Subscription confirmed:', data.deviceId);
      setSubscribedMachines(prev => new Set(prev).add(data.deviceId));
    });

    socketInstance.on('unsubscription-confirmed', (data: { deviceId: string }) => {
      console.log('Unsubscription confirmed:', data.deviceId);
      setSubscribedMachines(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.deviceId);
        return newSet;
      });
    });

    // Data event handlers
    socketInstance.on('realtime-update', (data: MachineData) => {
      console.log('Realtime update:', data);
      setRealtimeData(data);
    });

    socketInstance.on('spc-update', (data: MachineData) => {
      console.log('SPC update:', data);
      setSPCData(data);
    });

    socketInstance.on('machine-status', (data: any) => {
      console.log('Machine status:', data);
    });

    socketInstance.on('machine-alert', (data: any) => {
      console.warn('Machine Alert:', data);
      // Handle alerts (e.g., show notification)
    });

    // Error handling
    socketInstance.on('error', (error: any) => {
      console.error('Socket error:', error);

      if (error.code === 'CONNECTION_LIMIT_EXCEEDED') {
        alert('Too many connections. Please close other tabs.');
      }
    });

    setSocket(socketInstance);

    // Cleanup on component unmount
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const subscribeToMachine = useCallback((deviceId: string) => {
    if (socket && isConnected) {
      socket.emit('subscribe-machine', { deviceId });
    } else {
      console.error('Socket not connected');
    }
  }, [socket, isConnected]);

  const unsubscribeFromMachine = useCallback((deviceId: string) => {
    if (socket && isConnected) {
      socket.emit('unsubscribe-machine', { deviceId });
    }
  }, [socket, isConnected]);

  const getMachineStatus = useCallback((deviceId: string) => {
    if (socket && isConnected) {
      socket.emit('get-machine-status', { deviceId });
    }
  }, [socket, isConnected]);

  const pingServer = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('ping');
      socket.once('pong', (data) => {
        console.log('Pong received:', data);
      });
    }
  }, [socket, isConnected]);

  return (
    <div className="machine-monitor">
      <h2>Machine Monitor</h2>

      {/* Connection Status */}
      <div className="connection-status">
        <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
        {connectionInfo && (
          <p>
            Client ID: {connectionInfo.clientId} |
            Connections: {connectionInfo.connectionsFromIP}/{connectionInfo.maxConnections}
          </p>
        )}
      </div>

      {/* Machine Controls */}
      <div className="controls">
        <button onClick={() => subscribeToMachine('postgres machine 1')}>
          Subscribe to Machine 1
        </button>
        <button onClick={() => unsubscribeFromMachine('postgres machine 1')}>
          Unsubscribe from Machine 1
        </button>
        <button onClick={() => getMachineStatus('postgres machine 1')}>
          Get Status
        </button>
        <button onClick={pingServer}>
          Ping Server
        </button>
      </div>

      {/* Subscribed Machines */}
      <div className="subscribed-machines">
        <h3>Subscribed Machines</h3>
        <ul>
          {Array.from(subscribedMachines).map(machine => (
            <li key={machine}>{machine}</li>
          ))}
        </ul>
      </div>

      {/* Real-time Data Display */}
      {realtimeData && (
        <div className="realtime-data">
          <h3>Real-time Data</h3>
          <p>Device: {realtimeData.deviceId}</p>
          <p>Timestamp: {new Date(realtimeData.timestamp).toLocaleString()}</p>
          <div className="data-grid">
            <p>Oil Temperature: {realtimeData.data.Data.OT}°C</p>
            <p>Operation Mode: {realtimeData.data.Data.OPM}</p>
            <p>Status: {realtimeData.data.Data.STS}</p>
            <p>T1: {realtimeData.data.Data.T1}°C</p>
            <p>T2: {realtimeData.data.Data.T2}°C</p>
            <p>T3: {realtimeData.data.Data.T3}°C</p>
            <p>T4: {realtimeData.data.Data.T4}°C</p>
          </div>
        </div>
      )}

      {/* SPC Data Display */}
      {spcData && (
        <div className="spc-data">
          <h3>SPC Data</h3>
          <p>Device: {spcData.deviceId}</p>
          <p>Timestamp: {new Date(spcData.timestamp).toLocaleString()}</p>
          <div className="data-grid">
            <p>Cycle Number: {spcData.data.Data.CYCN}</p>
            <p>Cycle Time: {spcData.data.Data.ECYCT}s</p>
            <p>Injection Velocity Max: {spcData.data.Data.EIVM} mm/s</p>
            <p>Injection Pressure Max: {spcData.data.Data.EIPM} bar</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineMonitor;
```

### API Client Class

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

  // Generic request handler
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }

  // Authentication methods
  async login(email: string, password: string) {
    const data = await this.request<{ access_token: string; user: any }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    this.setToken(data.access_token);
    return data;
  }

  async signUp(email: string, password: string, username: string) {
    return this.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    });
  }

  async getProfile() {
    return this.request('/auth/profile');
  }

  async forgotPassword(email: string) {
    return this.request('/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request(`/auth/reset-password/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // Factory methods
  async getFactories() {
    return this.request('/factories');
  }

  async createFactory(factoryData: {
    factoryName: string;
    factoryIndex: number;
    width: number;
    height: number;
  }) {
    return this.request('/factories', {
      method: 'POST',
      body: JSON.stringify(factoryData),
    });
  }

  async getFactory(id: number) {
    return this.request(`/factories/${id}`);
  }

  async updateFactory(id: number, updates: any) {
    return this.request(`/factories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteFactory(id: number) {
    return this.request(`/factories/${id}`, {
      method: 'DELETE',
    });
  }

  // Machine methods
  async getFactoriesAndMachines() {
    return this.request('/machines/factories-machines');
  }

  async createMachine(machineData: {
    machineName: string;
    machineIpAddress: string;
    machineIndex: string;
    factoryId: number;
    factoryIndex: number;
    status?: string;
  }) {
    return this.request('/machines', {
      method: 'POST',
      body: JSON.stringify(machineData),
    });
  }

  async getMachine(id: number) {
    return this.request(`/machines/${id}`);
  }

  async updateMachine(id: number, updates: any) {
    return this.request(`/machines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteMachine(id: number) {
    return this.request(`/machines/${id}`, {
      method: 'DELETE',
    });
  }

  async updateMachineIndex(machineId: number, newIndex: string) {
    return this.request('/machines/update-index', {
      method: 'POST',
      body: JSON.stringify({ machineId, newIndex }),
    });
  }

  // Historical data methods
  async getRealtimeHistory(
    machineId: number,
    params?: {
      timeRange?: string;
      limit?: number;
      offset?: number;
      aggregate?: string;
    }
  ) {
    const queryParams = new URLSearchParams(
      params as Record<string, string>
    ).toString();
    return this.request(
      `/machines/${machineId}/realtime-history?${queryParams}`
    );
  }

  async getSPCHistory(
    machineId: number,
    params?: {
      timeRange?: string;
      limit?: number;
      offset?: number;
      aggregate?: string;
    }
  ) {
    const queryParams = new URLSearchParams(
      params as Record<string, string>
    ).toString();
    return this.request(`/machines/${machineId}/spc-history?${queryParams}`);
  }

  async getMachineStatus(machineId: number) {
    return this.request(`/machines/${machineId}/status`);
  }

  async streamHistory(
    machineId: number,
    params?: {
      timeRange?: string;
      dataType?: string;
    }
  ) {
    const queryParams = new URLSearchParams(
      params as Record<string, string>
    ).toString();
    return this.request(
      `/machines/${machineId}/history/stream?${queryParams}`
    );
  }

  // Subscription methods
  async createCheckoutSession(
    lookupKey: string,
    successUrl: string,
    cancelUrl: string
  ) {
    return this.request('/api/subscription/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ lookupKey, successUrl, cancelUrl }),
    });
  }

  async createPortalSession(returnUrl: string) {
    return this.request('/api/subscription/create-portal-session', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  }

  async getCurrentSubscription() {
    return this.request('/api/subscription/current');
  }

  async getSubscriptionPlans() {
    return this.request('/api/subscription/plans');
  }

  async getPaymentMethods() {
    return this.request('/api/subscription/payment-methods');
  }

  async cancelSubscription(subscriptionId: string) {
    return this.request(`/api/subscription/${subscriptionId}`, {
      method: 'DELETE',
    });
  }

  // Health check methods
  async getHealth() {
    return this.request('/health');
  }

  async getDatabaseHealth() {
    return this.request('/health/database');
  }

  async getInfluxDBHealth() {
    return this.request('/health/influxdb');
  }

  async getRedisHealth() {
    return this.request('/health/redis');
  }

  async getMQTTHealth() {
    return this.request('/health/mqtt');
  }

  async getWebSocketHealth() {
    return this.request('/health/websocket');
  }
}

// Usage example
const api = new OPCUADashboardAPI('http://localhost:3000');

// Login and use API
async function initializeApp() {
  try {
    // Login
    const { access_token, user } = await api.login(
      'user@example.com',
      'password123'
    );
    console.log('Logged in as:', user.username);

    // Get factories and machines
    const factoriesAndMachines = await api.getFactoriesAndMachines();
    console.log('Factories and machines:', factoriesAndMachines);

    // Get historical data
    const history = await api.getRealtimeHistory(1, {
      timeRange: '-1h',
      limit: 100,
    });
    console.log('Historical data:', history);

    // Check health
    const health = await api.getHealth();
    console.log('System health:', health);
  } catch (error) {
    console.error('API error:', error);
  }
}

initializeApp();
```

### Vue.js Example

```vue
<template>
  <div class="machine-monitor">
    <h2>Machine Monitor</h2>

    <div class="connection-status">
      <p>Status: {{ isConnected ? '🟢 Connected' : '🔴 Disconnected' }}</p>
    </div>

    <div class="controls">
      <button @click="subscribeToMachine('postgres machine 1')">
        Subscribe to Machine 1
      </button>
      <button @click="unsubscribeFromMachine('postgres machine 1')">
        Unsubscribe from Machine 1
      </button>
    </div>

    <div v-if="realtimeData" class="realtime-data">
      <h3>Real-time Data</h3>
      <p>Device: {{ realtimeData.deviceId }}</p>
      <p>Oil Temperature: {{ realtimeData.data.Data.OT }}°C</p>
      <p>Status: {{ realtimeData.data.Data.STS }}</p>
    </div>

    <div v-if="spcData" class="spc-data">
      <h3>SPC Data</h3>
      <p>Device: {{ spcData.deviceId }}</p>
      <p>Cycle: {{ spcData.data.Data.CYCN }}</p>
      <p>Cycle Time: {{ spcData.data.Data.ECYCT }}s</p>
    </div>
  </div>
</template>

<script>
import { io } from 'socket.io-client';

export default {
  name: 'MachineMonitor',
  data() {
    return {
      socket: null,
      isConnected: false,
      realtimeData: null,
      spcData: null,
    };
  },
  mounted() {
    this.initializeSocket();
  },
  beforeUnmount() {
    if (this.socket) {
      this.socket.disconnect();
    }
  },
  methods: {
    initializeSocket() {
      this.socket = io('ws://localhost:3000', {
        transports: ['websocket'],
        autoConnect: true,
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log('Connected to WebSocket server');
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        console.log('Disconnected from WebSocket server');
      });

      this.socket.on('realtime-update', (data) => {
        this.realtimeData = data;
      });

      this.socket.on('spc-update', (data) => {
        this.spcData = data;
      });

      this.socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    },
    subscribeToMachine(deviceId) {
      if (this.socket && this.isConnected) {
        this.socket.emit('subscribe-machine', { deviceId });
      }
    },
    unsubscribeFromMachine(deviceId) {
      if (this.socket && this.isConnected) {
        this.socket.emit('unsubscribe-machine', { deviceId });
      }
    },
  },
};
</script>
```

---

## CORS Configuration

The server is configured to accept requests from multiple origins:
- `http://localhost:3000`
- `http://localhost:3001`
- `https://*.vercel.app`
- `https://*.netlify.app`

For production deployments, ensure your domain is added to the CORS configuration in `src/main.ts`.

---

## Rate Limiting

- **WebSocket connections**: Limited to 5 per IP address
- **Connection timeout**: 5 minutes of inactivity
- **MQTT message processing**: Built-in backpressure handling
- **Historical data queries**: Recommended to use pagination for large datasets

---

## Best Practices

### 1. Authentication
- Store JWT tokens securely (e.g., httpOnly cookies or secure storage)
- Refresh tokens before they expire
- Never expose tokens in URLs or logs

### 2. WebSocket Connections
- Implement reconnection logic with exponential backoff
- Limit concurrent connections (max 5 per IP)
- Clean up subscriptions when components unmount
- Use heartbeat (ping/pong) to maintain connection

### 3. Data Fetching
- Use historical data endpoints for large datasets, not WebSocket
- Implement pagination for historical queries
- Use streaming endpoint for very large datasets
- Cache frequently accessed data

### 4. Error Handling
- Always handle WebSocket errors and disconnections
- Implement retry logic for failed API requests
- Display user-friendly error messages
- Log errors for debugging

### 5. Performance
- Unsubscribe from machines when not needed
- Use aggregation for historical data when appropriate
- Implement debouncing for frequent updates
- Use React.memo or Vue's computed properties for expensive renders

---

## Testing

### Testing WebSocket with wscat

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket"

# After connection, send:
40
42["subscribe-machine",{"deviceId":"postgres machine 1"}]
```

### Testing REST API with curl

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get factories (replace TOKEN with your JWT)
curl -X GET http://localhost:3000/factories \
  -H "Authorization: Bearer TOKEN"

# Get historical data
curl -X GET "http://localhost:3000/machines/1/realtime-history?timeRange=-1h&limit=100" \
  -H "Authorization: Bearer TOKEN"
```

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: [Project Repository]
- Documentation: [CLAUDE.md](../CLAUDE.md)
- Health Check: `GET /health`
- Debug Endpoints: `GET /debug/*` (development only)

---

## Version

**Backend Version**: 1.0.0
**API Version**: v1
**Socket.IO Version**: 4.x
**Last Updated**: 2024-01-15
