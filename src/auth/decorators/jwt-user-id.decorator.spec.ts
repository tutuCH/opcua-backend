import { UnauthorizedException } from '@nestjs/common';
import { extractUserIdFromRequest } from './jwt-user-id.decorator';

describe('JwtUserId decorator helper', () => {
  it('returns numeric userId from authenticated request user', () => {
    const userId = extractUserIdFromRequest({
      user: {
        userId: 123,
      } as any,
    });

    expect(userId).toBe(123);
  });

  it('throws UnauthorizedException when userId is missing', () => {
    expect(() =>
      extractUserIdFromRequest({
        user: undefined,
      }),
    ).toThrow(UnauthorizedException);
  });
});
