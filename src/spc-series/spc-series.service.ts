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

export interface SPCSeriesCoverage {
  firstTs: string | null;
  lastTs: string | null;
  requestedSpanMs: number;
  observedSpanMs: number;
  headGapMs: number;
  tailGapMs: number;
  coverageRatio: number;
  isPartial: boolean;
}

export interface SPCSeriesResponse {
  machineId: number;
  field: AllowedSPCField;
  unit: string;
  window: SPCSeriesWindow;
  sampling: SPCSeriesSampling;
  series: Array<{ ts: string; value: number }>;
  coverage: SPCSeriesCoverage;
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
  private readonly DEFAULT_MAX_POINTS = 240;
  private readonly MIN_POINTS = 20;
  private readonly maxPoints = this.resolveMaxPoints();
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

  private resolveMaxPoints(): number {
    const configured = Number(process.env.SPC_SERIES_MAX_POINTS);
    if (!Number.isFinite(configured)) {
      return this.DEFAULT_MAX_POINTS;
    }

    return Math.max(Math.floor(configured), this.MIN_POINTS);
  }

  async getSeries(
    machineName: string,
    machineId: number,
    field: AllowedSPCField,
    window: SPCWindowPreset,
    start?: string,
    end?: string,
    limit: number = this.maxPoints,
    order: 'asc' | 'desc' = 'asc',
    includeStats: boolean = true,
    includeLimits: boolean = true,
    downsample: SPCDownsampleStrategy = 'none',
  ): Promise<SPCSeriesResponse> {
    const windowRange = this.resolveWindow(window, start, end);
    const safeLimit = Math.min(Math.max(limit, this.MIN_POINTS), this.maxPoints);
    const requestedIntervalMs = this.calculateWindowInterval(
      windowRange.start,
      windowRange.end,
      safeLimit,
    );

    const queryResult = await this.querySeries(
      machineName,
      field,
      windowRange.start,
      windowRange.end,
      safeLimit,
      order,
      downsample,
    );
    const { points: series, effectiveDownsample, intervalMs } = queryResult;

    if (series.length > 0) {
      const first = series[0];
      const last = series[series.length - 1];
      this.logger.debug(
        JSON.stringify({
          event: 'spc.series.query',
          machineName,
          field,
          windowStart: windowRange.start,
          windowEnd: windowRange.end,
          order,
          downsample: effectiveDownsample,
          limit: safeLimit,
          intervalMs,
          returned: series.length,
          firstTs: first.ts,
          lastTs: last.ts,
          firstEpochMs: Date.parse(first.ts),
          lastEpochMs: Date.parse(last.ts),
          windowStartUtc: windowRange.start.endsWith('Z'),
          windowEndUtc: windowRange.end.endsWith('Z'),
        }),
      );
    } else {
      this.logger.debug(
        JSON.stringify({
          event: 'spc.series.query',
          machineName,
          field,
          windowStart: windowRange.start,
          windowEnd: windowRange.end,
          order,
          downsample: effectiveDownsample,
          limit: safeLimit,
          intervalMs,
          returned: 0,
          windowStartUtc: windowRange.start.endsWith('Z'),
          windowEndUtc: windowRange.end.endsWith('Z'),
        }),
      );
    }

    const values = series.map((point) => point.value);

    const stats = includeStats ? this.calculateStats(values) : null;
    const limits =
      includeLimits && stats
        ? this.calculateLimits(stats.mean, stats.stdDev)
        : null;
    const coverage = this.calculateCoverage(windowRange, series);

    return {
      machineId,
      field,
      unit: SPC_FIELD_UNITS[field] || 'unit',
      window: windowRange,
      sampling: {
        limit: safeLimit,
        returned: series.length,
        downsample: effectiveDownsample,
        intervalMs: intervalMs ?? requestedIntervalMs,
      },
      series,
      coverage,
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

  private calculateWindowInterval(
    start: string,
    end: string,
    limit: number,
  ): number {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const duration = Math.max(endTime - startTime, 0);
    return Math.max(Math.floor(duration / limit), 1000);
  }

  private calculateObservedInterval(
    firstTs: string,
    lastTs: string,
    limit: number,
  ): number {
    if (limit <= 1) {
      return 1000;
    }

    const firstTime = Date.parse(firstTs);
    const lastTime = Date.parse(lastTs);
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
      return 1000;
    }

    const observedSpanMs = Math.max(lastTime - firstTime, 0);
    return Math.max(Math.ceil(observedSpanMs / (limit - 1)), 1000);
  }

  private async querySeries(
    machineName: string,
    field: AllowedSPCField,
    start: string,
    end: string,
    limit: number,
    order: 'asc' | 'desc',
    downsample: SPCDownsampleStrategy,
  ): Promise<{
    points: Array<{ ts: string; value: number }>;
    effectiveDownsample: SPCDownsampleStrategy;
    intervalMs: number | null;
  }> {
    const coverageStats =
      await this.influxDbService.querySPCSeriesCoverageStats(
        machineName,
        field,
        start,
        end,
      );

    if (!coverageStats.count) {
      return {
        points: [],
        effectiveDownsample: 'none',
        intervalMs: this.calculateWindowInterval(start, end, limit),
      };
    }

    const shouldUseAggregatedQuery =
      downsample !== 'none' &&
      coverageStats.count > limit &&
      !!coverageStats.firstTs &&
      !!coverageStats.lastTs;
    const effectiveDownsample: SPCDownsampleStrategy = shouldUseAggregatedQuery
      ? downsample
      : 'none';
    const effectiveIntervalMs = shouldUseAggregatedQuery
      ? this.calculateObservedInterval(
          coverageStats.firstTs!,
          coverageStats.lastTs!,
          limit,
        )
      : null;

    const raw = await this.influxDbService.querySPCSeries(
      machineName,
      field,
      start,
      end,
      limit,
      order,
      effectiveDownsample,
      effectiveIntervalMs ?? undefined,
    );

    if (!raw.length) {
      return {
        points: [],
        effectiveDownsample,
        intervalMs:
          effectiveIntervalMs ?? this.calculateWindowInterval(start, end, limit),
      };
    }

    let points = raw
      .map((row) => ({
        ts: row._time as string,
        value: Number(row._value),
      }))
      .filter((point) => !Number.isNaN(point.value));

    points = points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (order === 'desc') {
      points = points.reverse();
    }

    return {
      points,
      effectiveDownsample,
      intervalMs:
        effectiveIntervalMs ?? this.calculateWindowInterval(start, end, limit),
    };
  }

  private calculateCoverage(
    window: SPCSeriesWindow,
    series: Array<{ ts: string; value: number }>,
  ): SPCSeriesCoverage {
    const windowStartMs = Date.parse(window.start);
    const windowEndMs = Date.parse(window.end);
    const requestedSpanMs = Math.max(windowEndMs - windowStartMs, 0);

    if (
      !series.length ||
      !Number.isFinite(windowStartMs) ||
      !Number.isFinite(windowEndMs)
    ) {
      return {
        firstTs: null,
        lastTs: null,
        requestedSpanMs,
        observedSpanMs: 0,
        headGapMs: requestedSpanMs,
        tailGapMs: requestedSpanMs,
        coverageRatio: 0,
        isPartial: true,
      };
    }

    const firstTs = series[0].ts;
    const lastTs = series[series.length - 1].ts;
    const firstMs = Date.parse(firstTs);
    const lastMs = Date.parse(lastTs);
    const observedSpanMs =
      series.length > 1 ? Math.max(lastMs - firstMs, 0) : 0;
    const headGapMs = Math.max(firstMs - windowStartMs, 0);
    const tailGapMs = Math.max(windowEndMs - lastMs, 0);
    const effectiveCoveredSpanMs = Math.max(
      requestedSpanMs - headGapMs - tailGapMs,
      0,
    );
    const coverageRatio =
      requestedSpanMs > 0
        ? Math.min(Math.max(effectiveCoveredSpanMs / requestedSpanMs, 0), 1)
        : 1;

    return {
      firstTs,
      lastTs,
      requestedSpanMs,
      observedSpanMs,
      headGapMs,
      tailGapMs,
      coverageRatio,
      isPartial: coverageRatio < 1,
    };
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
