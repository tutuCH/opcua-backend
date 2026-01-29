import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  MessageEvent,
  NotFoundException,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { RealtimeStreamService } from './realtime-stream.service';
import { RealtimeStreamAuthService } from './realtime-stream-auth.service';
import { MachinesService } from '../machines/machines.service';
import { Public } from '../auth/decorators/public.decorator';
import { CreateStreamTicketDto } from './dto/create-stream-ticket.dto';

@Controller('sse')
export class RealtimeStreamController {
  private readonly logger = new Logger(RealtimeStreamController.name);

  constructor(
    private readonly streamService: RealtimeStreamService,
    private readonly streamAuthService: RealtimeStreamAuthService,
    private readonly machinesService: MachinesService,
  ) {}

  /**
   * SSE endpoint for alerts stream
   * Always-on, global scope, no device filtering
   */
  @Public()
  @Sse('alerts')
  async streamAlerts(
    @Req() req: Request,
    @Query('ticket') ticket?: string,
  ): Promise<Observable<MessageEvent>> {
    // Authenticate user
    const { userId, ticketId } = await this.streamAuthService.resolveUserId({
      ticket,
      authorization: req.headers.authorization,
      purpose: 'alerts',
    });

    const clientIp = this.getClientIp(req);

    // Check connection limits
    if (!this.streamService.canAcceptConnection(userId, 'alerts', clientIp)) {
      const stats = this.streamService.getConnectionStats(userId);
      const activeConnectionsTotal = this.streamService.getActiveConnectionsTotal();
      const activeConnectionsByDeviceId = this.streamService.getActiveConnectionsByDeviceId();
      const activeConnectionsByUserDevice = this.streamService.getActiveConnectionsByUserDevice(userId);
      throw new HttpException(
        {
          statusCode: 429,
          message: `Alert stream connection limit exceeded`,
          error: 'Too Many Requests',
          currentConnections: stats,
          activeConnectionsTotal,
          activeConnectionsByDeviceId,
          activeConnectionsByUserDevice,
          limits: { perIp: this.streamService.getMaxConnectionsPerIp() },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const connectionId = randomUUID();

    return new Observable<MessageEvent>((subscriber) => {
      // Register connection
      this.streamService.registerConnection(connectionId, clientIp, userId, 'alerts', []);

      this.logger.log(
        JSON.stringify({
          event: 'sse.connect',
          timestamp: new Date().toISOString(),
          connectionId,
          userId,
          ticketId,
          ip: clientIp,
          purpose: 'alerts',
        })
      );

      // Subscribe to alert events (no device filtering)
      const eventsSubscription = this.streamService
        .alertEvents$()
        .pipe(
          map(
            (event) =>
              ({
                id: event.id,
                type: event.type,
                data: event.data,
              }) as MessageEvent,
          ),
        )
        .subscribe({
          next: (event) => subscriber.next(event),
          error: (error) => subscriber.error(error),
        });

      // Heartbeat (25 seconds)
      const heartbeatSubscription = interval(25000)
        .pipe(
          map(
            () =>
              ({
                type: 'system',
                data: {
                  kind: 'heartbeat',
                  ts: new Date().toISOString(),
                },
              }) as MessageEvent,
          ),
        )
        .subscribe((event) => subscriber.next(event));

      // Cleanup on disconnect
      return () => {
        eventsSubscription.unsubscribe();
        heartbeatSubscription.unsubscribe();
        this.streamService.unregisterConnection(connectionId);
        this.logger.log(
          JSON.stringify({
            event: 'sse.disconnect',
            timestamp: new Date().toISOString(),
            connectionId,
            userId,
            ticketId,
            ip: clientIp,
            purpose: 'alerts',
          })
        );
      };
    });
  }

  /**
   * SSE endpoint for data stream
   * Device-scoped, 1-10 devices per connection
   */
  @Public()
  @Sse('stream')
  async stream(
    @Req() req: Request,
    @Query('deviceId') deviceId?: string,
    @Query('deviceIds') deviceIdsCsv?: string,
    @Query('includeStatus') includeStatus?: string,
    @Query('ticket') ticket?: string,
  ): Promise<Observable<MessageEvent>> {
    const deviceIds = this.streamService.resolveDeviceIds(deviceId, deviceIdsCsv);

    if (deviceIds.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'deviceId or deviceIds parameter required for data stream',
        error: 'Bad Request',
      });
    }

    if (deviceIds.length > 10) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Maximum 10 devices allowed per data stream',
        error: 'Bad Request',
        requested: deviceIds.length,
        limit: 10,
      });
    }

    // Authenticate user
    const { userId, ticketId } = await this.streamAuthService.resolveUserId({
      ticket,
      authorization: req.headers.authorization,
      purpose: 'data',
    });

    // Validate device ownership
    try {
      await Promise.all(
        deviceIds.map((id) => this.machinesService.findOneByNameForUser(id, userId)),
      );
    } catch (error) {
      if (error.status === 404) {
        throw new ForbiddenException({
          statusCode: 403,
          message: `Access denied to one or more devices`,
          error: 'Forbidden',
        });
      }
      throw error;
    }

    const clientIp = this.getClientIp(req);

    // Check connection limits
    if (!this.streamService.canAcceptConnection(userId, 'data', clientIp)) {
      const stats = this.streamService.getConnectionStats(userId);
      const activeConnectionsTotal = this.streamService.getActiveConnectionsTotal();
      const activeConnectionsByDeviceId = this.streamService.getActiveConnectionsByDeviceId();
      const activeConnectionsByUserDevice = this.streamService.getActiveConnectionsByUserDevice(userId);
      throw new HttpException(
        {
          statusCode: 429,
          message: `Data stream connection limit exceeded`,
          error: 'Too Many Requests',
          currentConnections: stats,
          activeConnectionsTotal,
          activeConnectionsByDeviceId,
          activeConnectionsByUserDevice,
          limits: { perIp: this.streamService.getMaxConnectionsPerIp() },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const connectionId = randomUUID();
    const shouldIncludeStatus = includeStatus !== 'false' && includeStatus !== '0';

    return new Observable<MessageEvent>((subscriber) => {
      // Register connection
      this.streamService.registerConnection(connectionId, clientIp, userId, 'data', deviceIds);

      this.logger.log(
        JSON.stringify({
          event: 'sse.connect',
          timestamp: new Date().toISOString(),
          connectionId,
          userId,
          ticketId,
          ip: clientIp,
          purpose: 'data',
          deviceIds,
        })
      );

      // Send initial machine status if requested
      if (shouldIncludeStatus) {
        Promise.all(deviceIds.map((id) => this.machinesService.getMachineStatus(id)))
          .then((statuses) => {
            statuses.forEach((status) => {
              subscriber.next({
                type: 'machine-status',
                data: status,
              });
            });
          })
          .catch((error) => {
            this.logger.warn(
              `Failed to load machine status for ${connectionId}: ${error?.message || error}`,
            );
          });
      }

      // Subscribe to data events with device filtering
      const eventsSubscription = this.streamService
        .dataEvents$()
        .pipe(
          filter((event) => this.streamService.matchesDevice(event.deviceId, deviceIds)),
          map(
            (event) =>
              ({
                id: event.id,
                type: event.type,
                data: event.data,
              }) as MessageEvent,
          ),
        )
        .subscribe({
          next: (event) => subscriber.next(event),
          error: (error) => subscriber.error(error),
        });

      // Heartbeat (25 seconds)
      const heartbeatSubscription = interval(25000)
        .pipe(
          map(
            () =>
              ({
                type: 'system',
                data: {
                  kind: 'heartbeat',
                  ts: new Date().toISOString(),
                },
              }) as MessageEvent,
          ),
        )
        .subscribe((event) => subscriber.next(event));

      // Cleanup on disconnect
      return () => {
        eventsSubscription.unsubscribe();
        heartbeatSubscription.unsubscribe();
        this.streamService.unregisterConnection(connectionId);
        this.logger.log(
          JSON.stringify({
            event: 'sse.disconnect',
            timestamp: new Date().toISOString(),
            connectionId,
            userId,
            ticketId,
            ip: clientIp,
            purpose: 'data',
            deviceIds,
          })
        );
      };
    });
  }

  @Post('stream-ticket')
  async createStreamTicket(
    @Req() req: Request,
    @Body() dto: CreateStreamTicketDto,
  ): Promise<{ ticket: string; expiresInSeconds: number; ticketId: string }> {
    const user = (req as Request & { user?: { userId?: number } }).user;
    if (!user?.userId) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Authentication required',
        error: 'Unauthorized',
      });
    }

    return this.streamAuthService.createStreamTicket(user.userId, dto);
  }

  /**
   * Status endpoint for debugging
   * Returns user connection stats and ticket validity
   * Requires Bearer token authentication
   */
  @Get('status')
  async getStatus(
    @Req() req: Request,
    @Query('ticket') ticket?: string,
  ): Promise<any> {
    // Get userId from JWT (global guard already validated it)
    const user = (req as Request & { user?: { userId?: number } }).user;
    if (!user?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // Optionally validate ticket if provided (for testing ticket validity)
    let ticketPurpose = 'N/A';
    if (ticket) {
      const ticketResult = await this.streamAuthService.resolveUserId({
        ticket,
        authorization: undefined,
      });
      ticketPurpose = ticketResult.ticketPurpose;
    }

    const userId = user.userId;

    const stats = this.streamService.getConnectionStats(userId);
    const connections = this.streamService.getUserConnections(userId);
    const activeConnectionsTotal = this.streamService.getActiveConnectionsTotal();
    const activeConnectionsByDeviceId = this.streamService.getActiveConnectionsByDeviceId();
    const activeConnectionsByUserDevice = this.streamService.getActiveConnectionsByUserDevice(userId);

    return {
      userId,
      ticketPurpose,
      connections: stats,
      activeConnectionsTotal,
      activeConnectionsByDeviceId,
      activeConnectionsByUserDevice,
      limits: { perIp: this.streamService.getMaxConnectionsPerIp() },
      activeConnections: connections.map(conn => ({
        id: conn.id,
        purpose: conn.purpose,
        deviceCount: conn.deviceIds.length,
        devices: conn.deviceIds,
        connectedAt: conn.connectedAt,
        uptime: Math.floor((Date.now() - conn.connectedAt.getTime()) / 1000),
      })),
    };
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}
