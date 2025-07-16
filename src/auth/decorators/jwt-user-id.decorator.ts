import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { decodeJwtToken } from '../utils/jwt-decoder.util';

/**
 * Custom decorator that extracts the userId from the JWT token in the request headers
 * @example
 * @Get()
 * findAll(@JwtUserId() userId: number) {
 *   return this.service.findAllForUser(userId);
 * }
 */
export const JwtUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const decodedToken = decodeJwtToken(authHeader);
    return decodedToken.sub; // Return the userId from the JWT token
  },
);
