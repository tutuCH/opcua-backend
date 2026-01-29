import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RedisService } from '../redis/redis.service';

export type StreamPurpose = 'alerts' | 'data';

export type StreamEventType =
  | 'realtime-update'
  | 'spc-update'
  | 'spc-series-update'
  | 'machine-alert'
  | 'alarm-update'
  | 'machine-status'
  | 'system';

export interface StreamEvent {
  id?: string;
  type: StreamEventType;
  deviceId?: string;
  data: any;
}

interface StreamConnection {
  id: string;
  ip: string;
  userId: number;
  purpose: StreamPurpose;
  deviceIds: string[];
  connectedAt: Date;
}

@Injectable()
export class RealtimeStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeStreamService.name);
  private readonly subject = new Subject<StreamEvent>();
  private readonly connections = new Map<string, StreamConnection>();
  private readonly connectionsByIp = new Map<string, number>();
  private readonly deviceSubscriptions = new Map<string, Set<string>>();
  private readonly maxConnectionsPerIp = 5;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    await this.subscribeToRedisChannels();
  }

  onModuleDestroy() {
    this.subject.complete();
    this.connections.clear();
    this.connectionsByIp.clear();
    this.deviceSubscriptions.clear();
  }

  events$(): Observable<StreamEvent> {
    return this.subject.asObservable();
  }

  /**
   * Observable for alert events only
   * Emits: machine-alert, alarm-update, system (heartbeat)
   */
  alertEvents$(): Observable<StreamEvent> {
    return this.subject.asObservable().pipe(
      filter(event =>
        event.type === 'machine-alert' ||
        event.type === 'alarm-update' ||
        (event.type === 'system' && event.data?.kind === 'heartbeat')
      )
    );
  }

  /**
   * Observable for data events only
   * Emits: realtime-update, spc-update, spc-series-update, machine-status, system (heartbeat)
   */
  dataEvents$(): Observable<StreamEvent> {
    return this.subject.asObservable().pipe(
      filter(event =>
        event.type === 'realtime-update' ||
        event.type === 'spc-update' ||
        event.type === 'spc-series-update' ||
        event.type === 'machine-status' ||
        (event.type === 'system' && event.data?.kind === 'heartbeat')
      )
    );
  }

  publish(event: StreamEvent): void {
    this.subject.next(event);
  }

  resolveDeviceIds(deviceId?: string, deviceIdsCsv?: string): string[] {
    const deviceIds = new Set<string>();

    if (deviceId) {
      deviceIds.add(deviceId.trim());
    }

    if (deviceIdsCsv) {
      deviceIdsCsv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => deviceIds.add(id));
    }

    return Array.from(deviceIds);
  }

  matchesDevice(
    eventDeviceId: string | undefined,
    deviceIds: string[],
  ): boolean {
    if (!eventDeviceId || deviceIds.length === 0) {
      return false;
    }

    return deviceIds.includes(eventDeviceId);
  }

  canAcceptConnection(userId: number, purpose: StreamPurpose, ip: string): boolean {
    // Check IP limit (backward compatibility)
    const ipConnections = this.connectionsByIp.get(ip) || 0;
    if (ipConnections >= this.maxConnectionsPerIp) {
      this.logger.warn(`IP ${ip} exceeded connection limit (${this.maxConnectionsPerIp})`);
      return false;
    }

    return true;
  }

  registerConnection(
    connectionId: string,
    ip: string,
    userId: number,
    purpose: StreamPurpose,
    deviceIds: string[]
  ): void {
    // Update IP counter
    const ipCount = this.connectionsByIp.get(ip) || 0;
    this.connectionsByIp.set(ip, ipCount + 1);

    // Store connection
    this.connections.set(connectionId, {
      id: connectionId,
      ip,
      userId,
      purpose,
      deviceIds,
      connectedAt: new Date(),
    });

    // Update device subscriptions (only for data streams)
    if (purpose === 'data') {
      deviceIds.forEach(deviceId => {
        const subSet = this.deviceSubscriptions.get(deviceId) || new Set();
        subSet.add(connectionId);
        this.deviceSubscriptions.set(deviceId, subSet);
      });
    }

    this.logger.log(
      `Connection registered: ${connectionId} (user: ${userId}, purpose: ${purpose}, devices: ${deviceIds.length})`
    );
  }

  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Update IP counter
    const ipCount = this.connectionsByIp.get(connection.ip) || 1;
    if (ipCount <= 1) {
      this.connectionsByIp.delete(connection.ip);
    } else {
      this.connectionsByIp.set(connection.ip, ipCount - 1);
    }

    // Remove device subscriptions
    connection.deviceIds.forEach(deviceId => {
      const subSet = this.deviceSubscriptions.get(deviceId);
      if (subSet) {
        subSet.delete(connectionId);
        if (subSet.size === 0) {
          this.deviceSubscriptions.delete(deviceId);
        }
      }
    });

    this.connections.delete(connectionId);

    this.logger.log(
      `Connection unregistered: ${connectionId} (user: ${connection.userId}, purpose: ${connection.purpose})`
    );
  }

  getConnectedClientsCount(): number {
    return this.connections.size;
  }

  getMachineSubscriptions(): Record<string, number> {
    const subscriptions: Record<string, number> = {};
    for (const [deviceId, clients] of this.deviceSubscriptions.entries()) {
      subscriptions[deviceId] = clients.size;
    }
    return subscriptions;
  }

  /**
   * Get connection statistics for a user
   */
  getConnectionStats(userId: number): { alerts: number; data: number; total: number } {
    let alerts = 0;
    let data = 0;

    for (const connection of this.connections.values()) {
      if (connection.userId !== userId) {
        continue;
      }

      if (connection.purpose === 'alerts') {
        alerts++;
      } else {
        data++;
      }
    }

    return {
      alerts,
      data,
      total: alerts + data,
    };
  }

  /**
   * Get all connections for a user (for debugging)
   */
  getUserConnections(userId: number): Array<{ id: string; purpose: StreamPurpose; deviceIds: string[]; connectedAt: Date }> {
    const result = [];
    for (const [id, conn] of this.connections.entries()) {
      if (conn.userId === userId) {
        result.push({
          id,
          purpose: conn.purpose,
          deviceIds: conn.deviceIds,
          connectedAt: conn.connectedAt,
        });
      }
    }
    return result;
  }

  getMaxConnectionsPerIp(): number {
    return this.maxConnectionsPerIp;
  }

  private async subscribeToRedisChannels(): Promise<void> {
    await this.redisService.subscribe('mqtt:realtime:processed', (message) => {
      if (!message?.deviceId) {
        return;
      }

      this.publish({
        type: 'realtime-update',
        deviceId: message.deviceId,
        data: {
          deviceId: message.deviceId,
          data: message.data,
          timestamp: new Date().toISOString(),
        },
      });
    });

    await this.redisService.subscribe('mqtt:spc:processed', (message) => {
      if (!message?.deviceId) {
        return;
      }

      this.publish({
        type: 'spc-update',
        deviceId: message.deviceId,
        data: {
          deviceId: message.deviceId,
          data: message.data,
          timestamp: new Date().toISOString(),
        },
      });
    });

    await this.redisService.subscribe('machine:alerts', (message) => {
      if (!message?.deviceId) {
        return;
      }

      this.publish({
        type: 'machine-alert',
        deviceId: message.deviceId,
        data: {
          deviceId: message.deviceId,
          alert: message.alert,
          timestamp: new Date().toISOString(),
        },
      });
    });

    this.logger.log('Subscribed to Redis channels for SSE streaming');
  }
}
