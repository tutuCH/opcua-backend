import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleAuthService {
  private client: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private authService: AuthService,
  ) {
    const clientId = this.configService.get<string>('auth.google.clientId');
    if (!clientId) {
      console.warn(
        'GOOGLE_CLIENT_ID not configured - Google SSO will not work',
      );
    }
    this.client = new OAuth2Client(clientId);
  }

  async authenticateWithGoogle(idToken: string): Promise<{
    access_token: string;
    user: {
      userId: number;
      username: string;
      email: string;
      accessLevel: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    const clientId = this.configService.get<string>('auth.google.clientId');
    if (!clientId) {
      throw new UnauthorizedException('Google SSO not configured');
    }

    try {
      // Verify the Google ID token
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }

      const { email, name } = payload;

      // Find or create user
      const user = await this.authService.findOrCreateGoogleUser(
        email,
        name || email.split('@')[0],
      );

      // Generate JWT token
      const jwtPayload = {
        sub: user.userId.toString(),
        email: user.email,
        role: user.accessLevel,
      };
      const access_token = await this.jwtService.signAsync(jwtPayload);

      return {
        access_token,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          accessLevel: user.accessLevel,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };
    } catch (error) {
      console.error('Google token verification failed:', error.message);
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
