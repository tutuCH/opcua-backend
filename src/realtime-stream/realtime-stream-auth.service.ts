import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { CreateStreamTicketDto } from './dto/create-stream-ticket.dto';

interface StreamTicketResult {
  ticket: string;
  expiresInSeconds: number;
  ticketId: string;
}

@Injectable()
export class RealtimeStreamAuthService {
  private readonly logger = new Logger(RealtimeStreamAuthService.name);
  private readonly defaultTicketTtlSeconds: number;
  private readonly maxTicketTtlSeconds = 3600;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const configured = Number(
      this.configService.get('stream.ticketTtlSeconds') ??
        process.env.STREAM_TICKET_TTL_SECONDS ??
        300,
    );
    this.defaultTicketTtlSeconds = Number.isFinite(configured)
      ? Math.max(60, configured)
      : 300;
  }

  async createStreamTicket(
    userId: number,
    dto: CreateStreamTicketDto = {},
  ): Promise<{ ticket: string; expiresInSeconds: number; ticketId: string }> {
    const ttl = this.normalizeTtl(dto.ttlSeconds);
    const ticketId = randomUUID();
    const purpose = dto.purpose || 'any';  // 'any' for backward compatibility

    // Create JWT with ticket metadata
    const ticket = await this.jwtService.signAsync(
      {
        sub: userId.toString(),
        typ: 'stream-ticket',
        tid: ticketId,
        pur: purpose,
      },
      { expiresIn: ttl }
    );

    // Store in Redis for validation
    const ticketData = {
      userId,
      purpose,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };

    await this.redisService.set(
      `sse:ticket:${ticketId}`,
      JSON.stringify(ticketData),
      ttl
    );

    this.logger.log(
      `Stream ticket created: ${ticketId} (user: ${userId}, purpose: ${purpose}, ttl: ${ttl}s)`
    );

    return { ticket, expiresInSeconds: ttl, ticketId };
  }

  async resolveUserId(options: {
    ticket?: string;
    authorization?: string;
    purpose?: 'alerts' | 'data';
  }): Promise<{ userId: number; ticketPurpose: string }> {
    const { ticket, authorization, purpose } = options;

    if (ticket) {
      const result = await this.verifyStreamTicket(ticket, purpose);
      return { userId: result.userId, ticketPurpose: result.purpose };
    }

    if (authorization) {
      const userId = this.verifyAccessToken(authorization);
      return { userId, ticketPurpose: 'any' };
    }

    throw new UnauthorizedException('Stream authentication required');
  }

  private async verifyStreamTicket(
    ticket: string,
    requiredPurpose?: 'alerts' | 'data'
  ): Promise<{ userId: number; purpose: string }> {
    try {
      const payload = this.jwtService.verify(ticket);

      if (payload?.typ !== 'stream-ticket') {
        throw new UnauthorizedException('Invalid stream ticket');
      }

      const ticketId = payload.tid;
      if (!ticketId) {
        // Legacy ticket without Redis storage - backward compatible
        this.logger.warn('Stream ticket missing ticket ID (legacy format)');
        const userId = Number(payload.sub);
        if (!Number.isFinite(userId)) {
          throw new UnauthorizedException('Invalid stream ticket');
        }
        return { userId, purpose: payload.pur || 'any' };
      }

      // Check Redis for ticket validity
      const ticketDataStr = await this.redisService.get(`sse:ticket:${ticketId}`);
      if (!ticketDataStr) {
        throw new UnauthorizedException('Stream ticket expired or not found');
      }

      const ticketData = JSON.parse(ticketDataStr as string) as {
        userId: number;
        purpose: string;
        issuedAt: string;
        expiresAt: string;
      };

      // Validate purpose if required
      if (requiredPurpose && ticketData.purpose !== 'any' && ticketData.purpose !== requiredPurpose) {
        throw new UnauthorizedException(
          `Ticket not valid for ${requiredPurpose} stream (ticket purpose: ${ticketData.purpose})`
        );
      }

      const userId = Number(payload.sub);
      if (!Number.isFinite(userId)) {
        throw new UnauthorizedException('Invalid stream ticket');
      }

      return { userId, purpose: ticketData.purpose };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Stream ticket validation failed: ${error?.message || error}`);
      throw new UnauthorizedException('Invalid or expired stream ticket');
    }
  }

  private verifyAccessToken(authorization: string): number {
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : authorization.trim();

    try {
      const payload = this.jwtService.verify(token);
      const userId = Number(payload.sub);
      if (!Number.isFinite(userId)) {
        throw new UnauthorizedException('Invalid access token');
      }
      return userId;
    } catch (error) {
      this.logger.warn(
        `Access token validation failed: ${error?.message || error}`,
      );
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private normalizeTtl(ttlSeconds?: number): number {
    if (!ttlSeconds || !Number.isFinite(ttlSeconds)) {
      return this.defaultTicketTtlSeconds;
    }

    return Math.min(
      Math.max(60, Math.floor(ttlSeconds)),
      this.maxTicketTtlSeconds,
    );
  }
}
