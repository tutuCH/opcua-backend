import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-user.interface';

export function extractUserIdFromRequest(
  request: { user?: AuthenticatedRequestUser },
): number {
  const userId = request.user?.userId;
  if (!userId || !Number.isFinite(userId)) {
    throw new UnauthorizedException('Authenticated user context is missing');
  }

  return userId;
}

/**
 * Custom decorator that extracts userId from authenticated request context.
 */
export const JwtUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return extractUserIdFromRequest(request);
  },
);
