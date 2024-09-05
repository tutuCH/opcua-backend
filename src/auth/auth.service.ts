import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  // SignUp function
  async signUp(email: string, pass: string, username: string): Promise<{ access_token: string, userId: string }> {
    if (!username) {
      throw new ConflictException('Username is required');
    }

    const existingUser = await this.userService.findOne(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash the password before saving the user
    const hashedPassword = await this.hashPassword(pass);

    // Create the new user
    const createdUser = await this.userService.create({
      email,
      password: hashedPassword,
      username,
      accessLevel: ''
    });

    // Retrieve the created user's information
    const user = await this.userService.findOne(email);

    if (!user) {
      throw new UnauthorizedException('User not found after creation');
    }

    // Generate the JWT token
    const payload = { sub: user.userId, username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
      userId: user.userId.toString(),
    };
  }

  // SignIn function
  async signIn(
    email: string,
    pass: string,
  ): Promise<{ access_token: string, userId: string }> {
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

  // Hash password function using bcrypt
  private async hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    return await bcrypt.hash(plainPassword, salt);
  }

  // Check password function using bcrypt
  private async checkPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}
