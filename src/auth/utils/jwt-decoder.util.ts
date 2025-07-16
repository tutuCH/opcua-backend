import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UnauthorizedException } from '@nestjs/common';
import { jwtConstants } from '../strategies/constants';

export function decodeJwtToken(authHeader: string): JwtPayload {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedException('Invalid authorization header');
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify and decode the token
    const decoded = jwt.verify(
      token,
      jwtConstants.secret,
    ) as unknown as JwtPayload;
    return decoded;
  } catch (error) {
    throw new UnauthorizedException('Invalid token');
  }
}
