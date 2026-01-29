# Backend API Requirements for SPC Performance Optimization

## Overview

This document outlines required backend API changes to support the frontend performance optimization strategy for the SPC Analysis dashboard. The focus is on reducing data transfer overhead, enabling efficient incremental updates, and providing precomputed metrics to offload client-side computation.

---

## 1. Field Selection API

### Purpose

Reduce payload size by allowing clients to fetch only the metric fields they need instead of full dataset.

### API Endpoint

```
GET /api/machines/{deviceId}/spc/history?limit=50&fields=cycle_time,injection_velocity_max,injection_pressure_max
GET /api/machines/{deviceId}/realtime/history?limit=50&fields=temp_1,temp_2,temp_3,oil_temp
```

### Query Parameters

| Parameter | Type   | Required | Description                                                          | Example                             |
| --------- | ------ | -------- | -------------------------------------------------------------------- | ----------------------------------- |
| `fields`  | string | No       | Comma-separated list of metric fields to return. Default: all fields | `cycle_time,injection_velocity_max` |
| `limit`   | number | No       | Maximum number of records to return. Default: 10                     | `50`                                |
| `offset`  | number | No       | Number of records to skip. Default: 0                                | `0`                                 |

### Request Example

```http
GET /api/machines/M1/spc/history?limit=50&fields=cycle_time,injection_velocity_max,injection_pressure_max HTTP/1.1
Authorization: Bearer <token>
```

### Success Response (200 OK)

```json
{
  "data": [
    {
      "_time": "2025-01-17T10:00:00Z",
      "cycle_time": 12.5,
      "injection_velocity_max": 85.3,
      "injection_pressure_max": 120.0
    },
    {
      "_time": "2025-01-17T10:01:00Z",
      "cycle_time": 12.8,
      "injection_velocity_max": 84.2,
      "injection_pressure_max": 118.5
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0
  },
  "metadata": {
    "deviceId": "M1",
    "timeRange": "2025-01-17T09:00:00Z/2025-01-17T10:50:00Z",
    "aggregate": "none"
  }
}
```

### Error Responses

- **400 Bad Request**: Invalid field names provided
- **401 Unauthorized**: Missing or invalid authentication
- **404 Not Found**: Machine ID not found

---

## 2. Precomputed SPC Control Limits API

### Purpose

Offload CPU-intensive SPC calculations (mean, UCL, LCL, standard deviation) to the server to reduce client-side computation and prevent UI freezing.

### API Endpoint

```
GET /api/machines/{deviceId}/spc/limits?fields=cycle_time,injection_velocity_max&timeRange=24h
```

### Query Parameters

| Parameter   | Type   | Required | Description                                                    | Example                             |
| ----------- | ------ | -------- | -------------------------------------------------------------- | ----------------------------------- |
| `fields`    | string | Yes      | Comma-separated list of metric fields                          | `cycle_time,injection_velocity_max` |
| `timeRange` | string | No       | Time range for calculation. Default: `24h`                     | `24h`, `1h`, `7d`                   |
| `sigma`     | number | No       | Number of standard deviations for control limits. Default: `3` | `3`                                 |

### Request Example

```http
GET /api/machines/M1/spc/limits?fields=cycle_time,injection_velocity_max&timeRange=24h HTTP/1.1
Authorization: Bearer <token>
```

### Success Response (200 OK)

```json
{
  "limits": {
    "cycle_time": {
      "mean": 12.5,
      "stdDev": 0.8,
      "ucl": 14.9,
      "lcl": 10.1,
      "n": 50,
      "calculatedAt": "2025-01-17T10:50:00Z"
    },
    "injection_velocity_max": {
      "mean": 84.5,
      "stdDev": 2.3,
      "ucl": 91.4,
      "lcl": 77.6,
      "n": 50,
      "calculatedAt": "2025-01-17T10:50:00Z"
    }
  },
  "metadata": {
    "deviceId": "M1",
    "timeRange": "2025-01-16T10:50:00Z/2025-01-17T10:50:00Z",
    "sigma": 3
  }
}
```

### Error Responses

- **400 Bad Request**: Invalid field names or time range format
- **401 Unauthorized**: Missing or invalid authentication
- **404 Not Found**: Machine ID not found
- **422 Unprocessable Entity**: Insufficient data for calculation (n < 2)

---

## 3. Data Aggregation / Down-sampling API

### Purpose

Reduce data volume for long time ranges by aggregating data points into time buckets (e.g., 1-minute, 5-minute averages).

### API Endpoint

```
GET /api/machines/{deviceId}/spc/history?limit=50&aggregate=1m&aggregateType=avg
GET /api/machines/{deviceId}/realtime/history?limit=50&aggregate=5m&aggregateType=median
```

### Query Parameters

| Parameter       | Type   | Required | Description                              | Example                                |
| --------------- | ------ | -------- | ---------------------------------------- | -------------------------------------- |
| `aggregate`     | string | No       | Aggregation interval. Default: `none`    | `1m`, `5m`, `15m`, `1h`                |
| `aggregateType` | string | No       | Aggregation function. Default: `avg`     | `avg`, `min`, `max`, `median`, `count` |
| `fields`        | string | No       | Comma-separated list of fields to return | `cycle_time,injection_velocity_max`    |
| `limit`         | number | No       | Maximum number of aggregated records     | `50`                                   |

### Request Example

```http
GET /api/machines/M1/spc/history?limit=50&aggregate=5m&aggregateType=avg&fields=cycle_time HTTP/1.1
Authorization: Bearer <token>
```

### Success Response (200 OK)

```json
{
  "data": [
    {
      "_time": "2025-01-17T10:00:00Z",
      "cycle_time": 12.5,
      "_count": 5
    },
    {
      "_time": "2025-01-17T10:05:00Z",
      "cycle_time": 12.8,
      "_count": 4
    }
  ],
  "pagination": {
    "total": 200,
    "limit": 50,
    "offset": 0
  },
  "metadata": {
    "deviceId": "M1",
    "timeRange": "2025-01-17T08:00:00Z/2025-01-17T12:00:00Z",
    "aggregate": "5m",
    "aggregateType": "avg"
  }
}
```

### Notes

- `_count` field indicates the number of original data points in each aggregated bucket
- For aggregateType `median`, use linear interpolation for odd/even count

---

## 4. Differential SSE Updates

### Purpose

Reduce SSE payload size by sending only changed fields instead of full data objects on each update.

### Current Behavior (Full Object Update)

```json
{
  "deviceId": "M1",
  "timestamp": "2025-01-17T10:50:00Z",
  "Data": {
    "CYCN": "12345",
    "ECYCT": "12.5",
    "EIVM": "85.3",
    "EIPM": "120.0",
    "ESIPT": "2.1",
    "ET1": "220.5",
    "ET2": "218.0",
    "ET3": "222.0"
    // ... 20+ more fields
  }
}
```

### Proposed Behavior (Differential Update)

```json
{
  "deviceId": "M1",
  "timestamp": "2025-01-17T10:50:00Z",
  "type": "spc-update-diff",
  "changes": {
    "CYCN": "12346",
    "ECYCT": "12.6"
  }
}
```

### Update Events

#### SPC Update Event (Differential)

```json
{
  "deviceId": "M1",
  "timestamp": "2025-01-17T10:50:00Z",
  "type": "spc-update-diff",
  "changes": {
    "cycle_number": "12346",
    "cycle_time": "12.6"
  }
}
```

#### Realtime Update Event (Differential)

```json
{
  "deviceId": "M1",
  "timestamp": "2025-01-17T10:50:00Z",
  "type": "realtime-update-diff",
  "changes": {
    "temp_1": "221.0",
    "oil_temp": "75.5"
  }
}
```

### Implementation Notes

- Maintain backward compatibility: Support both full object and differential updates
- Differential format should include only fields that changed since last update
- Add `type` field to distinguish between full and differential updates
- Field names should match frontend normalization (e.g., `cycle_time` instead of `ECYCT`)

---

## 5. SSE Compression

### Purpose

Further reduce payload size by using serialization instead of JSON.

### Options

#### Option A: MessagePack (Recommended)

```javascript
// Client example
import msgpack from 'msgpack-lite';

socket.binaryType = 'arraybuffer';
socket.onmessage = (event) => {
  const decoded = msgpack.decode(new Uint8Array(event.data));
};
```

#### Option B: Protocol Buffers

Define schema in `.proto` file:

```protobuf
syntax = "proto3";

message SPCUpdate {
  string device_id = 1;
  string timestamp = 2;
  map<string, string> changes = 3;
}
```

### Request Example (MessagePack)

```
Binary payload: 0x81 a7 64 65 76 69 63 65 49 64 a2 4d 31 ...
```

---

## 6. Batch API for Multiple Machines

### Purpose

Fetch data for multiple machines in a single request to reduce HTTP overhead.

### API Endpoint

```
GET /api/machines/spc/batch?machines=M1,M2,M3&fields=cycle_time&limit=50
GET /api/machines/realtime/batch?machines=M1,M2&fields=temp_1,oil_temp&limit=50
```

### Query Parameters

| Parameter  | Type   | Required | Description                              | Example                             |
| ---------- | ------ | -------- | ---------------------------------------- | ----------------------------------- |
| `machines` | string | Yes      | Comma-separated list of machine IDs      | `M1,M2,M3`                          |
| `fields`   | string | No       | Comma-separated list of metric fields    | `cycle_time,injection_velocity_max` |
| `limit`    | number | No       | Maximum records per machine. Default: 10 | `50`                                |

### Request Example

```http
GET /api/machines/spc/batch?machines=M1,M2,M3&fields=cycle_time&limit=50 HTTP/1.1
Authorization: Bearer <token>
```

### Success Response (200 OK)

```json
{
  "results": {
    "M1": {
      "data": [
        {
          "_time": "2025-01-17T10:00:00Z",
          "cycle_time": 12.5
        }
      ],
      "pagination": {
        "total": 150,
        "limit": 50,
        "offset": 0
      }
    },
    "M2": {
      "data": [
        {
          "_time": "2025-01-17T10:00:00Z",
          "cycle_time": 11.8
        }
      ],
      "pagination": {
        "total": 120,
        "limit": 50,
        "offset": 0
      }
    },
    "M3": {
      "data": [
        {
          "_time": "2025-01-17T10:00:00Z",
          "cycle_time": 13.2
        }
      ],
      "pagination": {
        "total": 180,
        "limit": 50,
        "offset": 0
      }
    }
  },
  "metadata": {
    "requestedMachines": 3,
    "successfulMachines": 3
  }
}
```

---

## 7. SSE Subscription Options

### Purpose

Allow clients to specify which metrics to receive updates for via SSE.

### Subscribe Request

```json
{
  "action": "subscribe",
  "deviceId": "M1",
  "metrics": ["cycle_time", "injection_velocity_max", "temp_1"]
}
```

### Subscribe Response

```json
{
  "status": "subscribed",
  "deviceId": "M1",
  "metrics": ["cycle_time", "injection_velocity_max", "temp_1"],
  "timestamp": "2025-01-17T10:50:00Z"
}
```

### Unsubscribe Request

```json
{
  "action": "unsubscribe",
  "deviceId": "M1"
}
```

---

## Implementation Priority

### Phase 1: Critical (Implement First)

1. **Field Selection API** (Section 1) - Immediate payload reduction
2. **Precomputed SPC Control Limits API** (Section 2) - Offload CPU computation
3. **Differential SSE Updates** (Section 4) - Reduce SSE payload

### Phase 2: High Impact

4. **Data Aggregation / Down-sampling API** (Section 3) - Reduce historical data size
5. **SSE Subscription Options** (Section 7) - Filter metrics at source

### Phase 3: Nice-to-Have

6. **SSE Compression** (Section 5) - Additional payload reduction
7. **Batch API for Multiple Machines** (Section 6) - Reduce HTTP calls for multi-machine views

---

## Backward Compatibility

All new API features should maintain backward compatibility:

- Default behavior should match current API when new parameters are not provided
- SSE differential updates should be opt-in via client capability negotiation
- Field selection API should return all fields when `fields` parameter is omitted

---

## Performance Targets

- **Initial page load**: < 2 seconds for 10 charts with 50 data points each
- **SSE update latency**: < 100ms from server to client
- **SSE payload size**: < 1KB per update (currently ~5-10KB)
- **SPC limit calculation**: < 50ms server-side response time
- **API response time**: < 200ms for 50 records with field selection
