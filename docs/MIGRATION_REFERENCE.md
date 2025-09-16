# Migration Reference: MySQL to PostgreSQL

This document preserves the original MySQL configuration for reference during migration.

## Original MySQL Dependencies

### Package.json Dependencies (REMOVED)
```json
{
  "dependencies": {
    "mysql2": "^3.11.0"
  }
}
```

**Status**: ✅ Removed from package.json  
**Replaced with**: `pg: "^8.16.3"` for PostgreSQL support

## Original MySQL Configuration (COMMENTED OUT)

### App Module Configuration
**File**: `src/app.module.ts`

```typescript
// ORIGINAL MYSQL CONFIGURATION (before migration)
TypeOrmModule.forRoot({
  type: 'mysql',
  host: 'localhost', 
  port: 3306,
  username: 'root',
  password: 'root',
  database: 'opcuadashboard',
  entities: [User, Factory, Machine],
  synchronize: true,
  autoLoadEntities: true,
})
```

**Status**: ✅ Commented out in app.module.ts  
**Replaced with**: PostgreSQL configuration using ConfigService

## Migration Changes Made

### 1. Database Configuration
**Before**:
```typescript
type: 'mysql',
host: 'localhost',
port: 3306,
username: 'root', 
password: 'root',
database: 'opcuadashboard'
```

**After**:
```typescript
type: 'postgres',
host: configService.get('database.postgres.host'),
port: configService.get('database.postgres.port'),
username: configService.get('database.postgres.username'),
password: configService.get('database.postgres.password'),
database: configService.get('database.postgres.database')
```

### 2. Environment Variables
**Before**: No database environment variables

**After**: Structured configuration in `.env`:
```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=opcua_dashboard
```

### 3. Configuration Management
**Before**: Direct configuration in app.module.ts

**After**: Structured configuration system:
- `src/config/configuration.ts` - Configuration schemas
- `src/config/config.module.ts` - Global configuration module
- Environment-based configuration loading

## Entity Compatibility

All existing entities (User, Factory, Machine) are compatible with PostgreSQL:
- ✅ **User Entity**: No changes required
- ✅ **Factory Entity**: No changes required  
- ✅ **Machine Entity**: No changes required

TypeORM automatically handles the differences between MySQL and PostgreSQL dialects.

## Data Migration (if needed)

If you need to migrate existing MySQL data to PostgreSQL:

### 1. Export from MySQL
```bash
mysqldump -u root -p opcuadashboard > mysql_backup.sql
```

### 2. Convert to PostgreSQL format
```bash
# Use tools like mysql2postgres or pg_loader
# Or manually adjust data types and syntax
```

### 3. Import to PostgreSQL
```bash
psql -U postgres -d opcua_dashboard < postgres_backup.sql
```

## Rollback Procedure (if needed)

To rollback to MySQL temporarily:

### 1. Restore MySQL dependency
```bash
npm install mysql2@^3.11.0
```

### 2. Uncomment MySQL configuration in app.module.ts
```typescript
TypeOrmModule.forRoot({
  type: 'mysql',
  host: 'localhost', 
  port: 3306,
  username: 'root',
  password: 'root',
  database: 'opcuadashboard',
  entities: [User, Factory, Machine],
  synchronize: true,
  autoLoadEntities: true,
})
```

### 3. Comment out PostgreSQL configuration
### 4. Update environment variables
### 5. Restart application

## Testing Migration

### Verify PostgreSQL Integration
```bash
# Check database health
curl http://localhost:3000/health/database

# Verify entities loaded
curl http://localhost:3000/demo/machines

# Test CRUD operations
curl -X POST http://localhost:3000/machines
```

### Performance Comparison
- **MySQL**: Familiar, well-established
- **PostgreSQL**: Better JSON support, more advanced features, better performance at scale

## Additional Notes

- All business logic remains unchanged
- API endpoints continue to work the same way
- Frontend integration is transparent
- Demo environment provides additional testing capabilities
- Production deployment strategy remains the same

This migration enhances the application with:
- Better database features (PostgreSQL)
- Real-time capabilities (InfluxDB + WebSocket)
- Improved caching (Redis)
- Complete IoT integration (MQTT processing)
- Enhanced monitoring and debugging tools