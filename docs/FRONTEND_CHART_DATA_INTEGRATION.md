# Frontend Chart Data Integration

This guide describes how to fetch SPC chart data, keep charts updated in real time, and interpret response payloads.

## Overview

- Initial chart render uses `GET /api/spc/series`.
- Live updates use WebSocket `spc-series-update` events.
- Long windows (24h/3d/7d) should refresh the downsampled series every 5-10 minutes.

## REST: GET /api/spc/series

Chart-optimized SPC series and stats in one payload. Use for charts; keep history endpoints for tables/export.

**Authentication:** Requires valid JWT token via `Authorization: Bearer <token>` header.

### Query params:

- `machineId` (required) - Numeric machine ID (e.g., `1`)
- `field` (required) - SPC field from whitelist (see allowed fields below)
- `window` (optional, default `last_1h`) - `last_15m`, `last_1h`, `last_6h`, `last_24h`, `last_3d`, `last_7d`, `custom`
- `start` and `end` (required when `window=custom`) - ISO 8601 timestamps (e.g., `2026-01-20T18:00:00Z`)
- `limit` (optional, default `100`, max `100`) - Maximum number of points in series
- `order` (optional, default `asc`) - `asc` or `desc`
- `downsample` (optional, default `none`) - `none`, `lttb`, `avg`, `minmax`
- `includeStats` (optional, default `true`) - `true` or `false`
- `includeLimits` (optional, default `true`) - `true` or `false`

### Allowed SPC Fields:

`cycle_number`, `cycle_time`, `injection_velocity_max`, `injection_pressure_max`, `switch_pack_time`, `temp_1`, `temp_2`, `temp_3`, `switch_pack_pressure`, `switch_pack_position`, `injection_time`, `plasticizing_time`, `plasticizing_pressure_max`, `temp_4`, `temp_5`, `temp_6`, `temp_7`, `temp_8`, `temp_9`, `temp_10`, `injection_pressure_set`, `fill_cooling_time`, `injection_pressure_set_min`, `oil_temperature_cycle`, `end_mold_open_speed`, `injection_start_speed`

### Example Requests:

```bash
# Basic request with defaults
curl "http://localhost:3000/api/spc/series?machineId=1&field=cycle_time&window=last_1h" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# With downsampling and custom limit
curl "http://localhost:3000/api/spc/series?machineId=1&field=cycle_time&window=last_1h&downsample=avg&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Custom time window with LTTB downsampling
curl "http://localhost:3000/api/spc/series?machineId=1&field=cycle_time&window=custom&start=2026-01-20T18:00:00Z&end=2026-01-20T21:00:00Z&downsample=lttb&limit=100" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Without stats and limits (for performance)
curl "http://localhost:3000/api/spc/series?machineId=1&field=cycle_time&window=last_1h&includeStats=false&includeLimits=false" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response example:

```json
{
  "machineId": 1,
  "field": "cycle_time",
  "unit": "seconds",
  "window": {
    "mode": "last_1h",
    "start": "2026-01-20T20:05:19.360Z",
    "end": "2026-01-20T21:05:19.360Z"
  },
  "sampling": {
    "limit": 100,
    "returned": 68,
    "downsample": "none",
    "intervalMs": 36000
  },
  "series": [
    { "ts": "2026-01-20T20:05:54.266Z", "value": 36.11 },
    { "ts": "2026-01-20T20:06:45.329Z", "value": 34.95 },
    { "ts": "2026-01-20T20:07:36.393Z", "value": 33.95 },
    { "ts": "2026-01-20T20:08:27.472Z", "value": 32.32 }
  ],
  "stats": {
    "count": 68,
    "mean": 32.55,
    "stdDev": 3.79,
    "min": 25.65,
    "max": 45.62,
    "median": 32.11,
    "p95": 37.24
  },
  "limits": {
    "mean": 32.55,
    "sigma": 3.79,
    "ucl": 43.92,
    "lcl": 21.17,
    "method": "xbar-3sigma"
  },
  "meta": {
    "source": "influxdb",
    "generatedAt": "2026-01-20T21:05:19.408Z"
  }
}
```

Notes:

- **Authentication:** JWT token required in `Authorization: Bearer <token>` header
- `machineId` must be numeric (e.g., `1`, not `"machine-123"`)
- `stats` and `limits` are computed from the raw window (not the downsampled series)
- `series` is downsampled to a maximum of 100 points using the specified strategy
- `sampling.intervalMs = (windowEnd - windowStart) / limit`
- `sampling.returned` shows actual number of points returned (may be less than limit if insufficient data)
- If no data is found: `series: []`, `stats: null`, `limits: null`
- Invalid field names return HTTP 400 with list of allowed fields

## WebSocket: spc-series-update

Emits bucketed chart points plus updated stats/limits. Use this to keep charts and overlays fresh without re-calling the series API for each point.

Payload example:

```json
{
  "deviceId": "postgres machine 1",
  "field": "cycle_time",
  "window": {
    "mode": "last_1h",
    "start": "2026-01-20T20:05:19.360Z",
    "end": "2026-01-20T21:05:19.360Z"
  },
  "sampling": {
    "limit": 100,
    "intervalMs": 36000,
    "downsample": "avg"
  },
  "point": {
    "kind": "bucketed",
    "ts": "2026-01-20T21:00:22.339Z",
    "value": 27.18
  },
  "stats": {
    "count": 68,
    "mean": 32.55,
    "stdDev": 3.79,
    "min": 25.65,
    "max": 45.62,
    "median": 32.11,
    "p95": 37.24
  },
  "limits": {
    "mean": 32.55,
    "sigma": 3.79,
    "ucl": 43.92,
    "lcl": 21.17,
    "method": "xbar-3sigma"
  },
  "timestamp": "2026-01-20T21:05:19.408Z"
}
```

Notes:

- `deviceId` is the machine name (e.g., `"postgres machine 1"`), not the numeric ID
- Emit interval differs by window: `intervalMs = (windowEnd - windowStart) / limit`
- The backend aggregates raw points into buckets; it emits only when a bucket closes or a debounce threshold is hit
- Frontend should append the bucketed point and update overlays using `stats`/`limits`

## Suggested Frontend Flow

1. Authenticate user and obtain JWT token
2. Call `GET /api/spc/series` with `Authorization: Bearer <token>` header for the selected `machineId`, `field`, and `window`
3. Connect Socket.IO and subscribe to the machine using `deviceId` (machine name, not ID)
4. Listen for `spc-series-update` and append `point`, replace overlays from `stats`/`limits`
5. Re-fetch `GET /api/spc/series` every 5-10 minutes for long windows (24h/3d/7d) and on reconnect
6. Handle field validation errors (HTTP 400) by showing user the list of allowed fields
