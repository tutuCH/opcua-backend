# SPC API Update - January 18, 2026

## Overview

This document outlines the new performance-optimized SPC API endpoints released on January 18, 2026. These endpoints are designed to significantly reduce CPU usage on the frontend by offloading calculations to the backend and implementing intelligent data downsampling similar to Grafana/Prometheus patterns.

**Key Benefits:**

- Reduced frontend CPU usage (target: < 20% for 10 charts)
- Faster initial page load (target: < 2 seconds)
- Automatic data downsampling based on time range
- Cached SPC control limits (30-minute TTL)
- Real-time updates via latest data caching

---

## New Endpoints

### 1. Get SPC Control Limits (Cached)

**Endpoint:** `GET /api/machines/{deviceId}/spc/limits`

**Purpose:** Retrieve precomputed SPC control limits (UCL, LCL, Mean, Standard Deviation) with automatic caching. Offloads CPU-intensive calculations from frontend to backend.

**Query Parameters:**

| Parameter          | Type    | Required | Description                                                    | Example                             |
| ------------------ | ------- | -------- | -------------------------------------------------------------- | ----------------------------------- |
| `fields`           | string  | Yes      | Comma-separated list of metric fields                          | `cycle_time,injection_velocity_max` |
| `lookback`         | string  | No       | Time range for calculation. Default: `24h`                     | `1h`, `6h`, `24h`, `7d`             |
| `sigma`            | number  | No       | Number of standard deviations for control limits. Default: `3` | `2`, `3`, `4`                       |
| `forceRecalculate` | boolean | No       | Force recalculation bypassing cache. Default: `false`          | `true`                              |

**Request Example:**

```http
GET /api/machines/M1/spc/limits?fields=cycle_time,injection_velocity_max&lookback=24h&sigma=3 HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200 OK):**

```json
{
  "limits": {
    "cycle_time": {
      "mean": 12.5,
      "stdDev": 0.8,
      "ucl": 14.9,
      "lcl": 10.1,
      "n": 50,
      "calculatedAt": "2025-01-17T10:50:00Z",
      "expiresAt": "2025-01-17T11:20:00Z",
      "isCached": true
    },
    "injection_velocity_max": {
      "mean": 84.5,
      "stdDev": 2.3,
      "ucl": 91.4,
      "lcl": 77.6,
      "n": 50,
      "calculatedAt": "2025-01-17T10:50:00Z",
      "expiresAt": "2025-01-17T11:20:00Z",
      "isCached": true
    }
  },
  "metadata": {
    "deviceId": "M1",
    "calculationTime": "15ms",
    "cacheKey": "spc:limits:M1:cycle_time,injection_velocity_max:24h:sigma3"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Invalid field names or parameters
- `401 Unauthorized`: Missing or invalid authentication
- `404 Not Found`: Machine ID not found
- `422 Unprocessable Entity`: Insufficient data for calculation (n < 2)

**Frontend Implementation:**

```typescript
interface SPCLimit {
  mean: number;
  stdDev: number;
  ucl: number;
  lcl: number;
  n: number;
  calculatedAt: string;
  expiresAt: string;
  isCached: boolean;
}

interface SPCLimitsResponse {
  limits: Record<string, SPCLimit>;
  metadata: {
    deviceId: string;
    calculationTime: string;
    cacheKey: string;
  };
}

async function fetchControlLimits(
  deviceId: string,
  fields: string[],
  lookback: string = '24h',
  sigma: number = 3
): Promise<Record<string, SPCLimit>> {
  const response = await fetch(
    `/api/machines/${deviceId}/spc/limits?` +
    `fields=${fields.join(',')}&` +
    `lookback=${lookback}&` +
    `sigma=${sigma}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch control limits: ${response.statusText}`);
  }

  const data: SPCLimitsResponse = await response.json();
  return data.limits;
}

// Usage in React component
function SPCChart({ deviceId, field }: { deviceId: string; field: string }) {
  const [limits, setLimits] = useState<SPCLimit | null>(null);

  useEffect(() => {
    async function loadLimits() {
      const limitsData = await fetchControlLimits(deviceId, [field]);
      setLimits(limitsData[field]);

      // Refresh limits 5 minutes before expiration
      const expiresAt = new Date(limitsData[field].expiresAt);
      const refreshAt = new Date(expiresAt.getTime() - 5 * 60 * 1000);
      const now = new Date();
      const timeUntilRefresh = refreshAt.getTime() - now.getTime();

      if (timeUntilRefresh > 0) {
        setTimeout(async () => {
          const updated = await fetchControlLimits(deviceId, [field]);
          setLimits(updated[field]);
        }, timeUntilRefresh);
      }
    }

    loadLimits();
  }, [deviceId, field]);

  return (
    <Chart data={chartData} limits={limits} />
  );
}
```

---

### 2. Get Latest SPC Data (Cached)

**Endpoint:** `GET /api/machines/{deviceId}/spc/latest`

**Purpose:** Retrieve the most recent SPC data points with automatic caching. Use this for real-time chart updates instead of polling the full history endpoint.

**Query Parameters:**

| Parameter | Type   | Required | Description                                      | Example         |
| --------- | ------ | -------- | ------------------------------------------------ | --------------- |
| `count`   | number | No       | Number of latest points to return. Default: `10` | `5`, `10`, `20` |
| `fields`  | string | No       | Comma-separated list of fields to return         | `cycle_time`    |

**Request Example:**

```http
GET /api/machines/M1/spc/latest?count=5&fields=cycle_time HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200 OK):**

```json
{
  "deviceId": "M1",
  "data": [
    {
      "_time": "2025-01-17T10:46:00Z",
      "cycle_time": 12.6,
      "injection_velocity_max": 84.5
    },
    {
      "_time": "2025-01-17T10:47:00Z",
      "cycle_time": 12.4,
      "injection_velocity_max": 85.2
    },
    {
      "_time": "2025-01-17T10:48:00Z",
      "cycle_time": 12.7,
      "injection_velocity_max": 84.8
    },
    {
      "_time": "2025-01-17T10:49:00Z",
      "cycle_time": 12.5,
      "injection_velocity_max": 85.0
    },
    {
      "_time": "2025-01-17T10:50:00Z",
      "cycle_time": 12.8,
      "injection_velocity_max": 84.6
    }
  ],
  "metadata": {
    "count": 5,
    "cachedAt": "2025-01-17T10:50:01Z"
  }
}
```

**Frontend Implementation:**

```typescript
interface LatestDataResponse {
  deviceId: string;
  data: any[];
  metadata: {
    count: number;
    cachedAt: string;
  };
}

async function fetchLatestSPCData(
  deviceId: string,
  count: number = 5,
  fields?: string[],
): Promise<any[]> {
  const params = new URLSearchParams({
    count: count.toString(),
  });

  if (fields && fields.length > 0) {
    params.append('fields', fields.join(','));
  }

  const response = await fetch(
    `/api/machines/${deviceId}/spc/latest?${params}`,
    {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest SPC data: ${response.statusText}`);
  }

  const data: LatestDataResponse = await response.json();
  return data.data;
}

// Real-time updates polling (recommended: every 5 seconds)
function useRealTimeSPCData(deviceId: string, field: string) {
  const [latestData, setLatestData] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await fetchLatestSPCData(deviceId, 5, [field]);
      setLatestData((prev) => {
        // Merge with existing data, keeping max 50 points
        const merged = [...prev, ...data];
        return merged.slice(-50);
      });
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [deviceId, field]);

  return latestData;
}
```

---

### 3. Get SPC History with Intelligent Downsampling

**Endpoint:** `GET /api/machines/{deviceId}/spc/history-optimized`

**Purpose:** Retrieve SPC historical data with automatic intelligent downsampling based on time range (Grafana-style). Use this for initial chart loading instead of the legacy `/spc-history` endpoint.

**Query Parameters:**

| Parameter | Type   | Required | Description                                 | Example                             |
| --------- | ------ | -------- | ------------------------------------------- | ----------------------------------- |
| `from`    | string | Yes      | Start timestamp (ISO 8601)                  | `2025-01-17T09:00:00Z`              |
| `to`      | string | Yes      | End timestamp (ISO 8601)                    | `2025-01-17T10:00:00Z`              |
| `fields`  | string | No       | Comma-separated list of fields to return    | `cycle_time,injection_velocity_max` |
| `step`    | number | No       | Target number of data points. Default: `50` | `50`, `100`, `200`                  |

**Automatic Downsampling Logic:**

| Time Range | Resolution        | Example Points (1h range) |
| ---------- | ----------------- | ------------------------- |
| ≤ 1 hour   | Raw data          | ~60 points (1 per minute) |
| ≤ 6 hours  | 1-minute average  | ~360 points               |
| ≤ 24 hours | 5-minute average  | ~288 points               |
| ≤ 7 days   | 15-minute average | ~672 points               |
| > 7 days   | 1-hour average    | ~168 points               |

**Request Example:**

```http
GET /api/machines/M1/spc/history-optimized?from=2025-01-17T09:00:00Z&to=2025-01-17T10:00:00Z&fields=cycle_time&step=50 HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200 OK):**

```json
{
  "deviceId": "M1",
  "data": [
    {
      "_time": "2025-01-17T09:00:00Z",
      "cycle_time": 12.3
    },
    {
      "_time": "2025-01-17T09:12:00Z",
      "cycle_time": 12.5
    },
    {
      "_time": "2025-01-17T09:24:00Z",
      "cycle_time": 12.1
    },
    {
      "_time": "2025-01-17T09:36:00Z",
      "cycle_time": 12.7
    },
    {
      "_time": "2025-01-17T09:48:00Z",
      "cycle_time": 12.4
    }
  ],
  "metadata": {
    "deviceId": "M1",
    "timeRange": "2025-01-17T09:00:00Z/2025-01-17T10:00:00Z",
    "pointsReturned": 5,
    "requestedFields": ["cycle_time"],
    "queryTime": "15ms"
  }
}
```

**Frontend Implementation:**

```typescript
interface OptimizedHistoryResponse {
  deviceId: string;
  data: any[];
  metadata: {
    timeRange: string;
    pointsReturned: number;
    requestedFields?: string[];
    queryTime: string;
  };
}

async function fetchOptimizedSPCHistory(
  deviceId: string,
  from: string,
  to: string,
  fields?: string[],
  step: number = 50,
): Promise<any[]> {
  const params = new URLSearchParams({
    from,
    to,
    step: step.toString(),
  });

  if (fields && fields.length > 0) {
    params.append('fields', fields.join(','));
  }

  const response = await fetch(
    `/api/machines/${deviceId}/spc/history-optimized?${params}`,
    {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch SPC history: ${response.statusText}`);
  }

  const data: OptimizedHistoryResponse = await response.json();
  return data.data;
}

// Initial chart load
async function loadInitialChartData(deviceId: string, field: string) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const data = await fetchOptimizedSPCHistory(
    deviceId,
    oneHourAgo.toISOString(),
    now.toISOString(),
    [field],
    50, // Request ~50 data points
  );

  return data;
}
```

---

### 4. Get SPC Metadata

**Endpoint:** `GET /api/machines/{deviceId}/spc/metadata`

**Purpose:** Retrieve SPC metrics metadata including field definitions, units, data types, and supported capabilities. Use this for dynamic chart configuration and schema discovery.

**Query Parameters:** None

**Request Example:**

```http
GET /api/machines/M1/spc/metadata HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200 OK):**

```json
{
  "deviceId": "M1",
  "fields": [
    {
      "name": "cycle_time",
      "displayName": "Cycle Time",
      "unit": "seconds",
      "dataType": "float",
      "min": 10.0,
      "max": 15.0,
      "suggestedRange": [10, 15]
    },
    {
      "name": "injection_velocity_max",
      "displayName": "Injection Velocity (Max)",
      "unit": "mm/s",
      "dataType": "float",
      "min": 70.0,
      "max": 95.0,
      "suggestedRange": [70, 95]
    },
    {
      "name": "injection_pressure_max",
      "displayName": "Injection Pressure (Max)",
      "unit": "bar",
      "dataType": "float",
      "min": 100.0,
      "max": 130.0,
      "suggestedRange": [100, 130]
    },
    {
      "name": "switch_pack_time",
      "displayName": "Switch Pack Time",
      "unit": "seconds",
      "dataType": "float",
      "min": 1.5,
      "max": 2.5,
      "suggestedRange": [1.5, 2.5]
    },
    {
      "name": "temp_1",
      "displayName": "Barrel Temperature 1",
      "unit": "°C",
      "dataType": "float",
      "min": 200.0,
      "max": 230.0,
      "suggestedRange": [200, 230]
    }
  ],
  "capabilities": {
    "supportedAggregations": [
      "mean",
      "median",
      "min",
      "max",
      "stdDev",
      "count"
    ],
    "supportedResolutions": ["auto", "1m", "5m", "15m", "1h", "6h", "1d"],
    "maxPointsPerQuery": 10000
  }
}
```

**Frontend Implementation:**

```typescript
interface FieldMetadata {
  name: string;
  displayName: string;
  unit: string;
  dataType: string;
  min: number;
  max: number;
  suggestedRange: [number, number];
}

interface MetadataResponse {
  deviceId: string;
  fields: FieldMetadata[];
  capabilities: {
    supportedAggregations: string[];
    supportedResolutions: string[];
    maxPointsPerQuery: number;
  };
}

async function fetchSPCMetadata(deviceId: string): Promise<MetadataResponse> {
  const response = await fetch(`/api/machines/${deviceId}/spc/metadata`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SPC metadata: ${response.statusText}`);
  }

  return await response.json();
}

// Use metadata for dynamic chart configuration
async function configureChart(deviceId: string, fieldName: string) {
  const metadata = await fetchSPCMetadata(deviceId);
  const fieldInfo = metadata.fields.find((f) => f.name === fieldName);

  if (!fieldInfo) {
    throw new Error(`Field ${fieldName} not found`);
  }

  return {
    label: fieldInfo.displayName,
    unit: fieldInfo.unit,
    yMin: fieldInfo.suggestedRange[0],
    yMax: fieldInfo.suggestedRange[1],
  };
}
```

---

## Comparison: Old vs New Endpoints

### Old Approach (Legacy - Deprecated)

```typescript
// ❌ OLD: Fetch all data, calculate limits on frontend
async function loadChartDataOld(deviceId: string) {
  const response = await fetch(
    `/api/machines/${deviceId}/spc-history?limit=1000`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const { data } = await response.json();

  // ❌ CPU-intensive calculation on frontend
  const values = data.map((d) => d.cycle_time);
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values, mean);
  const ucl = mean + 3 * stdDev;
  const lcl = mean - 3 * stdDev;

  return { data, limits: { mean, stdDev, ucl, lcl } };
}
```

**Problems:**

- Transfers all 1000 data points
- Calculates control limits on frontend (CPU 100%)
- No intelligent downsampling
- No caching
- Poor performance for multiple charts

### New Approach (Recommended)

```typescript
// ✅ NEW: Fetch optimized data, use cached limits
async function loadChartDataNew(deviceId: string, field: string) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Fetch optimized history (auto-downsampled)
  const data = await fetchOptimizedSPCHistory(
    deviceId,
    oneHourAgo.toISOString(),
    now.toISOString(),
    [field],
    50, // Only ~50 points needed
  );

  // Fetch cached control limits
  const limitsResponse = await fetchControlLimits(deviceId, [field]);
  const limits = limitsResponse[field];

  return { data, limits };
}
```

**Benefits:**

- Transfers only ~50 data points (20x reduction)
- Control limits pre-calculated on backend
- Automatic intelligent downsampling
- 30-minute cache for limits
- 10-second cache for latest data
- CPU usage < 20% for 10 charts

---

## Migration Guide

### Step 1: Replace Control Limits Calculation

**Before:**

```typescript
function calculateSPCLimits(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    stdDev,
    ucl: mean + 3 * stdDev,
    lcl: mean - 3 * stdDev,
  };
}
```

**After:**

```typescript
async function fetchSPCLimits(deviceId: string, fields: string[]) {
  const response = await fetch(
    `/api/machines/${deviceId}/spc/limits?fields=${fields.join(',')}`,
  );
  const data = await response.json();
  return data.limits;
}
```

### Step 2: Replace Historical Data Fetching

**Before:**

```typescript
const response = await fetch(
  `/api/machines/${deviceId}/spc-history?limit=1000`,
);
const { data } = await response.json();
```

**After:**

```typescript
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

const response = await fetch(
  `/api/machines/${deviceId}/spc/history-optimized?` +
    `from=${oneHourAgo.toISOString()}&` +
    `to=${now.toISOString()}&` +
    `fields=${field}&` +
    `step=50`,
);

const { data } = await response.json();
```

### Step 3: Replace Real-time Updates

**Before:**

```typescript
// Poll full history every 5 seconds
setInterval(async () => {
  const response = await fetch(
    `/api/machines/${deviceId}/spc-history?limit=100`,
  );
  const { data } = await response.json();
  updateChart(data);
}, 5000);
```

**After:**

```typescript
// Poll only latest 5 points every 5 seconds
setInterval(async () => {
  const response = await fetch(
    `/api/machines/${deviceId}/spc/latest?count=5&fields=${field}`,
  );
  const { data } = await response.json();
  appendToChart(data); // Append only new points
}, 5000);
```

### Step 4: Add Control Limits Refresh Logic

```typescript
useEffect(() => {
  async function loadAndScheduleRefresh() {
    const limits = await fetchControlLimits(deviceId, [field]);
    setControlLimits(limits[field]);

    // Refresh 5 minutes before expiration
    const expiresAt = new Date(limits[field].expiresAt);
    const refreshAt = new Date(expiresAt.getTime() - 5 * 60 * 1000);
    const timeUntilRefresh = refreshAt.getTime() - Date.now();

    if (timeUntilRefresh > 0) {
      setTimeout(async () => {
        const updated = await fetchControlLimits(deviceId, [field]);
        setControlLimits(updated[field]);
      }, timeUntilRefresh);
    }
  }

  loadAndScheduleRefresh();
}, [deviceId, field]);
```

---

## Performance Best Practices

### 1. Use Field Projection

```typescript
// ✅ GOOD: Request only needed fields
fetch(`/api/machines/${deviceId}/spc/history-optimized?fields=cycle_time`);

// ❌ BAD: Request all fields when only one is needed
fetch(`/api/machines/${deviceId}/spc/history-optimized`);
```

### 2. Limit Data Points

```typescript
// ✅ GOOD: Request ~50 points for chart
fetch(`/api/machines/${deviceId}/spc/history-optimized?step=50`);

// ❌ BAD: Request 1000 points for simple chart
fetch(`/api/machines/${deviceId}/spc/history-optimized?step=1000`);
```

### 3. Use Time-Based Queries

```typescript
// ✅ GOOD: Use time range with auto-downsampling
fetch(`/api/machines/${deviceId}/spc/history-optimized?from=...&to=...`);

// ❌ BAD: Use legacy limit/offset pagination
fetch(`/api/machines/${deviceId}/spc-history?limit=100&offset=0`);
```

### 4. Cache Limits Client-Side

```typescript
// ✅ GOOD: Cache limits with TTL
const limitsCache = new Map();

async function getCachedLimits(deviceId: string, fields: string[]) {
  const cacheKey = `${deviceId}:${fields.join(',')}`;
  const cached = limitsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetchControlLimits(deviceId, fields);
  limitsCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  });

  return data;
}
```

### 5. Debounce Chart Updates

```typescript
// ✅ GOOD: Debounce rapid updates
const [updateQueue, setUpdateQueue] = useState<any[]>([]);
const [isUpdating, setIsUpdating] = useState(false);

function appendNewData(newData: any[]) {
  setUpdateQueue((prev) => [...prev, ...newData]);
}

useEffect(() => {
  if (updateQueue.length > 0 && !isUpdating) {
    setIsUpdating(true);
    requestAnimationFrame(() => {
      const allNewData = updateQueue.flat();
      const mergedData = [...chartData, ...allNewData].slice(-50);
      updateChart(mergedData);
      setUpdateQueue([]);
      setIsUpdating(false);
    });
  }
}, [updateQueue, isUpdating, chartData]);
```

---

## Complete Example: SPC Chart Component

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

interface SPCChartProps {
  deviceId: string;
  field: string;
}

export function SPCChart({ deviceId, field }: SPCChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const chartRef = useRef<Chart | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize chart
  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: field,
            data: [],
            borderColor: '#1890ff',
            backgroundColor: 'rgba(24, 144, 255, 0.1)',
            pointRadius: 3,
            fill: false
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: { minute: 'HH:mm' }
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      try {
        // Fetch optimized history
        const historyResponse = await fetch(
          `/api/machines/${deviceId}/spc/history-optimized?` +
          `from=${oneHourAgo.toISOString()}&` +
          `to=${now.toISOString()}&` +
          `fields=${field}&` +
          `step=50`,
          { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
        );

        const historyData = await historyResponse.json();
        setChartData(historyData.data);

        // Fetch cached control limits
        const limitsResponse = await fetch(
          `/api/machines/${deviceId}/spc/limits?fields=${field}`,
          { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
        );

        const limitsData = await limitsResponse.json();
        setLimits(limitsData.limits[field]);

        // Schedule limits refresh
        const expiresAt = new Date(limitsData.limits[field].expiresAt);
        const refreshAt = new Date(expiresAt.getTime() - 5 * 60 * 1000);
        const timeUntilRefresh = refreshAt.getTime() - Date.now();

        if (timeUntilRefresh > 0) {
          setTimeout(async () => {
            const updated = await fetch(
              `/api/machines/${deviceId}/spc/limits?fields=${field}`,
              { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
            );
            const updatedData = await updated.json();
            setLimits(updatedData.limits[field]);
          }, timeUntilRefresh);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadInitialData();
  }, [deviceId, field]);

  // Real-time updates polling
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/machines/${deviceId}/spc/latest?count=5&fields=${field}`,
          { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
        );

        const data = await response.json();

        setChartData(prev => {
          const merged = [...prev, ...data.data].slice(-50);
          return merged;
        });
      } catch (error) {
        console.error('Failed to fetch latest data:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [deviceId, field]);

  // Update chart when data changes
  useEffect(() => {
    if (!chartRef.current) return;

    const formattedData = chartData.map(d => ({
      x: new Date(d._time),
      y: d[field]
    }));

    chartRef.current.data.datasets[0].data = formattedData;

    if (limits) {
      chartRef.current.data.datasets = [
        {
          label: field,
          data: formattedData,
          borderColor: '#1890ff',
          pointRadius: formattedData.length > 50 ? 0 : 3,
          fill: false
        },
        {
          label: 'UCL',
          data: formattedData.map(() => limits.ucl),
          borderColor: '#ff4d4f',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Mean',
          data: formattedData.map(() => limits.mean),
          borderColor: '#52c41a',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'LCL',
          data: formattedData.map(() => limits.lcl),
          borderColor: '#ff4d4f',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ];
    }

    chartRef.current.update('none');
  }, [chartData, limits, field]);

  return (
    <div style={{ height: '400px', width: '100%' }}>
      {isLoading ? (
        <div>Loading chart...</div>
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}
```

---

## Deprecation Notices

### Deprecated Endpoints

The following endpoints are **DEPRECATED** and will be removed in a future release. Please migrate to the new optimized endpoints:

| Old Endpoint                             | New Endpoint                                       | Status     |
| ---------------------------------------- | -------------------------------------------------- | ---------- |
| `GET /api/machines/:id/spc-history`      | `GET /api/machines/:id/spc/history-optimized`      | Deprecated |
| `GET /api/machines/:id/realtime-history` | `GET /api/machines/:id/realtime/history-optimized` | Deprecated |

**Note:** Old endpoints will continue to work but will not receive performance optimizations.

### Client-Side Calculation Functions

The following functions should be replaced with server-side API calls:

- `calculateSPCLimits()` → Use `/spc/limits` endpoint
- `calculateMean()` → No longer needed
- `calculateStdDev()` → No longer needed
- `calculateUCL()` → No longer needed
- `calculateLCL()` → No longer needed

---

## Troubleshooting

### Issue: Control limits not updating

**Solution:** Check the `expiresAt` timestamp in the API response. Ensure your client is scheduling a refresh 5 minutes before expiration.

```typescript
const expiresAt = new Date(limits.expiresAt);
const shouldRefresh =
  new Date() > new Date(expiresAt.getTime() - 5 * 60 * 1000);

if (shouldRefresh) {
  await fetchControlLimits(deviceId, [field]);
}
```

### Issue: Chart shows too many points

**Solution:** Use the `step` parameter to limit the number of points returned.

```typescript
fetch(`/api/machines/${deviceId}/spc/history-optimized?step=50`);
```

### Issue: Slow initial page load

**Solution:**

1. Ensure you're using the `history-optimized` endpoint
2. Request only the fields you need with `fields` parameter
3. Use a reasonable `step` value (50-100 points)
4. Implement client-side caching for control limits

### Issue: High CPU usage during real-time updates

**Solution:**

1. Poll only the latest 5 points using `/spc/latest` endpoint
2. Debounce chart updates using `requestAnimationFrame`
3. Use `'none'` mode for Chart.js updates
4. Disable animations for real-time charts

---

## Support

For questions or issues related to the new SPC API endpoints, please contact the backend team or refer to:

- `docs/SPC_CHARTS_RENDERING_PLAN.md` - Frontend implementation guide
- `docs/BACKEND_API_REQUIREMENT.md` - Backend API requirements

---

## Changelog

### January 18, 2026

**Core Features:**
- ✅ Added `/spc/limits` endpoint for cached control limits
- ✅ Added `/spc/latest` endpoint for cached latest data
- ✅ Added `/spc/history-optimized` endpoint with intelligent downsampling
- ✅ Added `/spc/metadata` endpoint for schema discovery
- ✅ Added field projection support
- ✅ Implemented 30-minute cache for control limits
- ✅ Implemented 10-second cache for latest data
- ✅ Added automatic intelligent downsampling (Grafana-style)

**Validation & Bug Fixes:**
- ✅ Added field validation whitelist (ALLOWED_SPC_FIELDS constant)
- ✅ Fixed queryTime calculation to report actual query duration
- ✅ Field validation returns 400 Bad Request for invalid field names

**Testing & Documentation:**
- ✅ Added comprehensive E2E tests for all SPC v2.0 endpoints
- ✅ Added 16 unit tests for SPCLimitsService (all passing)
- ✅ Created API test script (scripts/test-spc-api.sh)
- ✅ Updated FRONTEND_INTEGRATION.md with SPC v2.0 documentation
- ✅ Added frontend integration examples with TypeScript code

---

## Quick Reference

### New Endpoints

| Endpoint                                  | Purpose             | Cache  | Recommended Use      |
| ----------------------------------------- | ------------------- | ------ | -------------------- |
| `GET /machines/:id/spc/limits`            | Get control limits  | 30 min | Chart initialization |
| `GET /machines/:id/spc/latest`            | Get latest data     | 10 sec | Real-time updates    |
| `GET /machines/:id/spc/history-optimized` | Get historical data | None   | Initial chart load   |
| `GET /machines/:id/spc/metadata`          | Get metadata        | None   | Chart configuration  |

### Key Parameters

| Parameter  | Description            | Default    | Example                   |
| ---------- | ---------------------- | ---------- | ------------------------- |
| `from`     | Start timestamp        | Required   | `2025-01-17T09:00:00Z`    |
| `to`       | End timestamp          | Required   | `2025-01-17T10:00:00Z`    |
| `fields`   | Comma-separated fields | All fields | `cycle_time,velocity_max` |
| `step`     | Target data points     | 50         | `50`, `100`               |
| `lookback` | Calculation window     | `24h`      | `1h`, `6h`, `24h`         |
| `sigma`    | Control limit sigma    | 3          | `2`, `3`, `4`             |

### Performance Targets

| Metric                        | Target  |
| ----------------------------- | ------- |
| Initial page load (10 charts) | < 2s    |
| API response time             | < 100ms |
| Control limits calculation    | < 50ms  |
| Latest data query (cached)    | < 20ms  |
| CPU usage (10 charts)         | < 20%   |

---

**Last Updated:** January 18, 2026
**API Version:** v2.0
**Status:** ✅ Production Ready
