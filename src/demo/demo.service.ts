import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { MqttProcessorService } from '../mqtt-processor/mqtt-processor.service';
import { MachineGateway } from '../websocket/machine.gateway';
import { MockDataService } from '../mock-data/mock-data.service';
import { Machine } from '../machines/entities/machine.entity';
import { HealthService } from '../health/health.service';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
    private readonly mqttProcessorService: MqttProcessorService,
    private readonly machineGateway: MachineGateway,
    private readonly mockDataService: MockDataService,
    private readonly healthService: HealthService,
  ) {}

  async getDemoStatus() {
    const health = await this.healthService.getOverallHealth();
    const machines = await this.machineRepository.count();

    return {
      status: 'active',
      timestamp: new Date().toISOString(),
      environment: 'demo',
      machineCount: machines,
      mockDataRunning: this.mockDataService.isRunning(),
      systemHealth: health.status,
      services: {
        postgresql: health.services.database.status,
        influxdb: health.services.influxdb.status,
        redis: health.services.redis.status,
        mqtt: health.services.mqtt.status,
        websocket: health.services.websocket.status,
      },
      integration: 'demoMqttServer',
    };
  }

  async getMachines() {
    try {
      const machines = await this.machineRepository.find({
        relations: ['factory'],
      });

      const machineStatuses = await Promise.all(
        machines.map(async (machine) => {
          const cachedStatus = await this.redisService.getMachineStatus(
            machine.machineName,
          );
          return {
            id: machine.machineId,
            name: machine.machineName,
            index: machine.machineIndex,
            status: machine.status,
            factory: machine.factory?.factoryName,
            lastDataReceived: cachedStatus?.lastUpdated || null,
            isOnline: cachedStatus ? true : false,
          };
        }),
      );

      return {
        machines: machineStatuses,
        total: machines.length,
        online: machineStatuses.filter((m) => m.isOnline).length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get machines:', error);
      throw error;
    }
  }

  async getMachineStatus(deviceId: string) {
    try {
      const machine = await this.machineRepository.findOne({
        where: { machineName: deviceId },
        relations: ['factory'],
      });

      if (!machine) {
        return {
          error: 'Machine not found',
          deviceId,
          timestamp: new Date().toISOString(),
        };
      }

      const cachedStatus = await this.redisService.getMachineStatus(deviceId);
      const techConfig = await this.redisService.get(
        `machine:${deviceId}:tech_config`,
      );

      return {
        machine: {
          id: machine.machineId,
          name: machine.machineName,
          factory: machine.factory?.factoryName,
        },
        status: cachedStatus || null,
        techConfiguration: techConfig || null,
        lastUpdated: cachedStatus?.lastUpdated || null,
        isOnline: cachedStatus ? true : false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get machine status for ${deviceId}:`, error);
      throw error;
    }
  }

  async getRealtimeData(deviceId: string, timeRange: string = '-1h') {
    try {
      const data = await this.influxDbService.queryRealtimeData(
        deviceId,
        timeRange,
      );

      return {
        deviceId,
        timeRange,
        data,
        dataPoints: data.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get realtime data for ${deviceId}:`, error);
      throw error;
    }
  }

  async getSPCData(deviceId: string, timeRange: string = '-1h') {
    try {
      const data = await this.influxDbService.querySPCData(deviceId, timeRange);

      return {
        deviceId,
        timeRange,
        data,
        cycles: data.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get SPC data for ${deviceId}:`, error);
      throw error;
    }
  }

  async getQueueStatus() {
    try {
      const realtimeQueueLength =
        await this.redisService.getQueueLength('mqtt:realtime');
      const spcQueueLength = await this.redisService.getQueueLength('mqtt:spc');
      const techQueueLength =
        await this.redisService.getQueueLength('mqtt:tech');

      return {
        status: 'active',
        queues: {
          realtime: {
            length: realtimeQueueLength,
            name: 'mqtt:realtime',
          },
          spc: {
            length: spcQueueLength,
            name: 'mqtt:spc',
          },
          tech: {
            length: techQueueLength,
            name: 'mqtt:tech',
          },
        },
        totalMessages: realtimeQueueLength + spcQueueLength + techQueueLength,
        processor: {
          connected: this.mqttProcessorService.isConnected(),
          processing: true,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get queue status:', error);
      throw error;
    }
  }

  async getWebSocketStatus() {
    try {
      const connectedClients = this.machineGateway.getConnectedClientsCount();
      const subscriptions = this.machineGateway.getMachineSubscriptions();

      return {
        status: 'active',
        connectedClients,
        subscriptions,
        totalSubscriptions: Object.keys(subscriptions).length,
        activeRooms: Object.keys(subscriptions).map(
          (deviceId) => `machine-${deviceId}`,
        ),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get WebSocket status:', error);
      throw error;
    }
  }

  async startMockData() {
    try {
      await this.mockDataService.startGeneration();

      return {
        status: 'started',
        message: 'Mock data generation started',
        isRunning: this.mockDataService.isRunning(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to start mock data:', error);
      throw error;
    }
  }

  async stopMockData() {
    try {
      this.mockDataService.stopGeneration();

      return {
        status: 'stopped',
        message: 'Mock data generation stopped',
        isRunning: this.mockDataService.isRunning(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to stop mock data:', error);
      throw error;
    }
  }

  async getMockDataStatus() {
    try {
      const stats = this.mockDataService.getGenerationStats();

      return {
        ...stats,
        status: stats.isGenerating ? 'running' : 'stopped',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get mock data status:', error);
      throw error;
    }
  }

  async flushInfluxDB() {
    try {
      await this.influxDbService.flush();

      return {
        status: 'flushed',
        message: 'InfluxDB write buffer flushed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to flush InfluxDB:', error);
      throw error;
    }
  }

  async clearCache() {
    try {
      // Clear all machine status caches
      const machines = await this.machineRepository.find();
      const clearPromises = machines.map((machine) =>
        this.redisService.del(`machine:${machine.machineName}:status`),
      );

      await Promise.all(clearPromises);

      return {
        status: 'cleared',
        message: 'All machine caches cleared',
        machinesCleared: machines.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  async clearMachineCache(deviceId: string) {
    try {
      await this.redisService.del(`machine:${deviceId}:status`);
      await this.redisService.del(`machine:${deviceId}:tech_config`);

      return {
        status: 'cleared',
        message: `Cache cleared for machine ${deviceId}`,
        deviceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to clear cache for ${deviceId}:`, error);
      throw error;
    }
  }

  async getMetrics() {
    try {
      const health = await this.healthService.getOverallHealth();
      const machines = await this.getMachines();
      const queueStatus = await this.getQueueStatus();
      const websocketStatus = await this.getWebSocketStatus();

      return {
        system: {
          health: health.status,
          responseTime: health.overallResponseTime,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        },
        machines: {
          total: machines.total,
          online: machines.online,
          offline: machines.total - machines.online,
        },
        queues: {
          totalMessages: queueStatus.totalMessages,
          processingRate: 'N/A', // Could be calculated with time-based metrics
        },
        websocket: {
          connectedClients: websocketStatus.connectedClients,
          totalSubscriptions: websocketStatus.totalSubscriptions,
        },
        mockData: {
          enabled: this.mockDataService.isRunning(),
          stats: this.mockDataService.getGenerationStats(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get metrics:', error);
      throw error;
    }
  }

  async getRecentLogs(lines: number = 100) {
    // This is a simplified implementation
    // In a real system, you might use a logging service like Winston with file transport
    return {
      message: 'Log retrieval not implemented in this demo',
      suggestion: 'Use "npm run demo:logs" to view Docker Compose logs',
      lines,
      timestamp: new Date().toISOString(),
    };
  }
}
