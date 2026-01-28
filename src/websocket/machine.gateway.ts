import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket'],
  // Add connection limits and timeouts
  maxHttpBufferSize: 1e6, // 1MB buffer limit
  pingTimeout: 60000, // 60 second ping timeout
  pingInterval: 25000, // 25 second ping interval
  upgradeTimeout: 10000, // 10 second upgrade timeout
  allowEIO3: false, // Disable legacy Engine.IO v3
})
export class MachineGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MachineGateway.name);
  private connectedClients = new Map<string, Set<string>>(); // deviceId -> Set of client IDs
  private connectionsByIP = new Map<string, number>(); // IP -> connection count
  private readonly MAX_CONNECTIONS_PER_IP = 5; // Limit connections per IP

  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
  ) {
    // Subscribe to Redis channels for real-time updates
    this.subscribeToRedisChannels();
  }

  handleConnection(client: Socket) {
    const clientIP = client.handshake.address;

    // Check connection limit per IP
    const currentConnections = this.connectionsByIP.get(clientIP) || 0;
    if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
      this.logger.error(
        `Connection limit exceeded for IP ${clientIP} (${currentConnections}/${this.MAX_CONNECTIONS_PER_IP})`,
      );
      client.emit('error', {
        message:
          'Connection limit exceeded. Please close other connections and try again.',
        code: 'CONNECTION_LIMIT_EXCEEDED',
      });
      client.disconnect(true);
      return;
    }

    // Increment connection count for this IP
    this.connectionsByIP.set(clientIP, currentConnections + 1);

    this.logger.log(
      `Client connected: ${client.id} from ${clientIP} (${currentConnections + 1}/${this.MAX_CONNECTIONS_PER_IP})`,
    );

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      this.logger.warn(`Client ${client.id} timed out - disconnecting`);
      client.disconnect(true);
    }, 300000); // 5 minutes timeout

    client.data.connectionTimeout = connectionTimeout;
    client.data.connectedAt = new Date();
    client.data.clientIP = clientIP;

    // Clear timeout on any activity
    client.onAny(() => {
      if (client.data.connectionTimeout) {
        clearTimeout(client.data.connectionTimeout);
        // Reset timeout
        client.data.connectionTimeout = setTimeout(() => {
          this.logger.warn(`Client ${client.id} timed out - disconnecting`);
          client.disconnect(true);
        }, 300000);
      }
    });

    client.emit('connection', {
      message: 'Connected to OPC UA Dashboard',
      serverTime: new Date().toISOString(),
      clientId: client.id,
      connectionsFromIP: currentConnections + 1,
      maxConnections: this.MAX_CONNECTIONS_PER_IP,
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Decrement connection count for this IP
    const clientIP = client.data?.clientIP || client.handshake.address;
    if (clientIP) {
      const currentConnections = this.connectionsByIP.get(clientIP) || 1;
      if (currentConnections <= 1) {
        this.connectionsByIP.delete(clientIP);
      } else {
        this.connectionsByIP.set(clientIP, currentConnections - 1);
      }
      this.logger.debug(
        `IP ${clientIP} now has ${Math.max(0, currentConnections - 1)} connections`,
      );
    }

    // Clear connection timeout
    if (client.data?.connectionTimeout) {
      clearTimeout(client.data.connectionTimeout);
    }

    // Remove client from all machine subscriptions
    for (const [deviceId, clients] of this.connectedClients.entries()) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        this.logger.debug(
          `Removed client ${client.id} from machine ${deviceId}`,
        );
        if (clients.size === 0) {
          this.connectedClients.delete(deviceId);
          this.logger.debug(`No more clients for machine ${deviceId}`);
        }
      }
    }

    // Log connection statistics
    const connectionDuration = client.data?.connectedAt
      ? Date.now() - client.data.connectedAt.getTime()
      : 0;
    this.logger.debug(
      `Client ${client.id} was connected for ${Math.round(connectionDuration / 1000)}s`,
    );
  }

  @SubscribeMessage('subscribe-machine')
  async handleMachineSubscription(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { deviceId: string },
  ) {
    const { deviceId } = payload;

    if (!deviceId) {
      client.emit('error', { message: 'Device ID is required' });
      return;
    }

    try {
      // Add client to machine subscription
      if (!this.connectedClients.has(deviceId)) {
        this.connectedClients.set(deviceId, new Set());
      }
      this.connectedClients.get(deviceId).add(client.id);

      // Join the client to a room for this device
      client.join(`machine-${deviceId}`);

      // Send current machine status from cache
      const cachedStatus = await this.redisService.getMachineStatus(deviceId);
      if (cachedStatus) {
        client.emit('machine-status', {
          deviceId,
          data: cachedStatus,
          source: 'cache',
        });
      }

      // Note: Historical data should be fetched via REST API endpoints
      // Removed automatic history sending to prevent large data transfers over WebSocket

      client.emit('subscription-confirmed', { deviceId });
      this.logger.log(`Client ${client.id} subscribed to machine ${deviceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to subscribe client to machine ${deviceId}:`,
        error,
      );
      client.emit('error', { message: 'Failed to subscribe to machine' });
    }
  }

  @SubscribeMessage('unsubscribe-machine')
  async handleMachineUnsubscription(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { deviceId: string },
  ) {
    const { deviceId } = payload;

    try {
      // Remove client from machine subscription
      if (this.connectedClients.has(deviceId)) {
        this.connectedClients.get(deviceId).delete(client.id);
        if (this.connectedClients.get(deviceId).size === 0) {
          this.connectedClients.delete(deviceId);
        }
      }

      // Leave the room
      client.leave(`machine-${deviceId}`);

      client.emit('unsubscription-confirmed', { deviceId });
      this.logger.log(
        `Client ${client.id} unsubscribed from machine ${deviceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe client from machine ${deviceId}:`,
        error,
      );
      client.emit('error', { message: 'Failed to unsubscribe from machine' });
    }
  }

  @SubscribeMessage('get-machine-status')
  async handleGetMachineStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { deviceId: string },
  ) {
    const { deviceId } = payload;

    try {
      const status = await this.redisService.getMachineStatus(deviceId);
      client.emit('machine-status', {
        deviceId,
        data: status,
        source: 'requested',
      });
    } catch (error) {
      this.logger.error(`Failed to get machine status for ${deviceId}:`, error);
      client.emit('error', { message: 'Failed to get machine status' });
    }
  }

  // Removed handleGetMachineHistory method - use REST API endpoints instead:
  // GET /machines/:id/realtime-history for paginated realtime data
  // GET /machines/:id/spc-history for paginated SPC data
  // GET /machines/:id/history/stream for streaming large datasets

  // Method called by MQTT processor when new data arrives
  broadcastRealtimeUpdate(deviceId: string, data: any) {
    const room = `machine-${deviceId}`;
    const subscribedCount = this.connectedClients.get(deviceId)?.size || 0;

    this.logger.log(`🔄 broadcastRealtimeUpdate called for device ${deviceId}`);
    this.logger.debug(
      `📊 Broadcasting realtime update to room ${room} with ${subscribedCount} subscribers`,
    );

    const payload = {
      deviceId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server.to(room).emit('realtime-update', payload);

    this.logger.log(
      `✅ Broadcasted realtime update for device ${deviceId} to room ${room} (${subscribedCount} clients)`,
    );
    this.logger.debug(`📋 Broadcast payload:`, {
      deviceId,
      dataType: data.topic,
      timestamp: payload.timestamp,
      subscribedClients: subscribedCount,
    });
  }

  broadcastSPCUpdate(deviceId: string, data: any) {
    const room = `machine-${deviceId}`;
    const subscribedCount = this.connectedClients.get(deviceId)?.size || 0;

    this.logger.log(`🔄 broadcastSPCUpdate called for device ${deviceId}`);
    this.logger.debug(
      `📊 Broadcasting SPC update to room ${room} with ${subscribedCount} subscribers`,
    );

    const payload = {
      deviceId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.server.to(room).emit('spc-update', payload);

    this.logger.log(
      `✅ Broadcasted SPC update for device ${deviceId} to room ${room} (${subscribedCount} clients)`,
    );
    this.logger.debug(`📋 SPC Broadcast payload:`, {
      deviceId,
      cycleNumber: data.Data?.CYCN,
      timestamp: payload.timestamp,
      subscribedClients: subscribedCount,
    });
  }

  broadcastMachineAlert(deviceId: string, alert: any) {
    const room = `machine-${deviceId}`;
    this.server.to(room).emit('machine-alert', {
      deviceId,
      alert,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Broadcasted alert for device ${deviceId}: ${alert.message}`,
    );
  }

  broadcastAlarmUpdate(deviceId: string, data: any) {
    const room = `machine-${deviceId}`;

    const payload = {
      deviceId,
      alarm: {
        id: data.Data.wmId,
        message: data.Data.wmMsg,
        timestamp: data.Data.wmTime,
      },
      timestamp: new Date().toISOString(),
    };

    this.server.to(room).emit('alarm-update', payload);

    this.logger.log(
      `🚨 Broadcasted alarm update for device ${deviceId}: ${data.Data.wmMsg}`,
    );
  }

  // Subscribe to Redis pub/sub channels for real-time updates
  private async subscribeToRedisChannels() {
    try {
      // Subscribe to realtime data updates
      await this.redisService.subscribe(
        'mqtt:realtime:processed',
        (message) => {
          const { deviceId, data } = message;
          this.broadcastRealtimeUpdate(deviceId, data);
        },
      );

      // Subscribe to SPC data updates
      await this.redisService.subscribe('mqtt:spc:processed', (message) => {
        const { deviceId, data } = message;
        this.broadcastSPCUpdate(deviceId, data);
      });

      // Subscribe to machine alerts
      await this.redisService.subscribe('machine:alerts', (message) => {
        const { deviceId, alert } = message;
        this.broadcastMachineAlert(deviceId, alert);
      });

      // Subscribe to alarm/warning messages
      await this.redisService.subscribe('mqtt:wm:processed', (message) => {
        const { deviceId, data } = message;
        this.broadcastAlarmUpdate(deviceId, data);
      });

      this.logger.log('Subscribed to Redis channels for real-time updates');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis channels:', error);
    }
  }

  // Health check endpoint
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // Get connected clients count for monitoring
  getConnectedClientsCount(): number {
    return this.server.sockets.sockets.size;
  }

  // Get machine subscriptions for monitoring
  getMachineSubscriptions(): Record<string, number> {
    const subscriptions: Record<string, number> = {};
    for (const [deviceId, clients] of this.connectedClients.entries()) {
      subscriptions[deviceId] = clients.size;
    }
    return subscriptions;
  }
}
