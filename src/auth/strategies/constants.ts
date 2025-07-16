import { config } from 'dotenv';
config();

export const jwtConstants = {
  secret: process.env.JWT_SECRET,
};

export const frontendUrl = process.env.FRONTEND_URL;

export const emailAddress = process.env.EMAIL_ADDRESS;

export const emailPassword = process.env.EMAIL_PASSWORD;
