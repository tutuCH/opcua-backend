import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  InfluxDBService,
  SPCData,
  RealtimeData,
} from '../influxdb/influxdb.service';

@Injectable()
export class LatestDataCacheService {
  private readonly logger = new Logger(LatestDataCacheService.name);
  private readonly CACHE_TTL_SECONDS = 10; // 10 seconds
  private readonly MAX_CACHE_SIZE = 50; // Keep last 50 points per device per type

  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
  ) {}

  async getLatestSPCData(deviceId: string, count: number = 10): Promise<any[]> {
    try {
      const cacheKey = `latest:${deviceId}:spc`;
      const cached = await this.getFromCache(cacheKey);

      if (cached && cached.length > 0) {
        this.logger.debug(
          `Cache hit for latest SPC data of device ${deviceId}`,
        );
        return cached.slice(0, count);
      }

      this.logger.debug(
        `Cache miss for latest SPC data of device ${deviceId}, fetching from InfluxDB`,
      );

      const data = await this.influxDbService.querySPCData(deviceId, '-1h');

      if (!data || data.length === 0) {
        return [];
      }

      const latestData = data.slice(-count);

      await this.saveToCache(cacheKey, latestData);

      return latestData;
    } catch (error) {
      this.logger.error(
        `Failed to get latest SPC data for device ${deviceId}:`,
        error,
      );
      throw error;
    }
  }

  async getLatestRealtimeData(
    deviceId: string,
    count: number = 10,
  ): Promise<any[]> {
    try {
      const cacheKey = `latest:${deviceId}:realtime`;
      const cached = await this.getFromCache(cacheKey);

      if (cached && cached.length > 0) {
        this.logger.debug(
          `Cache hit for latest realtime data of device ${deviceId}`,
        );
        return cached.slice(0, count);
      }

      this.logger.debug(
        `Cache miss for latest realtime data of device ${deviceId}, fetching from InfluxDB`,
      );

      const data = await this.influxDbService.queryRealtimeData(
        deviceId,
        '-1h',
      );

      if (!data || data.length === 0) {
        return [];
      }

      const latestData = data.slice(-count);

      await this.saveToCache(cacheKey, latestData);

      return latestData;
    } catch (error) {
      this.logger.error(
        `Failed to get latest realtime data for device ${deviceId}:`,
        error,
      );
      throw error;
    }
  }

  async updateCacheWithNewSPCData(
    deviceId: string,
    data: SPCData,
  ): Promise<void> {
    try {
      const cacheKey = `latest:${deviceId}:spc`;
      const cached = (await this.getFromCache(cacheKey)) || [];

      const updated = [...cached, data].slice(-this.MAX_CACHE_SIZE);

      await this.saveToCache(cacheKey, updated);

      this.logger.debug(
        `Updated latest SPC cache for device ${deviceId}, now has ${updated.length} points`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update SPC cache for device ${deviceId}:`,
        error,
      );
    }
  }

  async updateCacheWithNewRealtimeData(
    deviceId: string,
    data: RealtimeData,
  ): Promise<void> {
    try {
      const cacheKey = `latest:${deviceId}:realtime`;
      const cached = (await this.getFromCache(cacheKey)) || [];

      const updated = [...cached, data].slice(-this.MAX_CACHE_SIZE);

      await this.saveToCache(cacheKey, updated);

      this.logger.debug(
        `Updated latest realtime cache for device ${deviceId}, now has ${updated.length} points`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update realtime cache for device ${deviceId}:`,
        error,
      );
    }
  }

  async invalidateCache(
    deviceId: string,
    type: 'spc' | 'realtime',
  ): Promise<void> {
    try {
      const cacheKey = `latest:${deviceId}:${type}`;
      await this.redisService.del(cacheKey);
      this.logger.debug(
        `Invalidated cache for device ${deviceId}, type ${type}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache for device ${deviceId}:`,
        error,
      );
    }
  }

  async invalidateAllCacheForDevice(deviceId: string): Promise<void> {
    try {
      await this.invalidateCache(deviceId, 'spc');
      await this.invalidateCache(deviceId, 'realtime');
      this.logger.log(`Invalidated all cache for device ${deviceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate all cache for device ${deviceId}:`,
        error,
      );
    }
  }

  private async getFromCache<T>(cacheKey: string): Promise<T[] | null> {
    try {
      const cached = await this.redisService.get<T[]>(cacheKey);
      return cached || null;
    } catch (error) {
      this.logger.error(`Failed to get from cache: ${cacheKey}`, error);
      return null;
    }
  }

  private async saveToCache<T>(cacheKey: string, data: T[]): Promise<void> {
    try {
      await this.redisService.set(cacheKey, data, this.CACHE_TTL_SECONDS);
      this.logger.debug(`Saved data to cache: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Failed to save to cache: ${cacheKey}`, error);
    }
  }
}
