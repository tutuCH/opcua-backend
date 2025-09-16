import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { MqttProcessorService } from '../mqtt-processor/mqtt-processor.service';
import { MachineGateway } from '../websocket/machine.gateway';
import { MockDataService } from '../mock-data/mock-data.service';

export interface HealthStatus {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  responseTime?: number;
  details?: any;
  error?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: HealthStatus;
    influxdb: HealthStatus;
    redis: HealthStatus;
    mqtt: HealthStatus;
    websocket: HealthStatus;
    mockData?: HealthStatus;
  };
  overallResponseTime: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
    private readonly mqttProcessorService: MqttProcessorService,
    private readonly machineGateway: MachineGateway,
    private readonly mockDataService: MockDataService,
  ) {}

  async getOverallHealth(): Promise<SystemHealth> {
    const startTime = Date.now();

    const [database, influxdb, redis, mqtt, websocket, mockData] =
      await Promise.allSettled([
        this.getDatabaseHealth(),
        this.getInfluxDBHealth(),
        this.getRedisHealth(),
        this.getMQTTHealth(),
        this.getWebSocketHealth(),
        this.getMockDataHealth(),
      ]);

    const services = {
      database: this.getSettledResult(database),
      influxdb: this.getSettledResult(influxdb),
      redis: this.getSettledResult(redis),
      mqtt: this.getSettledResult(mqtt),
      websocket: this.getSettledResult(websocket),
      mockData: this.getSettledResult(mockData),
    };

    const overallResponseTime = Date.now() - startTime;

    // Determine overall status
    const serviceStatuses = Object.values(services).map((s) => s.status);
    const hasError = serviceStatuses.includes('error');
    const hasDegraded = serviceStatuses.includes('degraded');

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (hasError) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      overallResponseTime,
    };
  }

  async getDatabaseHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Test database connection with a simple query
      await this.dataSource.query('SELECT 1');

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          database: this.dataSource.options.database,
          type: this.dataSource.options.type,
          isConnected: this.dataSource.isInitialized,
        },
      };
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getInfluxDBHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Test InfluxDB connection with a simple ping-like query
      await this.influxDbService.flush();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          connected: true,
        },
      };
    } catch (error) {
      this.logger.error('InfluxDB health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getRedisHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const pingResult = await this.redisService.ping();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          ping: pingResult,
          connected: true,
        },
      };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getMQTTHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const isConnected = this.mqttProcessorService.isConnected();
      const stats = await this.mqttProcessorService.getProcessingStats();

      return {
        status: isConnected ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          connected: isConnected,
          processing: stats?.processing || false,
          queueLengths: stats?.queueLengths || {},
        },
      };
    } catch (error) {
      this.logger.error('MQTT health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getWebSocketHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const connectedClients = this.machineGateway.getConnectedClientsCount();
      const subscriptions = this.machineGateway.getMachineSubscriptions();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          connectedClients,
          subscriptions,
          totalSubscriptions: Object.keys(subscriptions).length,
        },
      };
    } catch (error) {
      this.logger.error('WebSocket health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getMockDataHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const stats = this.mockDataService.getGenerationStats();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: stats,
      };
    } catch (error) {
      this.logger.error('Mock data health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async getDemoSystemStatus() {
    const health = await this.getOverallHealth();
    const databaseHealth = await this.getDatabaseHealth();

    // Get machine count from database
    let machineCount = 0;
    try {
      const result = await this.dataSource.query(
        'SELECT COUNT(*) as count FROM machine',
      );
      machineCount = parseInt(result[0]?.count || 0);
    } catch (error) {
      this.logger.error('Failed to get machine count:', error);
    }

    return {
      ...health,
      demo: {
        status: health.status,
        machineCount,
        mockDataEnabled: this.mockDataService.isRunning(),
        integrationStatus: {
          postgresqlIntegration: databaseHealth.status === 'ok',
          influxdbIntegration: health.services.influxdb.status === 'ok',
          redisIntegration: health.services.redis.status === 'ok',
          mqttIntegration: health.services.mqtt.status === 'ok',
          websocketIntegration: health.services.websocket.status === 'ok',
        },
      },
    };
  }

  private getSettledResult(
    settledResult: PromiseSettledResult<HealthStatus>,
  ): HealthStatus {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: settledResult.reason?.message || 'Unknown error',
      };
    }
  }
}
