import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { CognitoAccessTokenService } from '../auth/cognito-access-token.service';
import { RealtimeStreamAuthService } from './realtime-stream-auth.service';

describe('RealtimeStreamAuthService', () => {
  let service: RealtimeStreamAuthService;
  let cognitoAccessTokenService: jest.Mocked<CognitoAccessTokenService>;

  beforeEach(() => {
    cognitoAccessTokenService = {
      resolveUserFromAuthorizationHeader: jest.fn(),
    } as any;

    service = new RealtimeStreamAuthService(
      {
        signAsync: jest.fn(),
        verify: jest.fn(),
      } as any as JwtService,
      {
        get: jest.fn().mockReturnValue(300),
      } as any as ConfigService,
      {
        set: jest.fn(),
        get: jest.fn(),
      } as any as RedisService,
      cognitoAccessTokenService,
    );
  });

  it('resolves userId from shared Cognito access-token resolver when authorization is provided', async () => {
    cognitoAccessTokenService.resolveUserFromAuthorizationHeader.mockResolvedValue(
      {
        userId: 123,
      } as any,
    );

    const result = await service.resolveUserId({
      authorization: 'Bearer token',
      purpose: 'data',
    });

    expect(result).toEqual({
      userId: 123,
      ticketPurpose: 'any',
    });
    expect(
      cognitoAccessTokenService.resolveUserFromAuthorizationHeader,
    ).toHaveBeenCalledWith('Bearer token');
  });
});
