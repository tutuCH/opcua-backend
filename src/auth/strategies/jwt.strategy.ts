import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { passportJwtSecret } from 'jwks-rsa';
import { CognitoAccessTokenService } from '../cognito-access-token.service';

interface CognitoAccessTokenPayload {
  sub: string;
  token_use: string;
  client_id: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly cognitoEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly cognitoAccessTokenService: CognitoAccessTokenService,
  ) {
    const region = configService.get<string>('auth.cognito.region');
    const userPoolId = configService.get<string>('auth.cognito.userPoolId');
    const clientId = configService.get<string>('auth.cognito.clientId');
    const issuerUrl = configService.get<string>('auth.cognito.issuerUrl');

    const cognitoEnabled = Boolean(region && userPoolId && clientId && issuerUrl);

    const cookieExtractor = (req: Request): string | null => {
      if (!req?.cookies) {
        return null;
      }
      return req.cookies.access_token || null;
    };

    const extractors = [
      cookieExtractor,
      ExtractJwt.fromAuthHeaderAsBearerToken(),
    ];

    const baseStrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors(extractors),
      ignoreExpiration: false,
      passReqToCallback: true,
    };

    let strategyOptions: any;
    if (cognitoEnabled) {
      strategyOptions = {
        ...baseStrategyOptions,
        secretOrKeyProvider: passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
          jwksUri: `${issuerUrl}/.well-known/jwks.json`,
        }) as any,
        algorithms: ['RS256'],
        issuer: issuerUrl,
      };
    } else {
      const jwtSecret = configService.get<string>('auth.jwtSecret');
      if (!jwtSecret && process.env.NODE_ENV !== 'test') {
        throw new Error(
          '[Auth] Missing JWT secret configuration. Set JWT_SECRET.',
        );
      }

      strategyOptions = {
        ...baseStrategyOptions,
        secretOrKey: jwtSecret,
        algorithms: ['HS256'],
      };
    }

    super(strategyOptions);
    this.cognitoEnabled = cognitoEnabled;

    if (!cognitoEnabled && process.env.NODE_ENV !== 'test') {
      this.logger.warn(
        '[Auth] Cognito env is incomplete. Falling back to local JWT (HS256) validation.',
      );
    }
  }

  async validate(req: Request, payload: CognitoAccessTokenPayload | any) {
    if (!this.cognitoEnabled) {
      const userId = Number(payload?.sub);
      const email = payload?.email;
      if (!Number.isFinite(userId) || !email) {
        throw new UnauthorizedException('Invalid local token payload');
      }

      return {
        userId,
        username:
          payload?.username ||
          (typeof email === 'string' ? email.split('@')[0] : 'user'),
        email,
        accessLevel: payload?.role || payload?.accessLevel || 'operator',
        status: payload?.status || 'active',
        createdAt: payload?.createdAt ? new Date(payload.createdAt) : new Date(),
        updatedAt: payload?.updatedAt ? new Date(payload.updatedAt) : new Date(),
        cognitoSub: String(payload?.sub),
      };
    }

    const configuredClientId = this.configService.get<string>(
      'auth.cognito.clientId',
    );

    if (payload?.token_use !== 'access') {
      this.logger.warn(
        `Rejected token with unsupported token_use: ${payload?.token_use || 'unknown'}`,
      );
      throw new UnauthorizedException('Invalid token use');
    }

    if (!configuredClientId || payload?.client_id !== configuredClientId) {
      this.logger.warn('Rejected token with unexpected Cognito client_id');
      throw new UnauthorizedException('Invalid token audience');
    }

    const accessToken =
      this.cognitoAccessTokenService.extractAccessTokenFromRequest(req);
    if (!accessToken) {
      throw new UnauthorizedException('Access token is missing');
    }

    return this.cognitoAccessTokenService.resolveUserFromAccessToken(
      accessToken,
      payload.sub,
    );
  }
}
