import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { Issuer, Client, TokenSet } from 'openid-client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CognitoStrategy extends PassportStrategy(Strategy, 'cognito') {
  private client: Client;

  constructor(private configService: ConfigService) {
    super({
      authorizationURL: `${configService.get('COGNITO_DOMAIN')}/oauth2/authorize`,
      tokenURL: `${configService.get('COGNITO_DOMAIN')}/oauth2/token`,
      clientID: configService.get('COGNITO_CLIENT_ID'),
      clientSecret: configService.get('COGNITO_CLIENT_SECRET'),
      callbackURL: configService.get('COGNITO_CALLBACK_URL'),
      scope: ['email', 'openid', 'profile'],
    });

    this.initializeClient().catch((err) => {
      console.error('Error initializing client in strategy:', err);
    });
  }

  private async initializeClient() {
    console.log('initializing client in strategy')
    console.log('COGNITO_DOMAIN', this.configService.get('COGNITO_DOMAIN'))
    console.log('COGNITO_CLIENT_ID', this.configService.get('COGNITO_CLIENT_ID'))
    console.log('COGNITO_CLIENT_SECRET', this.configService.get('COGNITO_CLIENT_SECRET'))
    console.log('COGNITO_CALLBACK_URL', this.configService.get('COGNITO_CALLBACK_URL'))
    console.log('COGNITO_ISSUER_URL', this.configService.get('COGNITO_ISSUER_URL'))
    const issuer = await Issuer.discover(this.configService.get('COGNITO_ISSUER_URL'));
    this.client = new issuer.Client({
      client_id: this.configService.get('COGNITO_CLIENT_ID'),
      client_secret: this.configService.get('COGNITO_CLIENT_SECRET'),
      redirect_uris: [this.configService.get('COGNITO_CALLBACK_URL')],
      response_types: ['code'],
    });
    console.log('client initialized in strategy')
  }

  async validate(accessToken: string): Promise<any> {
    const userInfo = await this.client.userinfo(accessToken);
    return {
      userId: userInfo.sub,
      email: userInfo.email,
      username: userInfo.username,
    };
  }
} 