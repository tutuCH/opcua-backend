# OPC UA Dashboard Demo MQTT Server

This directory contains the demo setup for the OPC UA Dashboard with MQTT integration, featuring PostgreSQL and InfluxDB for optimized data storage.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)

### 1. Start Infrastructure Services

```bash
# Start all services (PostgreSQL, InfluxDB, Redis, Mosquitto, Mock Data Generator)
cd demoMqttServer
docker compose up -d

# Check service health
docker compose ps
```

### 2. Start NestJS Application

```bash
# From the main directory
cd ../

# Copy environment variables
cp demoMqttServer/.env .env

# Install dependencies (if not already done)
npm install

# Start the application in development mode
npm run start:dev
```

### 3. Verify Setup

1. **Check MQTT Messages:**
   ```bash
   # Subscribe to all MQTT messages
   docker exec -it opcua-mosquitto mosquitto_sub -h localhost -t "+/+"
   ```

2. **Check Database Connections:**
   - PostgreSQL: `localhost:5432` (postgres/password)
   - InfluxDB: `http://localhost:8086` (admin/password)
   - Redis: `localhost:6379` (password: password)

3. **Check WebSocket Connection:**
   - Connect to `ws://localhost:3000` 
   - Send message: `{"event": "subscribe-machine", "data": {"deviceId": "C01"}}`

## 📊 Services Overview

### Core Services

| Service | Port | Purpose | Credentials |
|---------|------|---------|-------------|
| PostgreSQL | 5432 | Machine metadata, users, factories | postgres/password |
| InfluxDB | 8086 | Time-series data (realtime/spc) | admin/password |
| Redis | 6379 | Message queue & cache | password: password |
| Mosquitto | 1883, 9001 | MQTT broker | anonymous |

### Application Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| NestJS API | Main application server | Port 3000 |
| Mock Data Generator | Generates demo MQTT data | 3 machines (C01, C02, C03) |
| MQTT Processor | Processes MQTT → Database pipeline | Built into NestJS |
| WebSocket Gateway | Real-time client communication | Built into NestJS |

## 🏗️ Architecture Flow

```
Mock Data Generator
    ↓ (MQTT messages)
Mosquitto Broker
    ↓
MQTT Processor Service
    ├─→ Redis (Message Queue)
    ├─→ PostgreSQL (Tech data)
    ├─→ InfluxDB (Realtime/SPC data)
    └─→ WebSocket Gateway
        ↓
Frontend Clients
```

## 📋 MQTT Topics

The system uses the following MQTT topic structure:

- `<prefix>/{deviceId}/realtime` - Machine status & temperatures (every 5s)
- `<prefix>/{deviceId}/spc` - Cycle data & process parameters (per cycle)
- `<prefix>/{deviceId}/tech` - Setup parameters & recipes (on job change)

By default, the mock generator uses the prefix `/YLCY/IMM`. Set
`MQTT_TOPIC_PREFIX` to override (use an empty value for no prefix).

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=opcua_dashboard

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=dev-token-super-secret-admin-token
INFLUXDB_ORG=opcua-org
INFLUXDB_BUCKET=machine-data

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=password

# Mock Data
ENABLE_MOCK_DATA=true
MOCK_MACHINES_COUNT=3
MOCK_DATA_INTERVAL=5000
MQTT_TOPIC_PREFIX=/YLCY/IMM
```

### Machine Setup

Machines are automatically created from the database initialization script. To add more machines:

1. Add entries to `init-scripts/01-init-database.sql`
2. Restart the PostgreSQL container
3. The mock data generator will automatically detect new machines

## 🔍 Monitoring & Debugging

### Health Checks

```bash
# Check all service health
docker compose ps

# Check individual services
docker compose logs postgres
docker compose logs influxdb
docker compose logs redis
docker compose logs mosquitto
docker compose logs mock-generator
```

### MQTT Debugging

```bash
# Listen to all topics
docker exec -it opcua-mosquitto mosquitto_sub -h localhost -t "#" -v

# Listen to specific machine
docker exec -it opcua-mosquitto mosquitto_sub -h localhost -t "C01/+"

# Publish test message
docker exec -it opcua-mosquitto mosquitto_pub -h localhost -t "C01/realtime" -m '{"test": "message"}'
```

### Database Queries

```bash
# PostgreSQL
docker exec -it opcua-postgres psql -U postgres -d opcua_dashboard -c "SELECT * FROM machine;"

# InfluxDB (via CLI)
docker exec -it opcua-influxdb influx query 'from(bucket:"machine-data") |> range(start: -1h)'
```

### Redis Monitoring

```bash
# Connect to Redis
docker exec -it opcua-redis redis-cli -a password

# Check queue lengths
LLEN mqtt:realtime
LLEN mqtt:spc  
LLEN mqtt:tech

# Check cache
KEYS machine:*:status
```

## 🧪 Development & Testing

### Local Development

```bash
# Start only infrastructure (without mock generator)
docker compose up postgres influxdb redis mosquitto -d

# Run NestJS locally
npm run start:dev

# Generate mock data manually
curl http://localhost:3000/mock/start
```

### Testing WebSocket Connection

```javascript
// Browser console test
const socket = io('ws://localhost:3000');

socket.emit('subscribe-machine', { deviceId: 'C01' });

socket.on('machine-status', (data) => {
  console.log('Machine status:', data);
});

socket.on('realtime-update', (data) => {
  console.log('Realtime update:', data);
});
```

## 📈 Performance & Scaling

### Expected Performance
- **Message Processing:** ~1000 messages/second
- **WebSocket Clients:** ~100 concurrent connections  
- **Data Volume:** ~2-3 GB/month per machine (optimized)
- **Query Response Time:** <100ms for recent data

### Scaling Options
1. **Horizontal Scaling:** Add multiple NestJS instances
2. **Database Scaling:** Use PostgreSQL replicas + InfluxDB clustering
3. **Message Queue:** Scale Redis or migrate to RabbitMQ cluster
4. **Load Balancing:** Add nginx/HAProxy for WebSocket distribution

## 🐛 Troubleshooting

### Common Issues

1. **PostgreSQL Connection Error:**
   - Check if container is running: `docker compose ps`
   - Verify credentials in `.env` file
   - Check database initialization logs: `docker compose logs postgres`

2. **InfluxDB Authentication Error:**
   - Verify token in `.env`: `INFLUXDB_TOKEN`
   - Check InfluxDB setup: `docker compose logs influxdb`
   - Access UI: `http://localhost:8086`

3. **MQTT Connection Issues:**
   - Check Mosquitto broker: `docker compose logs mosquitto`
   - Test with mosquitto_pub/sub commands
   - Verify network connectivity between services

4. **Mock Data Not Generating:**
   - Check `ENABLE_MOCK_DATA=true` in `.env`
   - Verify machines exist in PostgreSQL
   - Check mock generator logs: `docker compose logs mock-generator`

5. **WebSocket Not Working:**
   - Check if NestJS is running on correct port
   - Verify CORS configuration in gateway
   - Test with simple ping/pong message

### Reset Everything

```bash
# Stop all services and remove volumes
docker compose down -v

# Remove all containers and images (nuclear option)
docker compose down --rmi all -v

# Start fresh
docker compose up -d
```

## 📚 Additional Resources

- [NestJS WebSockets Documentation](https://docs.nestjs.com/websockets/gateways)
- [InfluxDB Client Documentation](https://docs.influxdata.com/influxdb/v2.7/api-guide/client-libraries/nodejs/)
- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
- [Redis Commands Reference](https://redis.io/commands)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 🔒 Security Notes

> **Warning:** This is a development setup. For production deployment:
> - Change all default passwords
> - Enable authentication for MQTT broker
> - Use environment-specific SSL certificates
> - Implement proper network security (VPC, firewall rules)
> - Enable encryption for data at rest and in transit
