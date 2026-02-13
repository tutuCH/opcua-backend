import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as AWS from 'aws-sdk';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { UserService } from '../user/user.service';
import { AuthenticatedRequestUser } from './interfaces/authenticated-user.interface';

interface CognitoUserAttributes {
  email?: string;
  name?: string;
  sub?: string;
}

@Injectable()
export class CognitoAccessTokenService {
  private readonly logger = new Logger(CognitoAccessTokenService.name);
  private readonly cognitoClient: AWS.CognitoIdentityServiceProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    const region = this.configService.get<string>('auth.cognito.region');
    if (!region && process.env.NODE_ENV !== 'test') {
      throw new Error(
        '[Auth] Missing Cognito region configuration. Set COGNITO_REGION.',
      );
    }

    this.cognitoClient = new AWS.CognitoIdentityServiceProvider({
      region: region || 'us-east-1',
    });
  }

  extractAccessTokenFromRequest(req: Request): string | null {
    const authorization = req?.headers?.authorization;
    if (typeof authorization === 'string') {
      const token = this.extractAccessTokenFromAuthorization(authorization);
      if (token) {
        return token;
      }
    }

    const cookieToken = req?.cookies?.access_token;
    if (typeof cookieToken === 'string' && cookieToken.trim()) {
      return cookieToken.trim();
    }

    return null;
  }

  extractAccessTokenFromAuthorization(authorization: string): string | null {
    if (!authorization) {
      return null;
    }

    if (!authorization.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const token = authorization.slice(7).trim();
    return token || null;
  }

  async resolveUserFromAuthorizationHeader(
    authorization: string,
    expectedSub?: string,
  ): Promise<AuthenticatedRequestUser> {
    const accessToken = this.extractAccessTokenFromAuthorization(authorization);
    if (!accessToken) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    return this.resolveUserFromAccessToken(accessToken, expectedSub);
  }

  async resolveUserFromAccessToken(
    accessToken: string,
    expectedSub?: string,
  ): Promise<AuthenticatedRequestUser> {
    const cognitoUser = await this.getCognitoUserAttributes(accessToken);
    const email = cognitoUser.email?.trim();

    if (!email) {
      this.logger.warn('Cognito GetUser response missing email attribute');
      throw new UnauthorizedException('Cognito user email attribute missing');
    }

    const cognitoSub = cognitoUser.sub?.trim() || expectedSub?.trim();
    if (!cognitoSub) {
      this.logger.warn('Cognito subject is missing in token and user attributes');
      throw new UnauthorizedException('Cognito subject attribute missing');
    }

    if (expectedSub && cognitoSub !== expectedSub) {
      this.logger.warn(
        `Cognito subject mismatch during access token resolution (expected sub ${expectedSub})`,
      );
      throw new UnauthorizedException('Invalid token subject');
    }

    let user = await this.userService.findOne(email);
    if (!user) {
      const username = cognitoUser.name?.trim() || email.split('@')[0];
      const randomPassword = randomBytes(48).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = await this.userService.create({
        username,
        email,
        password: hashedPassword,
        accessLevel: 'operator',
        status: 'active',
      });

      this.logger.log(
        `Auto-provisioned local user for Cognito identity (email: ${email})`,
      );
    }

    return {
      userId: user.userId,
      username: user.username,
      email: user.email,
      accessLevel: user.accessLevel,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      cognitoSub,
    };
  }

  private async getCognitoUserAttributes(
    accessToken: string,
  ): Promise<CognitoUserAttributes> {
    try {
      const response = await this.cognitoClient
        .getUser({ AccessToken: accessToken })
        .promise();

      const attributes: CognitoUserAttributes = {};
      for (const attribute of response.UserAttributes || []) {
        if (!attribute.Name || typeof attribute.Value !== 'string') {
          continue;
        }
        attributes[attribute.Name as keyof CognitoUserAttributes] =
          attribute.Value;
      }

      return attributes;
    } catch (error: any) {
      const errorCode = error?.code || 'UnknownCognitoError';
      this.logger.warn(
        `Cognito GetUser failed for access token validation (${errorCode})`,
      );
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
