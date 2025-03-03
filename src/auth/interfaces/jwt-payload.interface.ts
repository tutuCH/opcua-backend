export interface JwtPayload {
  sub: number; // userId
  username: string;
  iat: number;
  exp: number;
} 