# SPC Chart Aggregation API Implementation Plan

## Goal

Reduce SPC chart payload size by returning only numeric series and precomputed control metrics. Add a chart-optimized endpoint while keeping raw history endpoints for tables/export.

## Endpoint Summary

- `GET /api/spc/series`
- Returns compact `series`, `stats`, `limits`, and `meta` for chart rendering.

## Window Presets

Support time windows:

- `last_1h`
- `last_24h`
- `last_3d`
- `last_7d`
- `last_1mo`
- `custom` (requires `start` and `end`)

## Max Points

- Enforce max 100 points
- Return Nth data points to represent full timeframe

## Tasks

### Task 1: Confirm metric field mapping

- Review SPC field definitions and existing mappings
- Validate field existence in InfluxDB
- Build unit map for fields

### Task 2: Add SPC series endpoint

- Create controller route: `/api/spc/series`
- Validate `machineId`, `field`, `window`, `start/end`
- Query only `_time` and selected field
- Apply time window and order
- Enforce max 100 points and downsampling

### Task 3: Stats and limits

- Compute stats: count, mean, stdDev, min, max, median, p95
- Compute limits: UCL/LCL (3-sigma)
- Return `stats`, `limits`, and `sampling` metadata

### Task 4: Downsampling strategies

- Implement `avg` and `minmax` (skip LTTB unless requested)
- Interval based on `(window / limit)`

### Task 5: Caching

- Cache key: `{machineId}:{field}:{window}:{start}:{end}:{limit}:{downsample}`
- TTL: 30–60 seconds

### Task 6: Documentation

- Update API docs with endpoint details and example response

## Execution Batches

- **Batch 1:** Tasks 1–3
- **Batch 2:** Tasks 4–5
- **Batch 3:** Task 6
