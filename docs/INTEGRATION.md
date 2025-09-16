# OPC UA Dashboard - Demo MQTT Server Integration

This document explains how the main NestJS application integrates with the demoMqttServer infrastructure, the migration from MySQL to PostgreSQL, and how to use the enhanced demo environment.

## 🔄 Migration Overview

### Database Migration: MySQL → PostgreSQL
The application has been updated to use PostgreSQL instead of MySQL while preserving all existing functionality:

**Before (MySQL):**
```typescript
TypeOrmModule.forRoot({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: 'root',
  database: 'opcuadashboard',
  // ...
})
```

**After (PostgreSQL with Configuration Management):**
```typescript
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.get('database.postgres.host'),
    port: configService.get('database.postgres.port'),
    // ...
  })
})
```

### Architecture Integration

The main application now integrates with the demoMqttServer infrastructure:

```
Main NestJS Application
├── PostgreSQL (Entity Management)
├── InfluxDB (Time-Series Data) 
├── Redis (Caching & Message Queue)
├── MQTT Processor (Message Pipeline)
├── WebSocket Gateway (Real-time Communication)
└── Mock Data Generator (Demo Data)
    ↕
Docker Compose Infrastructure (demoMqttServer)
├── PostgreSQL Container
├── InfluxDB Container  
├── Redis Container
├── Mosquitto MQTT Broker
└── Mock Data Generator Container
```

## 🚀 Quick Start Guide

### 1. Start Demo Environment
```bash
# Start all infrastructure services
npm run demo:start

# Configure environment (copies demoMqttServer/.env to main .env)
npm run demo:setup

# Start the main application
npm run start:dev
```

### 2. Alternative: All-in-One Command
```bash
# Start demo infrastructure and main application
npm run demo:dev
```

### 3. Verify Integration
```bash
# Check system health
curl http://localhost:3000/health

# Check demo status
curl http://localhost:3000/demo/status

# Check all machines
curl http://localhost:3000/demo/machines
```

## 📊 New Endpoints

### Health Check Endpoints
- `GET /health` - Overall system health
- `GET /health/database` - PostgreSQL connection status
- `GET /health/influxdb` - InfluxDB connection status  
- `GET /health/redis` - Redis connection status
- `GET /health/mqtt` - MQTT broker status
- `GET /health/websocket` - WebSocket gateway status
- `GET /health/demo` - Complete demo system status
- `GET /health/config` - Configuration status

### Demo Control Endpoints
- `GET /demo/status` - Demo system overview
- `GET /demo/machines` - List all machines with status
- `GET /demo/machines/:deviceId/status` - Individual machine status
- `GET /demo/machines/:deviceId/realtime` - Real-time data from InfluxDB
- `GET /demo/machines/:deviceId/spc` - SPC data from InfluxDB
- `GET /demo/queue/status` - Message queue status
- `GET /demo/websocket/status` - WebSocket connections status
- `POST /demo/mock-data/start` - Start mock data generation
- `POST /demo/mock-data/stop` - Stop mock data generation
- `GET /demo/mock-data/status` - Mock data generator status
- `POST /demo/influxdb/flush` - Flush InfluxDB buffers
- `DELETE /demo/cache/clear` - Clear all Redis cache
- `DELETE /demo/cache/clear/:deviceId` - Clear specific machine cache
- `GET /demo/metrics` - System metrics overview

## 🔧 Configuration Management

### Environment Configuration Structure
The application now uses structured configuration management:

```typescript
// Database Configuration
database: {
  postgres: { host, port, username, password, database },
  influxdb: { url, token, org, bucket },
  redis: { host, port, password }
}

// Application Configuration  
app: { environment, port, frontendUrl, isDevelopment, isProduction }

// MQTT Configuration
mqtt: { brokerUrl, username, password }

// Mock Data Configuration
mockData: { enabled, machineCount, dataInterval }

// Authentication, Email, AWS, Stripe configurations...
```

### Environment Files Priority
1. `.env.local` (highest priority)
2. `.env` 
3. `.env.${NODE_ENV}` (e.g., `.env.development`)

### Migration Reference
The old MySQL configuration is preserved as comments in `app.module.ts` for reference:

```typescript
// MIGRATION NOTE: Old MySQL Configuration (commented out for reference)
// TypeOrmModule.forRoot({
//   type: 'mysql',
//   host: 'localhost', 
//   port: 3306,
//   username: 'root',
//   password: 'root',
//   database: 'opcuadashboard',
//   entities: [User, Factory, Machine],
//   synchronize: true,
//   autoLoadEntities: true,
// }),
```

## 🔌 Integration Features

### WebSocket Integration
Real-time machine data streaming:

```javascript
// Connect to WebSocket
const socket = io('ws://localhost:3000');

// Subscribe to machine updates
socket.emit('subscribe-machine', { deviceId: 'C01' });

// Listen for real-time updates
socket.on('realtime-update', (data) => {
  console.log('Machine update:', data);
});

socket.on('spc-update', (data) => {
  console.log('SPC cycle data:', data);
});

socket.on('machine-alert', (alert) => {
  console.log('Machine alert:', alert);
});
```

### Data Pipeline Integration
Complete message flow from MQTT to frontend:

```
IMM Machines
    ↓ (MQTT Publish)
Mosquitto Broker
    ↓ (Subscribe)
MQTT Processor Service
    ├─→ Redis Queue (Message Persistence)
    ├─→ PostgreSQL (Tech/Metadata)
    ├─→ InfluxDB (Realtime/SPC Data)
    ├─→ Redis Cache (Machine Status)
    └─→ WebSocket Gateway (Real-time Updates)
        ↓
Frontend Clients
```

### Database Integration Examples

#### Query InfluxDB Data
```typescript
// Get realtime data for last hour
const realtimeData = await this.influxDbService.queryRealtimeData('C01', '-1h');

// Get SPC data for last day
const spcData = await this.influxDbService.querySPCData('C01', '-1d');
```

#### Query PostgreSQL Data
```typescript
// Get machine with factory relationship
const machine = await this.machineRepository.findOne({
  where: { name: 'C01' },
  relations: ['factory']
});
```

#### Cache Operations
```typescript
// Get cached machine status
const status = await this.redisService.getMachineStatus('C01');

// Cache machine data with TTL
await this.redisService.setMachineStatus('C01', data, 30);
```

## 🛠️ Development Workflow

### Daily Development
```bash
# Start demo environment
npm run demo:start

# Start application in watch mode  
npm run start:dev

# View logs in separate terminal
npm run demo:logs

# Stop everything when done
npm run demo:stop
```

### Testing Integration
```bash
# Test health endpoints
curl http://localhost:3000/health
curl http://localhost:3000/health/demo

# Test demo endpoints
curl http://localhost:3000/demo/status
curl http://localhost:3000/demo/machines

# Test WebSocket (using browser console)
const socket = io('ws://localhost:3000');
socket.emit('subscribe-machine', { deviceId: 'C01' });
```

### Debugging

#### Check Service Status
```bash
# Docker services
npm run demo:health

# Application logs
npm run start:dev

# Database connections
curl http://localhost:3000/health/database
curl http://localhost:3000/health/influxdb  
curl http://localhost:3000/health/redis
```

#### Common Issues
1. **Database connection failed**: Check if Docker services are running (`npm run demo:start`)
2. **MQTT not receiving data**: Check if mock data is enabled (`npm run demo:setup`)
3. **WebSocket not connecting**: Check CORS configuration in `main.ts`
4. **InfluxDB errors**: Check InfluxDB token and organization in `.env`

## 🔄 Migration Checklist

If migrating an existing project to this architecture:

### ✅ Database Migration
- [ ] Update database configuration from MySQL to PostgreSQL
- [ ] Update connection strings in `.env`
- [ ] Verify all entities work with PostgreSQL
- [ ] Test existing functionality

### ✅ Infrastructure Integration
- [ ] Set up Docker Compose services
- [ ] Configure InfluxDB for time-series data
- [ ] Set up Redis for caching and message queues  
- [ ] Configure MQTT broker

### ✅ Application Updates
- [ ] Add new modules (InfluxDB, Redis, WebSocket, MQTT Processor)
- [ ] Update configuration management
- [ ] Add health check and demo endpoints
- [ ] Update CORS configuration
- [ ] Test WebSocket functionality

### ✅ Development Workflow
- [ ] Update npm scripts for demo workflow
- [ ] Set up monitoring and debugging tools
- [ ] Update documentation
- [ ] Train team on new architecture

## 📈 Performance Optimizations

### Caching Strategy
- **Machine Status**: 30-second TTL in Redis
- **Database Queries**: Connection pooling and indexes
- **InfluxDB**: Batch writes and retention policies
- **WebSocket**: Room-based subscriptions

### Scaling Considerations
- **Horizontal Scaling**: Multiple NestJS instances behind load balancer
- **Database Scaling**: PostgreSQL read replicas, InfluxDB clustering
- **Message Queue**: Redis clustering or migration to RabbitMQ
- **Monitoring**: Add Prometheus/Grafana for metrics

## 🔒 Production Considerations

### Security
- Change all default passwords in production
- Enable SSL/TLS for all database connections
- Use environment-specific configuration files
- Implement proper authentication for MQTT broker
- Set up VPN or private network for internal communication

### Monitoring
- Set up health check monitoring with alerts
- Implement structured logging with log aggregation
- Monitor database performance and connection pools
- Track WebSocket connection metrics
- Set up backup and disaster recovery procedures

### Deployment
- Use environment-specific Docker Compose files
- Implement CI/CD pipeline for automated deployment
- Set up database migrations for schema changes  
- Use secrets management for sensitive configuration
- Implement proper log rotation and retention

## 🆘 Support & Troubleshooting

### Getting Help
1. Check the health endpoints: `/health` and `/health/demo`
2. Review Docker logs: `npm run demo:logs`
3. Check configuration: `curl http://localhost:3000/health/config`
4. Verify environment variables match between main app and demoMqttServer
5. Ensure all Docker services are running: `npm run demo:health`

### Common Solutions
- **Connection timeouts**: Check if services are starting up (can take 30-60 seconds)
- **Permission denied**: Check Docker permissions and port availability
- **Data not appearing**: Verify mock data is enabled and machines exist in database
- **WebSocket connection failed**: Check CORS configuration and firewall settings

This integration provides a seamless bridge between your existing NestJS application and the powerful demoMqttServer infrastructure, enabling real-time IoT data processing with enterprise-grade reliability and performance.