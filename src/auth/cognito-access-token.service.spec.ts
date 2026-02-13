import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoAccessTokenService } from './cognito-access-token.service';
import { UserService } from '../user/user.service';

describe('CognitoAccessTokenService', () => {
  let configService: jest.Mocked<ConfigService>;
  let userService: jest.Mocked<UserService>;
  let service: CognitoAccessTokenService;
  let getUserMock: jest.Mock;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const configMap: Record<string, string> = {
          'auth.cognito.region': 'us-east-1',
        };
        return configMap[key];
      }),
    } as any;

    userService = {
      findOne: jest.fn(),
      create: jest.fn(),
    } as any;

    service = new CognitoAccessTokenService(configService, userService);

    getUserMock = jest.fn();
    (service as any).cognitoClient = {
      getUser: getUserMock,
    };
  });

  it('maps existing local user by Cognito email', async () => {
    getUserMock.mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        UserAttributes: [
          { Name: 'email', Value: 'tuchenhsien@gmail.com' },
          { Name: 'name', Value: 'Harry Tu' },
          { Name: 'sub', Value: 'sub-123' },
        ],
      }),
    });
    userService.findOne.mockResolvedValue({
      userId: 1,
      username: 'Harry Tu',
      email: 'tuchenhsien@gmail.com',
      password: 'hashed',
      accessLevel: 'operator',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.resolveUserFromAccessToken('token', 'sub-123');

    expect(result.userId).toBe(1);
    expect(result.email).toBe('tuchenhsien@gmail.com');
    expect(result.cognitoSub).toBe('sub-123');
    expect(userService.create).not.toHaveBeenCalled();
  });

  it('auto-provisions local user when missing', async () => {
    getUserMock.mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        UserAttributes: [
          { Name: 'email', Value: 'new-user@example.com' },
          { Name: 'name', Value: 'New User' },
          { Name: 'sub', Value: 'sub-456' },
        ],
      }),
    });
    userService.findOne.mockResolvedValue(null);
    userService.create.mockResolvedValue({
      userId: 22,
      username: 'New User',
      email: 'new-user@example.com',
      password: 'hashed',
      accessLevel: 'operator',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.resolveUserFromAccessToken('token', 'sub-456');

    expect(result.userId).toBe(22);
    expect(userService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'New User',
        email: 'new-user@example.com',
        accessLevel: 'operator',
        status: 'active',
      }),
    );
  });

  it('throws UnauthorizedException when email is missing', async () => {
    getUserMock.mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        UserAttributes: [{ Name: 'name', Value: 'No Email User' }],
      }),
    });

    await expect(service.resolveUserFromAccessToken('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when Cognito GetUser fails', async () => {
    getUserMock.mockReturnValue({
      promise: jest.fn().mockRejectedValue({
        code: 'NotAuthorizedException',
      }),
    });

    await expect(service.resolveUserFromAccessToken('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
