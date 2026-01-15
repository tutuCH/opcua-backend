import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { frontendUrl, emailSendEnabled } from './strategies/constants';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // SignUp function - Part 1 (sending the verification link)
  async signUp(
    email: string,
    pass: string,
    username: string,
    role?: string,
  ): Promise<{ status: string; message: string; verificationLink?: string }> {
    if (!username) {
      throw new ConflictException('Username is required');
    }

    const existingUser = await this.userService.findOne(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash the password before saving temporarily
    const hashedPassword = await this.hashPassword(pass);

    // Generate a verification token (expires in 24 hours)
    const token = await this.jwtService.signAsync(
      { email, hashedPassword, username, role: role || 'operator' },
      { expiresIn: '24h' },
    );

    // Send verification email with the link containing the token
    const verificationLink = `${frontendUrl}/signup?token=${token}`;

    // Send HTML verification email using MJML template
    try {
      await this.emailService.sendVerificationEmail(
        email,
        username,
        verificationLink,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        'Email delivery failed. Configure EMAIL_PASSWORD as a Gmail app password or set EMAIL_SEND_ENABLED=false to bypass emails in development.',
      );
    }

    if (!emailSendEnabled) {
      return {
        status: 'success',
        message: 'Verification email skipped because EMAIL_SEND_ENABLED=false.',
        verificationLink,
      };
    }

    return {
      status: 'success',
      message: 'Verification email sent. Please check your inbox.',
    };
  }

  // Verification function - Part 2 (activating the account)
  async verifyEmail(token: string): Promise<{
    access_token?: string;
    user?: {
      userId: number;
      username: string;
      email: string;
      accessLevel: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    };
    status?: string;
    message?: string;
  }> {
    try {
      // Verify the token and extract the email, hashedPassword, username, and role
      const { email, hashedPassword, username, role } =
        this.jwtService.verify(token);

      // Ensure the user doesn't already exist
      const existingUser = await this.userService.findOne(email);
      if (existingUser) {
        return { status: 'error', message: 'User already exists' };
      }

      // Save the user to the database now after verification
      const createdUser = await this.userService.create({
        email,
        password: hashedPassword,
        username,
        accessLevel: role || '',
        status: 'active',
      });

      // Create JWT payload per frontend spec
      const payload = {
        sub: createdUser.userId.toString(),
        email: createdUser.email,
        role: createdUser.accessLevel,
      };
      const access_token = await this.jwtService.signAsync(payload);

      return {
        access_token,
        user: {
          userId: createdUser.userId,
          username: createdUser.username,
          email: createdUser.email,
          accessLevel: createdUser.accessLevel,
          status: createdUser.status,
          createdAt: createdUser.createdAt,
          updatedAt: createdUser.updatedAt,
        },
        status: 'success',
        message: 'Account verified successfully.',
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Invalid or expired verification token.',
      };
    }
  }

  // SignIn function
  async signIn(
    email: string,
    pass: string,
  ): Promise<{
    access_token: string;
    user: {
      userId: number;
      username: string;
      email: string;
      accessLevel: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    const user = await this.userService.findOne(email);
    if (!user || !(await this.checkPassword(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create JWT payload with email and role (per frontend spec)
    const payload = {
      sub: user.userId.toString(),
      email: user.email,
      role: user.accessLevel,
    };

    const access_token = await this.jwtService.signAsync(payload);

    return {
      access_token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        accessLevel: user.accessLevel,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async sendPasswordResetEmail(email: string) {
    try {
      // Find the user to get their username
      const user = await this.userService.findOne(email);
      if (!user) {
        return { status: 'error', message: 'User not found.' };
      }

      // Generate a token with 15 minutes expiration for password reset
      const token = await this.generatePasswordResetToken(email);

      const resetLink = `${frontendUrl}/forget-password?token=${token}`;

      // Send HTML password reset email using MJML template
      await this.emailService.sendPasswordResetEmail(
        email,
        user.username,
        resetLink,
      );

      return { status: 'success', message: 'Password reset link sent.' };
    } catch (error) {
      return { status: 'error', message: 'Error sending password reset email' };
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      // Verify the token and extract the email
      const { email } = this.jwtService.verify(token);

      // Find the user by email
      const user = await this.userService.findOne(email);
      if (!user) {
        return { status: 'USER_NOT_FOUND', message: 'User not found.' };
      }

      // Hash the new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update the user's password in the database
      await this.userService.updatePassword(user.userId, hashedPassword);

      // Create JWT payload per frontend spec
      const payload = {
        sub: user.userId.toString(),
        email: user.email,
        role: user.accessLevel,
      };
      const access_token = await this.jwtService.signAsync(payload);

      return {
        access_token,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          accessLevel: user.accessLevel,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        status: 'success',
        message: 'Password reset successfully.',
      };
    } catch (error) {
      return { status: 'error', message: 'Error resetting password.' };
    }
  }

  // Hash password function using bcrypt
  private async hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    return await bcrypt.hash(plainPassword, salt);
  }

  // Check password function using bcrypt
  private async checkPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Function to generate a JWT token for password reset (15 minutes expiration)
  async generatePasswordResetToken(email: string): Promise<string> {
    const payload = { email };
    return this.jwtService.sign(payload, { expiresIn: '15m' }); // 15 minutes expiration
  }

  // Update user profile
  async updateProfile(
    userId: number,
    updateData: { name?: string; email?: string },
  ): Promise<{
    userId: number;
    username: string;
    email: string;
    accessLevel: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email is being updated and if it's already taken
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.userService.findOne(updateData.email);
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    // Prepare update data
    const updates: any = {};
    if (updateData.name !== undefined) {
      updates.username = updateData.name;
    }
    if (updateData.email !== undefined) {
      updates.email = updateData.email;
    }

    // Update user
    const updatedUser = await this.userService.update(userId, updates);

    return {
      userId: updatedUser.userId,
      username: updatedUser.username,
      email: updatedUser.email,
      accessLevel: updatedUser.accessLevel,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  // Change user password
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await this.checkPassword(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password
    await this.userService.updatePassword(userId, hashedPassword);

    return { message: 'Password changed successfully' };
  }

  // Find or create user from Google SSO
  async findOrCreateGoogleUser(
    email: string,
    name: string,
  ): Promise<{
    userId: number;
    username: string;
    email: string;
    accessLevel: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    // Check if user exists
    let user = await this.userService.findOne(email);

    if (user) {
      return user;
    }

    // Create new user with random password (unused for Google auth)
    const crypto = require('crypto');
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await this.hashPassword(randomPassword);

    user = await this.userService.create({
      email,
      username: name,
      password: hashedPassword,
      accessLevel: 'operator',
      status: 'active',
    });

    return user;
  }
}
