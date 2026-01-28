import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
// import { RabbitmqService } from './helper/rabbitmq.service';
// import { SubscriberService } from './helper/subscriber.service';
import { UserModule } from './user/user.module';
import { MqttConnectionModule } from './mqtt-connection/mqtt-connection.module';
import { MachineTimestreamModule } from './machine-timestream/machine-timestream.service.module';
import { User } from './user/entities/user.entity';
import { FactoriesModule } from './factories/factories.module';
import { MachinesModule } from './machines/machines.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { Factory } from './factories/entities/factory.entity';
import { Machine } from './machines/entities/machine.entity';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/strategies/auth.guard';
import { UserOwnershipGuard } from './auth/strategies/user.ownership.guard';
import { InfluxDBModule } from './influxdb/influxdb.module';
import { RedisModule } from './redis/redis.module';
import { WebSocketModule } from './websocket/websocket.module';
import { MqttProcessorModule } from './mqtt-processor/mqtt-processor.module';
import { MockDataModule } from './mock-data/mock-data.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DemoModule } from './demo/demo.module';
import { DebugModule } from './debug/debug.module';
import { ThrottlerModule } from '@nestjs/throttler';
@Module({
  imports: [
    // Configuration Module (global)
    AppConfigModule,

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database Connection (PostgreSQL - replaces MySQL)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.postgres.host'),
        port: configService.get('database.postgres.port'),
        username: configService.get('database.postgres.username'),
        password: configService.get('database.postgres.password'),
        database: configService.get('database.postgres.database'),
        entities: [User, Factory, Machine],
        synchronize:
          configService.get('database.postgres.synchronize') ??
          configService.get('app.environment') !== 'production',
        autoLoadEntities: true,
        // Disable SSL for Docker Compose deployments (local PostgreSQL)
        // Enable SSL only for managed PostgreSQL services (AWS RDS, etc.)
        ssl:
          process.env.POSTGRES_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),

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

    // Application Modules
    UserModule,
    AuthModule,
    FactoriesModule,
    MachinesModule,
    SubscriptionModule,
    MqttConnectionModule,
    MachineTimestreamModule,

    // Demo MQTT Server Integration Modules
    InfluxDBModule,
    RedisModule,
    WebSocketModule,
    MqttProcessorModule,
    MockDataModule,

    // Demo & Health Monitoring Modules
    HealthModule,
    DemoModule,

    // Development Debug Module (remove in production)
    DebugModule,
    SPCSeriesModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserOwnershipGuard,
    },
  ],
  // providers: [SubscriberService],
})
export class AppModule {}
