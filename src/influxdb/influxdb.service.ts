import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  InfluxDB,
  Point,
  WriteApi,
  QueryApi,
} from '@influxdata/influxdb-client';

export interface RealtimeData {
  devId: string;
  topic: string;
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    OT: number;
    ASTS: number;
    OPM: number;
    STS: number;
    T1: number;
    T2: number;
    T3: number;
    T4: number;
    T5: number;
    T6: number;
    T7: number;
  };
}

export interface SPCData {
  devId: string;
  topic: string;
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: {
    CYCN: string;
    ECYCT: string;
    EISS: string;
    EIVM: string;
    EIPM: string;
    ESIPT: string;
    ESIPP?: string;
    ESIPS?: string;
    EIPT?: string;
    EIPSE?: string;
    EFCHT?: string;
    EIPSMIN?: string;
    EOT?: string;
    EMOS?: string;
    EPLST?: string;
    EPLSSE?: string;
    EPLSPM?: string;
    ET1: string;
    ET2: string;
    ET3: string;
    ET4?: string;
    ET5?: string;
    ET6?: string;
    ET7?: string;
    ET8?: string;
    ET9?: string;
    ET10?: string;
  };
}

export interface WarningData {
  devId: string;
  topic: string; // 'wm'
  time: string;
  timestamp: number;
  Data: {
    wmId: number | string;
    wmMsg: string;
    wmTime: string;
  };
}

@Injectable()
export class InfluxDBService implements OnModuleInit {
  private readonly logger = new Logger(InfluxDBService.name);
  private influxDB: InfluxDB;
  private writeApi: WriteApi;
  private queryApi: QueryApi;

  async onModuleInit() {
    try {
      const url = process.env.INFLUXDB_URL || 'http://localhost:8086';
      const token =
        process.env.INFLUXDB_TOKEN || 'dev-token-super-secret-admin-token';
      const org = process.env.INFLUXDB_ORG || 'opcua-org';
      const bucket = process.env.INFLUXDB_BUCKET || 'machine-data';

      this.influxDB = new InfluxDB({ url, token });
      this.writeApi = this.influxDB.getWriteApi(org, bucket);
      this.queryApi = this.influxDB.getQueryApi(org);

      // Configure write options
      this.writeApi.useDefaultTags({ application: 'opcua-dashboard' });

      this.logger.log(
        `InfluxDB connected to ${url} with org: ${org}, bucket: ${bucket}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize InfluxDB connection', error);
      throw error;
    }
  }

  async writeRealtimeData(data: RealtimeData): Promise<void> {
    try {
      // Check if data timestamp is within retention policy window (1 hour)
      const dataTime = new Date(data.timestamp);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

      if (dataTime < oneHourAgo) {
        this.logger.warn(
          `Skipping realtime data for device ${data.devId}: timestamp ${dataTime.toISOString()} is older than retention policy (1 hour)`,
        );
        return;
      }

      const point = new Point('realtime')
        .tag('device_id', data.devId)
        .tag('topic', data.topic)
        .floatField('oil_temp', data.Data.OT)
        .intField('auto_start', data.Data.ASTS)
        .intField('operate_mode', data.Data.OPM)
        .intField('status', data.Data.STS)
        .floatField('temp_1', data.Data.T1)
        .floatField('temp_2', data.Data.T2)
        .floatField('temp_3', data.Data.T3)
        .floatField('temp_4', data.Data.T4)
        .floatField('temp_5', data.Data.T5)
        .floatField('temp_6', data.Data.T6)
        .floatField('temp_7', data.Data.T7)
        .timestamp(dataTime);

      this.writeApi.writePoint(point);
      this.logger.debug(`Wrote realtime data for device ${data.devId}`);
    } catch (error) {
      this.logger.error(
        `Failed to write realtime data for device ${data.devId}`,
        error,
      );
      throw error;
    }
  }

  async writeSPCData(data: SPCData): Promise<void> {
    try {
      // Check if data timestamp is within retention policy window (1 hour)
      const dataTime = new Date(data.timestamp);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

      if (dataTime < oneHourAgo) {
        this.logger.warn(
          `Skipping SPC data for device ${data.devId}: timestamp ${dataTime.toISOString()} is older than retention policy (1 hour)`,
        );
        return;
      }

      const point = new Point('spc')
        .tag('device_id', data.devId)
        .tag('topic', data.topic)
        .intField('cycle_number', parseInt(data.Data.CYCN))
        .floatField('cycle_time', parseFloat(data.Data.ECYCT))
        .floatField('injection_velocity_max', parseFloat(data.Data.EIVM))
        .floatField('injection_pressure_max', parseFloat(data.Data.EIPM))
        .floatField('switch_pack_time', parseFloat(data.Data.ESIPT))
        .floatField('temp_1', parseFloat(data.Data.ET1))
        .floatField('temp_2', parseFloat(data.Data.ET2))
        .floatField('temp_3', parseFloat(data.Data.ET3))
        .timestamp(dataTime);

      // Add optional fields if they exist
      if (data.Data.ESIPP)
        point.floatField('switch_pack_pressure', parseFloat(data.Data.ESIPP));
      if (data.Data.ESIPS)
        point.floatField('switch_pack_position', parseFloat(data.Data.ESIPS));
      if (data.Data.EIPT)
        point.floatField('injection_time', parseFloat(data.Data.EIPT));
      if (data.Data.EPLST)
        point.floatField('plasticizing_time', parseFloat(data.Data.EPLST));
      if (data.Data.EPLSPM)
        point.floatField(
          'plasticizing_pressure_max',
          parseFloat(data.Data.EPLSPM),
        );

      // Add additional temperature fields
      if (data.Data.ET4) point.floatField('temp_4', parseFloat(data.Data.ET4));
      if (data.Data.ET5) point.floatField('temp_5', parseFloat(data.Data.ET5));
      if (data.Data.ET6) point.floatField('temp_6', parseFloat(data.Data.ET6));
      if (data.Data.ET7) point.floatField('temp_7', parseFloat(data.Data.ET7));
      if (data.Data.ET8) point.floatField('temp_8', parseFloat(data.Data.ET8));
      if (data.Data.ET9) point.floatField('temp_9', parseFloat(data.Data.ET9));
      if (data.Data.ET10)
        point.floatField('temp_10', parseFloat(data.Data.ET10));

      // Add additional SPC metrics
      if (data.Data.EIPSE)
        point.floatField('injection_pressure_set', parseFloat(data.Data.EIPSE));
      if (data.Data.EFCHT)
        point.floatField('fill_cooling_time', parseFloat(data.Data.EFCHT));
      if (data.Data.EIPSMIN)
        point.floatField(
          'injection_pressure_set_min',
          parseFloat(data.Data.EIPSMIN),
        );
      if (data.Data.EOT)
        point.floatField('oil_temperature_cycle', parseFloat(data.Data.EOT));
      if (data.Data.EMOS)
        point.floatField('end_mold_open_speed', parseFloat(data.Data.EMOS));
      if (data.Data.EISS)
        point.floatField('injection_start_speed', parseFloat(data.Data.EISS));

      this.writeApi.writePoint(point);
      this.logger.debug(
        `Wrote SPC data for device ${data.devId}, cycle ${data.Data.CYCN}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write SPC data for device ${data.devId}`,
        error,
      );
      throw error;
    }
  }

  async writeWarningData(data: WarningData): Promise<void> {
    try {
      // Validate timestamp age (1 hour retention policy)
      const dataTime = new Date(data.timestamp);
      const now = new Date();
      const ageMs = now.getTime() - dataTime.getTime();
      const ageMinutes = ageMs / 60000;

      if (ageMinutes > 60) {
        this.logger.warn(
          `⚠️ Warning message is too old (${ageMinutes.toFixed(2)} minutes), skipping InfluxDB write to respect retention policy`,
        );
        return;
      }

      const dataTimeISO = new Date(data.timestamp).toISOString();

      const point = new Point('alarms')
        .tag('device_id', data.devId)
        .tag('topic', data.topic)
        .tag('alarm_id', data.Data.wmId.toString())
        .stringField('alarm_message', data.Data.wmMsg)
        .timestamp(dataTimeISO);

      this.writeApi.writePoint(point);
      this.logger.debug(
        `Wrote alarm data for device ${data.devId}, alarm ${data.Data.wmId}: ${data.Data.wmMsg}`,
      );
    } catch (error) {
      this.logger.error('Failed to write warning data to InfluxDB:', error);
      throw error;
    }
  }

  // Paginated Data Methods

  async queryRealtimeDataPaginated(
    deviceId: string,
    timeRange: string = '-1h',
    limit: number = 1000,
    offset: number = 0,
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "realtime")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
          |> limit(n: ${limit}, offset: ${offset})
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(
              `Paginated query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `Paginated query completed for device ${deviceId}, ${result.length} records (limit: ${limit}, offset: ${offset})`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query paginated realtime data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async querySPCDataPaginated(
    deviceId: string,
    timeRange: string = '-1h',
    limit: number = 1000,
    offset: number = 0,
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "spc")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
          |> limit(n: ${limit}, offset: ${offset})
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(
              `Paginated SPC query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `Paginated SPC query completed for device ${deviceId}, ${result.length} records (limit: ${limit}, offset: ${offset})`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query paginated SPC data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  // Aggregated Data Methods

  async queryRealtimeDataAggregated(
    deviceId: string,
    timeRange: string = '-1h',
    aggregation: string = '1m',
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "realtime")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> aggregateWindow(every: ${aggregation}, fn: mean, createEmpty: false)
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(
              `Aggregated query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `Aggregated query completed for device ${deviceId}, ${result.length} records (aggregation: ${aggregation})`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query aggregated realtime data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async querySPCDataAggregated(
    deviceId: string,
    timeRange: string = '-1h',
    aggregation: string = '1m',
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "spc")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> aggregateWindow(every: ${aggregation}, fn: mean, createEmpty: false)
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(
              `Aggregated SPC query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `Aggregated SPC query completed for device ${deviceId}, ${result.length} records (aggregation: ${aggregation})`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query aggregated SPC data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  // Count Methods for Pagination

  async getRealtimeDataCount(
    deviceId: string,
    timeRange: string = '-1h',
  ): Promise<number> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "realtime")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> count()
          |> yield(name: "count")
      `;

      return new Promise((resolve, reject) => {
        let count = 0;
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            count = record._value || 0;
          },
          error: (error) => {
            this.logger.error(
              `Count query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            resolve(count);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to get realtime data count for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async getSPCDataCount(
    deviceId: string,
    timeRange: string = '-1h',
  ): Promise<number> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "spc")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> count()
          |> yield(name: "count")
      `;

      return new Promise((resolve, reject) => {
        let count = 0;
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            count = record._value || 0;
          },
          error: (error) => {
            this.logger.error(
              `SPC count query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            resolve(count);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to get SPC data count for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  // Streaming Methods

  async streamRealtimeData(
    deviceId: string,
    timeRange: string = '-1h',
    onChunk: (chunk: any[]) => void,
    chunkSize: number = 100,
  ): Promise<void> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "realtime")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
      `;

      let chunk = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            chunk.push(record);

            if (chunk.length >= chunkSize) {
              onChunk([...chunk]);
              chunk = [];
            }
          },
          error: (error) => {
            this.logger.error(
              `Streaming query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            // Send remaining chunk if any
            if (chunk.length > 0) {
              onChunk(chunk);
            }
            resolve();
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to stream realtime data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async streamSPCData(
    deviceId: string,
    timeRange: string = '-1h',
    onChunk: (chunk: any[]) => void,
    chunkSize: number = 100,
  ): Promise<void> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "spc")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: true)
      `;

      let chunk = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            chunk.push(record);

            if (chunk.length >= chunkSize) {
              onChunk([...chunk]);
              chunk = [];
            }
          },
          error: (error) => {
            this.logger.error(
              `SPC streaming query failed for device ${deviceId}`,
              error,
            );
            reject(error);
          },
          complete: () => {
            // Send remaining chunk if any
            if (chunk.length > 0) {
              onChunk(chunk);
            }
            resolve();
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to stream SPC data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async flush(): Promise<void> {
    try {
      await this.writeApi.flush();
      this.logger.debug('InfluxDB write buffer flushed');
    } catch (error) {
      this.logger.error('Failed to flush InfluxDB write buffer', error);
      throw error;
    }
  }

  async queryRealtimeData(
    deviceId: string,
    timeRange: string = '-1h',
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "realtime")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(`Query failed for device ${deviceId}`, error);
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `Query completed for device ${deviceId}, ${result.length} records`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query realtime data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async querySPCData(
    deviceId: string,
    timeRange: string = '-1h',
  ): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'machine-data'}")
          |> range(start: ${timeRange})
          |> filter(fn: (r) => r["_measurement"] == "spc")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const result = [];
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row);
            result.push(record);
          },
          error: (error) => {
            this.logger.error(`SPC query failed for device ${deviceId}`, error);
            reject(error);
          },
          complete: () => {
            this.logger.debug(
              `SPC query completed for device ${deviceId}, ${result.length} records`,
            );
            resolve(result);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to query SPC data for device ${deviceId}`,
        error,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.writeApi?.close();
      this.logger.log('InfluxDB connection closed');
    } catch (error) {
      this.logger.error('Error closing InfluxDB connection', error);
    }
  }
}
