import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { Public } from './decorators/public.decorator';
import { SignInDto } from './dto/signin.dto';
import { SignUpDto } from './dto/signup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { JwtUserId } from './decorators/jwt-user-id.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAuthService: GoogleAuthService,
    private configService: ConfigService,
  ) {}

  // Public route for user login
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(
      signInDto.email,
      signInDto.password,
    );
    this.setAuthCookie(res, result.access_token);
    return result;
  }

  @Public()
  @Post('sign-up')
  async signUp(@Body() signUpDto: SignUpDto) {
    const { email, password, username, role } = signUpDto;
    return this.authService.signUp(email, password, username, role);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(token);
    if (result.access_token) {
      this.setAuthCookie(res, result.access_token);
    }
    return result;
  }

  // Protected route for getting user profile
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  // Protected route for updating user profile
  @Put('profile')
  updateProfile(
    @JwtUserId() userId: number,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, updateProfileDto);
  }

  // Protected route for changing password
  @Put('change-password')
  changePassword(
    @JwtUserId() userId: number,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Public()
  @Post('google')
  async googleSignIn(
    @Body() googleAuthDto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.googleAuthService.authenticateWithGoogle(
      googleAuthDto.idToken,
    );
    this.setAuthCookie(res, result.access_token);
    return result;
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.sendPasswordResetEmail(email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  private setAuthCookie(res: Response, token: string) {
    const environment = this.configService.get('app.environment');
    const isProduction = environment === 'production';
    const cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

    res.cookie('access_token', token, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: cookieMaxAgeMs,
      path: '/',
    });
  }
}
