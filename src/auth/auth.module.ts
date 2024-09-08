import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { jwtConstants } from './strategies/constants';
import { emailAddress, emailPassword } from './strategies/constants';
@Module({
  imports: [
    UserModule,
    PassportModule,
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',  // Gmail's SMTP server
        port: 587,  // Port for TLS
        secure: false,  // Set to true if using port 465 (for SSL), otherwise false for 587
        auth: {
          user: emailAddress,  // Your Gmail address
          pass: emailPassword,  // Your Gmail password or App password
        },
      },
      defaults: {
        from: `"No Reply" <${emailAddress}>`,  // Default 'from' address
      },
    }),    
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
