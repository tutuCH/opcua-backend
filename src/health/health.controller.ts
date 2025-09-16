import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  async getOverallHealth() {
    return this.healthService.getOverallHealth();
  }

  @Get('database')
  @Public()
  async getDatabaseHealth() {
    return this.healthService.getDatabaseHealth();
  }

  @Get('influxdb')
  @Public()
  async getInfluxDBHealth() {
    return this.healthService.getInfluxDBHealth();
  }

  @Get('redis')
  @Public()
  async getRedisHealth() {
    return this.healthService.getRedisHealth();
  }

  @Get('mqtt')
  @Public()
  async getMQTTHealth() {
    return this.healthService.getMQTTHealth();
  }

  @Get('websocket')
  @Public()
  async getWebSocketHealth() {
    return this.healthService.getWebSocketHealth();
  }

  @Get('demo')
  @Public()
  async getDemoSystemStatus() {
    return this.healthService.getDemoSystemStatus();
  }

  @Get('config')
  @Public()
  async getConfigStatus() {
    const environment = this.configService.get('app.environment');
    const isDemoEnabled = this.configService.get('mockData.enabled');

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment,
      demoEnabled: isDemoEnabled,
      services: {
        postgres: {
          host: this.configService.get('database.postgres.host'),
          port: this.configService.get('database.postgres.port'),
          database: this.configService.get('database.postgres.database'),
        },
        influxdb: {
          url: this.configService.get('database.influxdb.url'),
          org: this.configService.get('database.influxdb.org'),
          bucket: this.configService.get('database.influxdb.bucket'),
        },
        redis: {
          host: this.configService.get('database.redis.host'),
          port: this.configService.get('database.redis.port'),
        },
        mqtt: {
          brokerUrl: this.configService.get('mqtt.brokerUrl'),
        },
      },
    };
  }
}
