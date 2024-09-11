import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { UserService } from '../user/user.service';
import { frontendUrl } from './strategies/constants';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private mailerService: MailerService,
  ) {}

  // SignUp function - Part 1 (sending the verification link)
  async signUp(
    email: string,
    pass: string,
    username: string,
  ): Promise<{ status: string; message: string }> {
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
      { email, hashedPassword, username },
      { expiresIn: '24h' },
    );

    // Send verification email with the link containing the token
    const verificationLink = `${frontendUrl}/signup?token=${token}`;
    const backendLink = `http://localhost:3000/auth/verify-email?token=${token}`;
    // await this.mailerService.sendMail({
    //   to: email,
    //   subject: 'Verify Your Email',
    //   text: `Please verify your email by clicking the link: ${verificationLink}`,
    // });
    console.log(`Backend URL link: ${backendLink}`);
    console.log(`verificationLink: ${verificationLink}`);
    return {
      status: 'success',
      // message: 'Verification email sent. Please check your inbox.',
      message: `Please verify your email by clicking the link: ${verificationLink}`,
    };
  }

  // Verification function - Part 2 (activating the account)
  async verifyEmail(
    token: string,
  ): Promise<{ access_token?: string; userId?: string; status?: string; message?: string }> {
    try {
      // Verify the token and extract the email, hashedPassword, and username
      const { email, hashedPassword, username } = this.jwtService.verify(token);

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
        accessLevel: '',
      });

      const payload = { sub: createdUser.userId, username: createdUser.username };
      return {
        access_token: await this.jwtService.signAsync(payload),
        userId: createdUser.userId.toString(),
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
  ): Promise<{ access_token: string; userId: string }> {
    const user = await this.userService.findOne(email);
    if (!user || !(await this.checkPassword(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.userId, username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
      userId: user.userId.toString(),
    };
  }

  async sendPasswordResetEmail(email: string) {
    try {
      // Generate a token with 15 minutes expiration for password reset
      const token = await this.generatePasswordResetToken(email);

      const resetLink = `${frontendUrl}/forget-password?token=${token}`;

      // Send email with the reset link
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset Request',
        text: `Please use the following link to reset your password: ${resetLink}`,
      });

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
        // throw new UnauthorizedException('User not found');
        return { status: 'USER_NOT_FOUND', message: 'User not found.' };
      }

      // Hash the new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update the user's password in the database
      await this.userService.updatePassword(user.userId, hashedPassword);
      const payload = { sub: user.userId, username: user.username };
      return {
        access_token: await this.jwtService.signAsync(payload),
        userId: user.userId.toString(),
        status: 'success',
        message: 'Password reset successfully.',
      };
    } catch (error) {
      return { status: 'error', message: 'Error resetting password.' };
      // throw new Error('Invalid or expired token.');
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
}
