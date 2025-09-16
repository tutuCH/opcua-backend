# IMM Data Monitoring Platform – Cost-Optimized Architecture Guide

## 📖 Overview

This document explains the **cost-optimized architecture** for the IMM (Injection Molding Machine) monitoring platform, prioritizing affordability while maintaining scalability. The platform uses a progressive scaling approach starting with minimal infrastructure costs.

The platform ingests data from IMM machines via MQTT, uses intelligent caching and pub/sub patterns, and serves real-time data to frontend applications through WebSockets instead of expensive polling.

---

## 💰 Cost-Optimized Architecture Phases

### Phase 1: Development Setup (Docker-based for <$30/month)

```
IMM Machines
    ↓
Mosquitto Broker (Docker)
    ↓
Redis Message Queue (Docker)
    ↓
NestJS Ingestion Service + Cache
    ├── PostgreSQL (metadata) - Docker
    ├── InfluxDB (time-series) - Docker  
    ├── Redis Cache (status) - Docker
    └── WebSocket Gateway (real-time) - Built-in
    ↓
Frontend (Vercel/Netlify) - FREE
```

### Phase 2: Production Setup ($50-100/month for 50+ machines)

```
IMM Machines
    ↓
Load Balancer → MQTT Cluster
    ↓
Redis Pub/Sub + Message Queue
    ↓
NestJS Service Cluster
    ├── PostgreSQL Cluster (metadata)
    ├── InfluxDB Cloud (time-series)
    ├── Redis Cluster (cache)
    └── WebSocket Gateway
    ↓
CDN → Frontend
```

---

## 🏗️ System Architecture

### MQTT Topics

* **`/deviceId/realtime`**
  * High-frequency messages (every few seconds)
  * Contains machine status, operating mode, and temperatures
  * **Cache Strategy**: In-memory for 30 seconds, significant-change detection

* **`/deviceId/spc`**
  * Sent per cycle
  * Contains structured process/cycle data (cycle time, injection time, pressures, speeds)
  * **Storage Strategy**: InfluxDB time-series with retention policies

* **`/deviceId/tech`**
  * Sent on job/setup change
  * Contains static process setup parameters
  * **Storage Strategy**: PostgreSQL for quick access and relationships

### Example Payloads

#### Realtime

```json
{
  "devId": "C02",                       // Device ID (unique identifier of the injection molding machine)
  "topic": "realtime",                  // Topic for MQTT publishing: live machine status and sensor data
  "sendTime": "2025-08-01 10:49:01",    // Time when the message is sent (human-readable format)
  "sendStamp": 1754016541000,           // Millisecond epoch timestamp for sendTime (+ offset for ordering)
  "time": "2025-08-01 10:49:00",        // Reference time of the measurement (1 second earlier than sendTime)
  "timestamp": 1754016540000,           // Millisecond epoch timestamp for time
  "Data": {
    "OT": 45.8,                         // Oil Temperature (°C) - ensures hydraulic oil is within safe operating limits
    "ATST": 0,                          // Auto-start status: 0 = disabled, 1 = enabled
    "OPM": 2,                           // Operate Mode:
                                        //   0 = Manual
                                        //   1 = Semi-auto
                                        //   2 = Eye auto
                                        //   3 = Time auto
                                        //   4 = Debug mode
    "STS": 1,                           // Machine status: 1 = Standby, 2 = Production
    "T1": 220.5,                        // Barrel temperature zone 1 (°C)
    "T2": 221.0,                        // Barrel temperature zone 2 (°C)
    "T3": 220.8,                        // Barrel temperature zone 3 (°C)
    "T4": 219.9,                        // Barrel temperature zone 4 (°C)
    "T5": 221.2,                        // Barrel temperature zone 5 (°C)
    "T6": 220.7,                        // Barrel temperature zone 6 (°C)
    "T7": 220.1                         // Barrel temperature zone 7 (°C) - up to T10 depending on machine
  }
}

```

#### SPC

```json
{
  "devId": "C02",                       // Device ID (unique identifier of the injection molding machine)
  "topic": "spc",                       // Topic for MQTT publishing: process control and cycle data
  "sendTime": "2025-08-01 10:49:01",    // Time when the message is sent
  "sendStamp": 1754016541000,           // Millisecond epoch timestamp for sendTime
  "time": "2025-08-01 10:49:00",        // Reference time of the measurement
  "timestamp": 1754016540000,           // Millisecond epoch timestamp for time
  "Data": {
    "CYCN": 123,                        // Cycle Number - current production cycle count
    "ECYCT": 45.6,                      // Cycle Time (s) - duration of one full molding cycle
    "EISS": "2025-08-26T10:00:00Z",     // Injection Stroke Start - timestamp when injection stroke begins

    "EIVM": 150.2,                      // Max Injection Velocity (mm/s)
    "EIPM": 78.5,                       // Max Injection Pressure (bar)
    "ESIPT": 2.5,                       // Switch-over Pack Time (s)
    "ESIPP": 90.0,                      // Switch-over Pack Pressure (bar)
    "ESIPS": 35.6,                      // Switch-over Pack Position (mm)
    "EIPT": 5.2,                        // Injection Time (s)
    "EIPSE": "2025-08-26T10:05:00Z",    // Injection Stroke End - timestamp when injection finishes

    "EPLST": 4.0,                       // Plasticizing Time (s) - screw recovery duration
    "EPLSSE": "2025-08-26T10:10:00Z",   // Plasticizing Stroke End - timestamp when plasticizing ends
    "EPLSPM": 120.7,                    // Max Plasticizing Pressure (bar)

    "ET1": 220.5,                       // Barrel temperature zone 1 (°C)
    "ET2": 219.8,                       // Barrel temperature zone 2 (°C)
    "ET3": 221.0,                       // Barrel temperature zone 3 (°C)
    "ET4": 220.2,                       // Barrel temperature zone 4 (°C)
    "ET5": 221.5,                       // Barrel temperature zone 5 (°C)
    "ET6": 220.1,                       // Barrel temperature zone 6 (°C)
    "ET7": 219.9,                       // Barrel temperature zone 7 (°C)
    "ET8": 220.3,                       // Barrel temperature zone 8 (°C)
    "ET9": 221.2,                       // Barrel temperature zone 9 (°C)
    "ET10": 220.7                       // Barrel temperature zone 10 (°C)
  }
}

```

#### Tech

```json
{
  "devId": "C02",                       // Device ID (unique identifier of the injection molding machine)
  "topic": "tech",                      // Topic for MQTT publishing: setpoints / recipe parameters
  "sendTime": "2025-08-01 10:49:01",    // Time when the message is sent
  "sendStamp": 1754016541000,           // Millisecond epoch timestamp for sendTime
  "time": "2025-08-01 10:49:00",        // Reference time of the measurement
  "timestamp": 1754016540000,           // Millisecond epoch timestamp for time
  "Data": {
    "TS1": 220,                         // Temperature Setpoint Zone 1 (°C)
    "TS2": 221,                         // Temperature Setpoint Zone 2 (°C)
    "TS3": 220,                         // Temperature Setpoint Zone 3 (°C)
    "TS4": 222,                         // Temperature Setpoint Zone 4 (°C)
    "TS5": 223,                         // Temperature Setpoint Zone 5 (°C)
    "TS6": 221,                         // Temperature Setpoint Zone 6 (°C)
    "TS7": 220,                         // Temperature Setpoint Zone 7 (°C)
    "TS8": 222,                         // Temperature Setpoint Zone 8 (°C)
    "TS9": 221,                         // Temperature Setpoint Zone 9 (°C)
    "TS10": 220,                        // Temperature Setpoint Zone 10 (°C)

    "IP1": 50,                          // Injection Pressure Step 1 (bar)
    "IP2": 52,                          // Injection Pressure Step 2 (bar)
    "IP3": 49,                          // Injection Pressure Step 3 (bar)
    "IP4": 51,                          // Injection Pressure Step 4 (bar)
    "IP5": 50,                          // Injection Pressure Step 5 (bar)
    "IP6": 53,                          // Injection Pressure Step 6 (bar)
    "IP7": 52,                          // Injection Pressure Step 7 (bar)
    "IP8": 51,                          // Injection Pressure Step 8 (bar)
    "IP9": 50,                          // Injection Pressure Step 9 (bar)
    "IP10": 49,                         // Injection Pressure Step 10 (bar)

    "IV1": 10,                          // Injection Velocity Step 1 (mm/s)
    "IV2": 12,                          // Injection Velocity Step 2 (mm/s)
    "IV3": 11,                          // Injection Velocity Step 3 (mm/s)
    "IV4": 13,                          // Injection Velocity Step 4 (mm/s)
    "IV5": 12,                          // Injection Velocity Step 5 (mm/s)
    "IV6": 11,                          // Injection Velocity Step 6 (mm/s)
    "IV7": 10,                          // Injection Velocity Step 7 (mm/s)
    "IV8": 12,                          // Injection Velocity Step 8 (mm/s)
    "IV9": 11,                          // Injection Velocity Step 9 (mm/s)
    "IV10": 13,                         // Injection Velocity Step 10 (mm/s)

    "IS1": 5.1,                         // Injection Stroke Position Step 1 (mm)
    "IS2": 5.2,                         // Injection Stroke Position Step 2 (mm)
    "IS3": 5.3,                         // Injection Stroke Position Step 3 (mm)
    "IS4": 5.0,                         // Injection Stroke Position Step 4 (mm)
    "IS5": 5.4,                         // Injection Stroke Position Step 5 (mm)
    "IS6": 5.1,                         // Injection Stroke Position Step 6 (mm)
    "IS7": 5.3,                         // Injection Stroke Position Step 7 (mm)
    "IS8": 5.2,                         // Injection Stroke Position Step 8 (mm)
    "IS9": 5.4,                         // Injection Stroke Position Step 9 (mm)
    "IS10": 5.1,                        // Injection Stroke Position Step 10 (mm)

    "IT1": 2.1,                         // Injection Time Step 1 (s)
    "IT2": 2.2,                         // Injection Time Step 2 (s)
    "IT3": 2.3,                         // Injection Time Step 3 (s)
    "IT4": 2.0,                         // Injection Time Step 4 (s)
    "IT5": 2.5,                         // Injection Time Step 5 (s)
    "IT6": 2.1,                         // Injection Time Step 6 (s)
    "IT7": 2.2,                         // Injection Time Step 7 (s)
    "IT8": 2.3,                         // Injection Time Step 8 (s)
    "IT9": 2.4,                         // Injection Time Step 9 (s)
    "IT10": 2.2                         // Injection Time Step 10 (s)
  }
}

```

---

## 🚀 Optimized Data Storage Strategy

### Phase 1: Docker-Based Development Storage

#### PostgreSQL for Metadata
```typescript
// Configuration for development and production
database: {
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'opcua_dashboard',
  entities: ['dist/**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production',
  ssl: process.env.NODE_ENV === 'production'
}
```

#### InfluxDB for Time Series
```typescript
import { InfluxDB, WriteApi } from '@influxdata/influxdb-client';

export class InfluxDBService {
  private influxDB: InfluxDB;
  private writeApi: WriteApi;
  
  constructor() {
    this.influxDB = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || 'dev-token'
    });
    this.writeApi = this.influxDB.getWriteApi(
      process.env.INFLUXDB_ORG || 'opcua-org',
      process.env.INFLUXDB_BUCKET || 'machine-data'
    );
  }
  
  async writeRealtimeData(deviceId: string, data: RealtimeData) {
    const point = new Point('realtime')
      .tag('device_id', deviceId)
      .floatField('oil_temp', data.Data.OT)
      .intField('operate_mode', data.Data.OPM)
      .intField('status', data.Data.STS)
      .floatField('temp_1', data.Data.T1)
      .floatField('temp_2', data.Data.T2)
      .floatField('temp_3', data.Data.T3)
      .floatField('temp_4', data.Data.T4)
      .floatField('temp_5', data.Data.T5)
      .floatField('temp_6', data.Data.T6)
      .floatField('temp_7', data.Data.T7)
      .timestamp(new Date(data.timestamp));
    
    this.writeApi.writePoint(point);
  }
  
  async writeSPCData(deviceId: string, data: SPCData) {
    const point = new Point('spc')
      .tag('device_id', deviceId)
      .intField('cycle_number', parseInt(data.Data.CYCN))
      .floatField('cycle_time', parseFloat(data.Data.ECYCT))
      .floatField('injection_velocity_max', parseFloat(data.Data.EIVM))
      .floatField('injection_pressure_max', parseFloat(data.Data.EIPM))
      .timestamp(new Date(data.timestamp));
    
    this.writeApi.writePoint(point);
  }
}
```

### Phase 2: Managed Storage Migration
- **PostgreSQL**: For complex queries and relationships
- **InfluxDB**: For time-series analytics when file-based becomes limiting
- **Redis**: For high-performance caching and pub/sub

---

## 📡 Real-Time Communication & Pub/Sub

### WebSocket Gateway (Replaces Polling)

```typescript
@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket']
})
export class MachineGateway {
  @WebSocketServer() server: Server;
  
  @SubscribeMessage('subscribe-machine')
  async handleSubscription(client: Socket, payload: { deviceId: string }) {
    const room = `machine-${payload.deviceId}`;
    client.join(room);
    
    // Send current status immediately
    const status = await this.machineService.getCurrentStatus(payload.deviceId);
    client.emit('machine-status', status);
  }
  
  // Called by MQTT handler when new data arrives
  broadcastUpdate(deviceId: string, data: any) {
    this.server.to(`machine-${deviceId}`).emit('machine-update', data);
  }
}
```

### MQTT to WebSocket Bridge

```typescript
@Injectable()
export class MQTTService {
  constructor(
    private machineGateway: MachineGateway,
    private cacheService: CacheService
  ) {}
  
  async handleRealtimeMessage(topic: string, message: Buffer) {
    const data = JSON.parse(message.toString());
    const deviceId = data.devId;
    
    // Update cache
    await this.cacheService.setMachineStatus(deviceId, data);
    
    // Broadcast to connected clients immediately
    this.machineGateway.broadcastUpdate(deviceId, data);
    
    // Store to file (async, non-blocking)
    this.storeData(deviceId, data).catch(console.error);
  }
}
```

### In-Memory Caching Strategy

```typescript
@Injectable()
export class CacheService {
  private machineStatusCache = new Map<string, any>();
  private aggregatesCache = new Map<string, any>();
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds
  
  async getMachineStatus(deviceId: string): Promise<MachineStatus | null> {
    const cached = this.machineStatusCache.get(deviceId);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }
    
    // Fallback to database/file
    const data = await this.loadFromStorage(deviceId);
    if (data) {
      this.setMachineStatus(deviceId, data);
    }
    return data;
  }
  
  setMachineStatus(deviceId: string, data: any): void {
    this.machineStatusCache.set(deviceId, {
      data,
      timestamp: Date.now()
    });
  }
  
  // Clean up expired cache entries
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.machineStatusCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.machineStatusCache.delete(key);
      }
    }
  }
}
```

---

## 📊 Cost-Optimized Scaling Scenarios

### Data Volume Optimization

#### Original Estimates (Expensive)
- **Realtime**: 7.6 GB/month per machine (storing everything)
- **Total for 20 machines**: ~150 GB/month

#### Optimized Estimates (Cost-Effective)
- **Realtime**: 2.3 GB/month per machine (significant-change detection)
- **SPC**: 0.4 GB/month per machine (compressed)
- **Total for 20 machines**: ~54 GB/month (64% reduction)

### Hardware Sizing by Budget

#### Starter Budget (<$30/month)
- **Single VPS**: 2 cores, 4 GB RAM, 50 GB SSD
- **Capacity**: 5-10 machines
- **Storage**: File-based + SQLite

#### Growth Budget ($50-100/month)  
- **Single VPS**: 4 cores, 8 GB RAM, 200 GB SSD
- **Capacity**: 20-30 machines
- **Storage**: PostgreSQL + file-based time-series

#### Scale Budget ($100-200/month)
- **VPS Cluster**: 2x (4 cores, 8 GB RAM, 200 GB SSD)
- **Managed Database**: PostgreSQL + InfluxDB Cloud
- **Capacity**: 50-100 machines
- **Caching**: Redis Cloud

---

## 🖥️ Local Development Workflow

### Minimal Setup

1. **SQLite Database** (no external dependencies):
   ```bash
   # Database auto-created on first run
   npm run start:dev
   ```

2. **File Storage** (auto-created directories):
   ```bash
   mkdir -p data/logs data/timeseries
   ```

3. **MQTT Broker**:
   ```bash
   docker run -p 1883:1883 eclipse-mosquitto
   ```

### Full Development Setup

1. **Docker Compose** for external services:
   ```bash
   docker compose up -d  # Mosquitto, PostgreSQL, Redis (optional)
   ```

2. **NestJS with hot reload**:
   ```bash
   npm run start:dev
   ```

3. **Test WebSocket connection**:
   ```bash
   # Connect to ws://localhost:3000/socket.io
   # Subscribe to machine updates
   ```

---

## 💡 Cost-Optimization Best Practices

### Data Retention Strategy
```typescript
const retentionPolicy = {
  realtime: {
    raw: '7 days',        // High resolution  
    hourly: '30 days',    // Aggregated
    daily: '1 year'       // Summary
  },
  spc: {
    raw: '30 days',
    daily: '2 years'
  },
  tech: 'permanent'       // Small data, keep forever
};
```

### Intelligent Data Filtering
```typescript
// Only store meaningful changes
const shouldStore = (newData: any, lastData: any): boolean => {
  // Store if status change
  if (newData.Data.STS !== lastData?.Data.STS) return true;
  
  // Store if temperature change > 0.5%
  const tempKeys = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return tempKeys.some(key => {
    const current = parseFloat(newData.Data[key]);
    const previous = parseFloat(lastData?.Data[key] || 0);
    return Math.abs((current - previous) / previous) > 0.005;
  });
};
```

### Caching Strategy
- **Machine Status**: 30-second TTL, in-memory
- **Aggregations**: 5-minute TTL, in-memory  
- **Historical Data**: File-based with compression
- **API Responses**: 1-minute TTL for expensive queries

### WebSocket vs Polling Savings
```
Polling (every 5s):
- 20 machines × 17,280 requests/day = 345,600 requests/day
- High server CPU/memory usage

WebSocket:
- 20 persistent connections
- Updates only when data changes (~80% reduction)
- 95% less server resource usage
```

---

## 🛡️ Security & Reliability

### Phase 1 Security (Free/Low-Cost)
- **MQTT ACLs**: Device-specific topic permissions
- **JWT Authentication**: For API access
- **HTTPS**: Free SSL certificates (Let's Encrypt)
- **Rate Limiting**: Built-in Express rate limiting

### Phase 2 Security (Managed Services)
- **mTLS for MQTT**: Certificate-based device authentication  
- **VPN/Private Network**: Isolate internal traffic
- **Managed Database Security**: Encryption at rest/transit
- **Monitoring/Alerting**: Basic health checks

### Data Backup Strategy
```bash
# Daily automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d)

# Backup SQLite
cp opcua.db "backups/opcua-${DATE}.db"

# Backup time-series files
tar -czf "backups/timeseries-${DATE}.tar.gz" data/

# Keep only last 30 days
find backups/ -name "*.db" -mtime +30 -delete
find backups/ -name "*.tar.gz" -mtime +30 -delete
```

---

## 📈 Migration Path

### Stage 1: Proof of Concept (Month 1)
- Single VPS deployment
- SQLite + file storage  
- WebSocket implementation
- Basic monitoring

### Stage 2: Production Ready (Month 2-3)
- Migrate to PostgreSQL
- Add Redis caching
- Implement retention policies
- Enhanced error handling

### Stage 3: Scale Up (Month 4+)
- MQTT clustering
- InfluxDB for time-series
- Horizontal API scaling
- Advanced analytics

**Migration is incremental** - each stage builds on the previous without major rewrites, keeping costs predictable and risks low.