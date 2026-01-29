import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
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
      ignoreExpiration: false,
      secretOrKey:
        configService.get('auth.jwtSecret') ||
        process.env.JWT_SECRET ||
        'fallback-secret',
    });
  }

  async validate(payload: any) {
    // Fetch user from database to get complete user object
    const user = await this.userService.findById(payload.sub);
    return user;
  }
}
