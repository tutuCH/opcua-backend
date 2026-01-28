export interface EmailTemplateData {
  email: string;
  username?: string;
  verificationLink?: string;
  resetLink?: string;
}

export interface VerificationEmailData extends EmailTemplateData {
  verificationLink: string;
}

export interface PasswordResetEmailData extends EmailTemplateData {
  resetLink: string;
}
