import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CognitoAccessTokenService } from '../cognito-access-token.service';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-user.interface';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let configService: jest.Mocked<ConfigService>;
  let cognitoAccessTokenService: jest.Mocked<CognitoAccessTokenService>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const configMap: Record<string, string> = {
          'auth.cognito.region': 'us-east-1',
          'auth.cognito.userPoolId': 'us-east-1_pool',
          'auth.cognito.clientId': 'client-id',
          'auth.cognito.issuerUrl':
            'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
        };
        return configMap[key];
      }),
    } as any;

    cognitoAccessTokenService = {
      extractAccessTokenFromRequest: jest.fn().mockReturnValue('token'),
      resolveUserFromAccessToken: jest.fn(),
    } as any;

    strategy = new JwtStrategy(configService, cognitoAccessTokenService);
  });

  it('returns hydrated local user for valid Cognito access token payload', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
    } as Request;

    const user: AuthenticatedRequestUser = {
      userId: 10,
      username: 'Harry',
      email: 'tuchenhsien@gmail.com',
      accessLevel: 'operator',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      cognitoSub: 'abc-sub',
    };

    cognitoAccessTokenService.resolveUserFromAccessToken.mockResolvedValue(user);

    const result = await strategy.validate(request, {
      sub: 'abc-sub',
      token_use: 'access',
      client_id: 'client-id',
    });

    expect(result).toEqual(user);
    expect(
      cognitoAccessTokenService.resolveUserFromAccessToken,
    ).toHaveBeenCalledWith('token', 'abc-sub');
  });

  it('rejects tokens with invalid token_use claim', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
    } as Request;

    await expect(
      strategy.validate(request, {
        sub: 'abc-sub',
        token_use: 'id',
        client_id: 'client-id',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tokens with invalid client_id claim', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
    } as Request;

    await expect(
      strategy.validate(request, {
        sub: 'abc-sub',
        token_use: 'access',
        client_id: 'different-client-id',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('falls back to local JWT payload validation when Cognito config is missing', async () => {
    const localConfigService = {
      get: jest.fn((key: string) => {
        const configMap: Record<string, string> = {
          'auth.jwtSecret': 'test-secret',
        };
        return configMap[key];
      }),
    } as any;
    const localCognitoService = {
      extractAccessTokenFromRequest: jest.fn(),
      resolveUserFromAccessToken: jest.fn(),
    } as any;
    const localStrategy = new JwtStrategy(localConfigService, localCognitoService);

    const result = await localStrategy.validate({} as Request, {
      sub: '42',
      email: 'local@example.com',
      role: 'admin',
    });

    expect(result.userId).toBe(42);
    expect(result.email).toBe('local@example.com');
    expect(result.accessLevel).toBe('admin');
    expect(localCognitoService.extractAccessTokenFromRequest).not.toHaveBeenCalled();
    expect(localCognitoService.resolveUserFromAccessToken).not.toHaveBeenCalled();
  });
});
