import { config } from 'dotenv';

// Load environment variables from .env file
// NOTE: The .env file is a symlink to .env.local
// This is required for backwards compatibility with jwt-decoder.util.ts
// which cannot use dependency injection
config();

export const jwtConstants = {
  secret: process.env.JWT_SECRET,
};

export const frontendUrl = process.env.FRONTEND_URL;

export const emailAddress = process.env.EMAIL_ADDRESS;

export const emailPassword = process.env.EMAIL_PASSWORD;
