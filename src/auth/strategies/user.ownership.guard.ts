import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class UserOwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If the route is marked as public, skip the guard
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userIdFromParams = Number(request.params.userId);
    const userIdFromToken = request.user?.userId;
    if (userIdFromParams && userIdFromParams !== userIdFromToken) {
      throw new UnauthorizedException(
        'You do not have access to this resource',
      );
    }
    return true;
  }
}
