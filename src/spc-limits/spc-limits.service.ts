import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';

export interface SPCLimits {
  mean: number;
  stdDev: number;
  ucl: number;
  lcl: number;
  n: number;
  calculatedAt: string;
  expiresAt: string;
  isCached: boolean;
}

export interface SPCLimitsResponse {
  limits: Record<string, SPCLimits>;
  metadata: {
    deviceId: string;
    calculationTime: string;
    cacheKey: string;
  };
}

@Injectable()
export class SPCLimitsService {
  private readonly logger = new Logger(SPCLimitsService.name);
  private readonly CACHE_TTL_SECONDS = 1800; // 30 minutes
  private readonly REFRESH_THRESHOLD_SECONDS = 300; // 5 minutes before expiration

  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
  ) {}

  async getLimits(
    deviceId: string,
    fields: string[],
    lookback: string = '24h',
    sigma: number = 3,
    forceRecalculate: boolean = false,
  ): Promise<SPCLimitsResponse> {
    const startTime = Date.now();
    try {
      const t0 = Date.now();
      const cacheKey = this.getCacheKey(deviceId, fields, lookback, sigma);
      this.logger.debug(`[PERF] Get limits request: ${cacheKey}`);

      const cached = await this.getFromCache(cacheKey);
      const t1 = Date.now();

      if (cached && !forceRecalculate) {
        const needsRefresh = await this.needsRefresh(cacheKey, cached);
        if (!needsRefresh) {
          const cachedWithFlag = Object.fromEntries(
            Object.entries(cached).map(([key, value]) => [
              key,
              { ...value, isCached: true },
            ]),
          );
          this.logger.debug(
            `[PERF] Cache hit for device ${deviceId}, total: ${Date.now() - startTime}ms`,
          );
          return {
            limits: cachedWithFlag,
            metadata: {
              deviceId,
              calculationTime: `${Date.now() - startTime}ms`,
              cacheKey,
            },
          };
        }
      }

      this.logger.debug(
        `[PERF] Cache miss/refresh for device ${deviceId}, elapsed: ${Date.now() - t0}ms`,
      );

      const limits = await this.calculateLimits(
        deviceId,
        fields,
        lookback,
        sigma,
      );
      const t2 = Date.now();

      await this.saveToCache(cacheKey, limits);
      const t3 = Date.now();

      this.logger.debug(
        `[PERF] Total request completed: ${Date.now() - startTime}ms | breakdown: cache: ${t1 - t0}ms, calculate: ${t2 - t1}ms, save: ${t3 - t2}ms`,
      );

      return {
        limits,
        metadata: {
          deviceId,
          calculationTime: `${Date.now() - startTime}ms`,
          cacheKey,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to get SPC limits for device ${deviceId}:`,
        error,
      );
      throw error;
    }
  }

  async updateLimitsWithNewPoint(
    deviceId: string,
    field: string,
    value: number,
    lookback: string = '24h',
    sigma: number = 3,
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(deviceId, [field], lookback, sigma);
      const cached = await this.getFromCache(cacheKey);

      if (!cached || !cached[field]) {
        return;
      }

      const currentLimits = cached[field];
      const newLimits = this.incrementalUpdate(currentLimits, value);

      cached[field] = newLimits;
      await this.saveToCache(cacheKey, cached);

      this.logger.debug(
        `Incrementally updated limits for device ${deviceId}, field ${field}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to incrementally update limits for device ${deviceId}:`,
        error,
      );
    }
  }

  private async calculateLimits(
    deviceId: string,
    fields: string[],
    lookback: string,
    sigma: number,
  ): Promise<Record<string, SPCLimits>> {
    const t0 = Date.now();
    const aggregated = await this.influxDbService.querySPCLimitsAggregated(
      deviceId,
      lookback,
      fields,
    );
    const t1 = Date.now();

    this.logger.debug(
      `[PERF] InfluxDB aggregation: ${t1 - t0}ms for fields: ${fields.join(', ')}`,
    );

    if (!aggregated || Object.keys(aggregated).length === 0) {
      throw new HttpException(
        'No data found for SPC limits calculation. Please ensure SPC data is available for the specified device and time range.',
        HttpStatus.NOT_FOUND,
      );
    }

    const limits: Record<string, SPCLimits> = {};

    for (const field of fields) {
      const stats = aggregated[field];
      if (!stats || stats.count < 2) {
        throw new HttpException(
          `Insufficient data points for field ${field}. Need at least 2 points, got ${stats?.count || 0}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const mean = stats.mean;
      const stdDev = stats.stdDev;

      limits[field] = {
        mean,
        stdDev,
        ucl: mean + sigma * stdDev,
        lcl: mean - sigma * stdDev,
        n: stats.count,
        calculatedAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + this.CACHE_TTL_SECONDS * 1000,
        ).toISOString(),
        isCached: false,
      };
    }

    const t2 = Date.now();
    this.logger.debug(`[PERF] Total limits calculation: ${t2 - t0}ms`);

    return limits;
  }

  private incrementalUpdate(current: SPCLimits, newValue: number): SPCLimits {
    const n = current.n + 1;
    const oldMean = current.mean;
    const newMean = oldMean + (newValue - oldMean) / n;

    const newStdDev = Math.sqrt(
      (current.stdDev * current.stdDev * (current.n - 1) +
        (newValue - oldMean) * (newValue - newMean)) /
        (n - 1),
    );

    const sigma = (current.ucl - current.mean) / current.stdDev;

    return {
      mean: newMean,
      stdDev: newStdDev,
      ucl: newMean + sigma * newStdDev,
      lcl: newMean - sigma * newStdDev,
      n,
      calculatedAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + this.CACHE_TTL_SECONDS * 1000,
      ).toISOString(),
      isCached: true,
    };
  }

  private async getFromCache(
    cacheKey: string,
  ): Promise<Record<string, SPCLimits> | null> {
    try {
      return await this.redisService.get<Record<string, SPCLimits>>(cacheKey);
    } catch (error) {
      this.logger.error(`Failed to get from cache: ${cacheKey}`, error);
      return null;
    }
  }

  private async saveToCache(
    cacheKey: string,
    limits: Record<string, SPCLimits>,
  ): Promise<void> {
    try {
      await this.redisService.set(cacheKey, limits, this.CACHE_TTL_SECONDS);
      this.logger.debug(`Saved limits to cache: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Failed to save to cache: ${cacheKey}`, error);
    }
  }

  private async needsRefresh(
    cacheKey: string,
    limits: Record<string, SPCLimits>,
  ): Promise<boolean> {
    try {
      const firstField = Object.keys(limits)[0];
      if (!firstField) return true;

      const expiresAt = new Date(limits[firstField].expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiration = expiresAt - now;

      return timeUntilExpiration <= this.REFRESH_THRESHOLD_SECONDS * 1000;
    } catch (error) {
      this.logger.error(
        `Failed to check if cache needs refresh: ${cacheKey}`,
        error,
      );
      return true;
    }
  }

  private getCacheKey(
    deviceId: string,
    fields: string[],
    lookback: string,
    sigma: number,
  ): string {
    const fieldsStr = fields.sort().join(',');
    return `spc:limits:${deviceId}:${fieldsStr}:${lookback}:sigma${sigma}`;
  }

  private calculateMean(values: number[]): number {
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private calculateStdDev(values: number[], mean: number): number {
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const avgSquaredDiff =
      squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  async invalidateCache(deviceId: string, fields: string[]): Promise<void> {
    const lookbacks = ['1h', '6h', '24h', '7d'];
    const sigmas = [2, 3, 4];

    for (const lookback of lookbacks) {
      for (const sigma of sigmas) {
        const cacheKey = this.getCacheKey(deviceId, fields, lookback, sigma);
        await this.redisService.del(cacheKey);
      }
    }

    this.logger.log(
      `Invalidated cache for device ${deviceId}, fields: ${fields.join(', ')}`,
    );
  }
}
