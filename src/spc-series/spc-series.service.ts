import { Injectable, Logger } from '@nestjs/common';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { SPC_FIELD_UNITS } from './constants/spc-units';
import { AllowedSPCField } from '../machines/constants/spc-fields';

export type SPCWindowPreset =
  | 'last_15m'
  | 'last_1h'
  | 'last_6h'
  | 'last_24h'
  | 'last_3d'
  | 'last_7d'
  | 'last_1mo'
  | 'custom';

export type SPCDownsampleStrategy = 'none' | 'avg' | 'minmax';

export interface SPCSeriesWindow {
  mode: SPCWindowPreset;
  start: string;
  end: string;
}

export interface SPCSeriesSampling {
  limit: number;
  returned: number;
  downsample: SPCDownsampleStrategy;
  intervalMs: number;
}

export interface SPCSeriesStats {
  count: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
  p95: number;
}

export interface SPCSeriesLimits {
  ucl: number;
  lcl: number;
  mean: number;
  sigma: number;
  method: string;
}

export interface SPCSeriesResponse {
  machineId: number;
  field: AllowedSPCField;
  unit: string;
  window: SPCSeriesWindow;
  sampling: SPCSeriesSampling;
  series: Array<{ ts: string; value: number }>;
  stats: SPCSeriesStats | null;
  limits: SPCSeriesLimits | null;
  meta: {
    source: string;
    generatedAt: string;
  };
}

@Injectable()
export class SPCSeriesService {
  private readonly logger = new Logger(SPCSeriesService.name);
  private readonly MAX_POINTS = 100;
  private readonly WINDOW_PRESETS: Record<SPCWindowPreset, string> = {
    last_15m: '-15m',
    last_1h: '-1h',
    last_6h: '-6h',
    last_24h: '-24h',
    last_3d: '-3d',
    last_7d: '-7d',
    last_1mo: '-30d',
    custom: 'custom',
  };

  constructor(private readonly influxDbService: InfluxDBService) {}

  async getSeries(
    machineName: string,
    machineId: number,
    field: AllowedSPCField,
    window: SPCWindowPreset,
    start?: string,
    end?: string,
    limit: number = this.MAX_POINTS,
    order: 'asc' | 'desc' = 'asc',
    includeStats: boolean = true,
    includeLimits: boolean = true,
    downsample: SPCDownsampleStrategy = 'none',
  ): Promise<SPCSeriesResponse> {
    const windowRange = this.resolveWindow(window, start, end);
    const safeLimit = Math.min(Math.max(limit, 20), this.MAX_POINTS);
    const intervalMs = this.calculateInterval(
      windowRange.start,
      windowRange.end,
      safeLimit,
    );

    const series = await this.querySeries(
      machineName,
      field,
      windowRange.start,
      windowRange.end,
      safeLimit,
      order,
      downsample,
    );

    const values = series.map((point) => point.value);

    const stats = includeStats ? this.calculateStats(values) : null;
    const limits =
      includeLimits && stats
        ? this.calculateLimits(stats.mean, stats.stdDev)
        : null;

    return {
      machineId,
      field,
      unit: SPC_FIELD_UNITS[field] || 'unit',
      window: windowRange,
      sampling: {
        limit: safeLimit,
        returned: series.length,
        downsample,
        intervalMs,
      },
      series,
      stats,
      limits,
      meta: {
        source: 'influxdb',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private resolveWindow(
    window: SPCWindowPreset,
    start?: string,
    end?: string,
  ): SPCSeriesWindow {
    const now = new Date();
    const preset = this.WINDOW_PRESETS[window] || this.WINDOW_PRESETS.last_1h;

    if (window === 'custom') {
      if (!start || !end) {
        throw new Error('Custom window requires start and end');
      }
      return { mode: window, start, end };
    }

    const endTime = now.toISOString();
    const startTime = this.subtractRange(now, preset).toISOString();

    return {
      mode: window,
      start: startTime,
      end: endTime,
    };
  }

  private subtractRange(date: Date, range: string): Date {
    const match = range.match(/-(\d+)([smhd])/);
    if (!match) return date;
    const value = parseInt(match[1]);
    const unit = match[2];

    const result = new Date(date.getTime());
    switch (unit) {
      case 's':
        result.setSeconds(result.getSeconds() - value);
        break;
      case 'm':
        result.setMinutes(result.getMinutes() - value);
        break;
      case 'h':
        result.setHours(result.getHours() - value);
        break;
      case 'd':
        result.setDate(result.getDate() - value);
        break;
      default:
        break;
    }
    return result;
  }

  private calculateInterval(start: string, end: string, limit: number): number {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const duration = Math.max(endTime - startTime, 0);
    return Math.max(Math.floor(duration / limit), 1000);
  }

  private async querySeries(
    machineName: string,
    field: AllowedSPCField,
    start: string,
    end: string,
    limit: number,
    order: 'asc' | 'desc',
    downsample: SPCDownsampleStrategy,
  ): Promise<Array<{ ts: string; value: number }>> {
    const raw = await this.influxDbService.querySPCSeries(
      machineName,
      field,
      start,
      end,
      limit,
      order,
    );

    if (!raw.length) {
      return [];
    }

    const points = raw
      .map((row) => ({
        ts: row._time as string,
        value: Number(row._value),
      }))
      .filter((point) => !Number.isNaN(point.value));

    if (downsample === 'none' || points.length <= limit) {
      return points;
    }

    if (downsample === 'avg') {
      return this.downsampleAverage(points, limit);
    }

    return this.downsampleMinMax(points, limit);
  }

  private downsampleAverage(
    points: Array<{ ts: string; value: number }>,
    limit: number,
  ): Array<{ ts: string; value: number }> {
    const bucketSize = Math.ceil(points.length / limit);
    const buckets: Array<{ ts: string; value: number }> = [];

    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      const avg = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;
      buckets.push({ ts: bucket[0].ts, value: avg });
    }

    return buckets;
  }

  private downsampleMinMax(
    points: Array<{ ts: string; value: number }>,
    limit: number,
  ): Array<{ ts: string; value: number }> {
    const bucketSize = Math.ceil(points.length / Math.ceil(limit / 2));
    const result: Array<{ ts: string; value: number }> = [];

    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      let min = bucket[0];
      let max = bucket[0];
      for (const point of bucket) {
        if (point.value < min.value) min = point;
        if (point.value > max.value) max = point;
      }
      result.push(min, max);
    }

    return result.slice(0, limit);
  }

  private calculateStats(values: number[]): SPCSeriesStats | null {
    if (!values.length) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const mean = values.reduce((sum, v) => sum + v, 0) / count;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      (count - 1 || 1);
    const stdDev = Math.sqrt(variance);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = this.percentile(sorted, 0.5);
    const p95 = this.percentile(sorted, 0.95);

    return { count, mean, stdDev, min, max, median, p95 };
  }

  private percentile(sorted: number[], percentile: number): number {
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  private calculateLimits(mean: number, stdDev: number): SPCSeriesLimits {
    return {
      mean,
      sigma: stdDev,
      ucl: mean + 3 * stdDev,
      lcl: mean - 3 * stdDev,
      method: 'xbar-3sigma',
    };
  }
}
