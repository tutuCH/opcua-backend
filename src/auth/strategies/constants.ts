import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
};

export const frontendUrl = process.env.FRONTEND_URL;

export const emailAddress = process.env.EMAIL_ADDRESS;

export const emailPassword = process.env.EMAIL_PASSWORD;
