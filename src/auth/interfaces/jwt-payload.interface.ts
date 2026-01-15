export interface JwtPayload {
  sub: string; // userId as string per frontend spec
  email: string;
  role: string; // accessLevel mapped to role for frontend
  iat?: number;
  exp?: number;
}
