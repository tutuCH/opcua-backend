import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import mjml = require('mjml');
import * as fs from 'fs';
import * as path from 'path';
import { emailSendEnabled } from '../auth/strategies/constants';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  private loadTemplate(templateName: string): string {
    try {
      const templatePath = path.join(
        process.cwd(),
        'src',
        'email-templates',
        `${templateName}.mjml`,
      );
      return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      this.logger.error(
        `Failed to load email template: ${templateName}`,
        error,
      );
      throw new Error(`Email template ${templateName} not found`);
    }
  }

  private compileMjmlToHtml(mjmlContent: string): string {
    try {
      const { html } = mjml(mjmlContent, { validationLevel: 'soft' });
      return html;
    } catch (error) {
      this.logger.error('Failed to compile MJML to HTML', error);
      throw new Error('Failed to compile email template');
    }
  }

  private replacePlaceholders(
    template: string,
    data: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      result = result.split(placeholder).join(value);
    }
    return result;
  }

  async sendVerificationEmail(
    email: string,
    username: string,
    verificationLink: string,
  ): Promise<void> {
    if (!emailSendEnabled) {
      this.logger.warn(
        `EMAIL_SEND_ENABLED=false. Skipping verification email to ${email}`,
      );
      return;
    }

    try {
      const mjmlTemplate = this.loadTemplate('verification');
      const mjmlWithContent = this.replacePlaceholders(mjmlTemplate, {
        username,
        verificationLink,
      });
      const htmlContent = this.compileMjmlToHtml(mjmlWithContent);

      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify Your Email Address',
        html: htmlContent,
      });

      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw error;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    username: string,
    resetLink: string,
  ): Promise<void> {
    if (!emailSendEnabled) {
      this.logger.warn(
        `EMAIL_SEND_ENABLED=false. Skipping password reset email to ${email}`,
      );
      return;
    }

    try {
      const mjmlTemplate = this.loadTemplate('password-reset');
      const mjmlWithContent = this.replacePlaceholders(mjmlTemplate, {
        username,
        resetLink,
      });
      const htmlContent = this.compileMjmlToHtml(mjmlWithContent);

      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset Request',
        html: htmlContent,
      });

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        error,
      );
      throw error;
    }
  }
}
