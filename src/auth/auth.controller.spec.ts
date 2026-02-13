import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authServiceMock = {} as Partial<AuthService>;
  const googleAuthServiceMock = {} as Partial<GoogleAuthService>;
  const configServiceMock = {
    get: jest.fn(),
  } as Partial<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: GoogleAuthService, useValue: googleAuthServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
