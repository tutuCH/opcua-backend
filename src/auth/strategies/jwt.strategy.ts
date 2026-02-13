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

  constructor(
    private readonly configService: ConfigService,
    private readonly cognitoAccessTokenService: CognitoAccessTokenService,
  ) {
    const region = configService.get<string>('auth.cognito.region');
    const userPoolId = configService.get<string>('auth.cognito.userPoolId');
    const clientId = configService.get<string>('auth.cognito.clientId');
    const issuerUrl = configService.get<string>('auth.cognito.issuerUrl');

    const missingVars = [
      !region && 'COGNITO_REGION',
      !userPoolId && 'COGNITO_USER_POOL_ID',
      !clientId && 'COGNITO_CLIENT_ID',
    ].filter(Boolean) as string[];

    if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
      throw new Error(
        `[Auth] Missing required Cognito environment variables: ${missingVars.join(', ')}.`,
      );
    }

    if (!issuerUrl && process.env.NODE_ENV !== 'test') {
      throw new Error(
        '[Auth] Unable to resolve Cognito issuer URL. Set COGNITO_REGION and COGNITO_USER_POOL_ID, or set COGNITO_ISSUER_URL explicitly.',
      );
    }

    const cookieExtractor = (req: Request): string | null => {
      if (!req?.cookies) {
        return null;
      }
      return req.cookies.access_token || null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuerUrl}/.well-known/jwks.json`,
      }) as any,
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: issuerUrl || undefined,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: CognitoAccessTokenPayload) {
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
