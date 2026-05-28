import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

/**
 * Thin wrapper around Nodemailer (cPanel SMTP) for transactional emails.
 * Configured via SMTP_* env vars. On port 465 the connection is implicit SSL
 * (SMTP_SECURE=true); on 587 it upgrades via STARTTLS (SMTP_SECURE=false).
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const port = Number(this.config.get<string>("SMTP_PORT") ?? 465);
    const secure =
      this.config.get<string>("SMTP_SECURE") === "true" || port === 465;

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST"),
      port,
      secure,
      auth: {
        user: this.config.get<string>("SMTP_USER"),
        pass: this.config.get<string>("SMTP_PASS"),
      },
    });

    this.from =
      this.config.get<string>("MAIL_FROM") ??
      `TaskPilot <${this.config.get<string>("SMTP_USER")}>`;
  }

  /** Verify the SMTP connection at boot so misconfiguration surfaces early. */
  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log("SMTP connection verified — mail service ready");
    } catch (err) {
      this.logger.error(
        "SMTP connection failed to verify — emails will not send until fixed",
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Send a single email, logging success/failure. Throws on failure so callers can decide. */
  private async send(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        ...options,
      });
      this.logger.log(`Email sent to ${options.to} (id: ${info.messageId})`);
      return info;
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${options.to} — "${options.subject}"`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  /**
   * Welcome email sent to a newly created user. Contains their temporary
   * password and a direct link to the sign-in page.
   */
  async sendWelcomeEmail(
    to: string,
    name: string,
    password: string,
    loginUrl: string,
  ) {
    return this.send({
      to,
      subject: "Welcome to TaskPilot — your account is ready",
      text:
        `Hi ${name},\n\n` +
        `An account has been created for you on TaskPilot.\n\n` +
        `Sign-in details:\n` +
        `  Email:    ${to}\n` +
        `  Password: ${password}\n\n` +
        `Sign in here: ${loginUrl}\n\n` +
        `You will be asked to change your password after your first login.\n`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111;">Welcome to TaskPilot</h2>
          <p>Hi ${name},</p>
          <p>An account has been created for you. Use the credentials below to sign in.</p>
          <table style="border-collapse:collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px;">Email</td>
              <td style="padding: 6px 0; font-weight: 600;">${to}</td>
            </tr>
            <tr>
              <td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px;">Password</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 15px; letter-spacing: 1px; font-weight: 600;">${password}</td>
            </tr>
          </table>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}"
               style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
              Sign in to TaskPilot
            </a>
          </p>
          <p style="color:#666; font-size:13px;">
            You will be prompted to set a new password after your first login.
          </p>
        </div>`,
    });
  }

  /**
   * Send the password-reset link. The raw token lives only in this email and
   * in the URL the user clicks — never in our database.
   */
  async sendPasswordReset(to: string, name: string, resetUrl: string) {
    return this.send({
      to,
      subject: "Reset your TaskPilot password",
      text:
        `Hi ${name},\n\n` +
        `We received a request to reset your TaskPilot password. ` +
        `Click the link below to choose a new one. This link expires in 15 minutes.\n\n` +
        `${resetUrl}\n\n` +
        `If you didn't request this, you can safely ignore this email — your password won't change.\n`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111;">Reset your password</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your TaskPilot password.
             Click the button below to choose a new one. This link expires in <strong>15 minutes</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}"
               style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
              Reset password
            </a>
          </p>
          <p style="color:#666;font-size:13px;">
            If the button doesn't work, paste this URL into your browser:<br />
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color:#666;font-size:13px;">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </div>`,
    });
  }

  /**
   * Security alert sent after a password is successfully reset.
   */
  async sendPasswordChangedAlert(to: string, name: string) {
    return this.send({
      to,
      subject: "Your TaskPilot password was changed",
      text:
        `Hi ${name},\n\n` +
        `Your TaskPilot password was just changed. ` +
        `If this was you, no action is needed.\n\n` +
        `If you did NOT make this change, contact your administrator immediately — ` +
        `your account may be compromised.\n`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111;">Your password was changed</h2>
          <p>Hi ${name},</p>
          <p>Your TaskPilot password was just changed. If this was you, no action is needed.</p>
          <p style="color:#b91c1c;">
            If you did <strong>not</strong> make this change, contact your administrator
            immediately — your account may be compromised.
          </p>
        </div>`,
    });
  }
}
