import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { LoginDto } from "./dto/login.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { MailService } from "../mail/mail.service";
import { Role } from "@prisma/client";
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private activityLog: ActivityLogService,
    private mailService: MailService,
    private config: ConfigService,
  ) {}

  async registerCompany(dto: RegisterCompanyDto) {
    const existingUser = await this.usersService.findByEmailOptional(
      dto.ceoEmail,
    );
    if (existingUser) {
      throw new BadRequestException("Email already in use!");
    }

    const hashedPassword = await bcrypt.hash(dto.ceoPassword, 10);

    return this.prismaService.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.companyName },
      });

      const ceo = await tx.user.create({
        data: {
          fullName: dto.ceoFullName,
          email: dto.ceoEmail,
          password: hashedPassword,
          role: Role.CEO,
          companyId: company.id,
        },
      });

      const { password, ...safeCeo } = ceo;

      // Log company registration
      await tx.activityLog.create({
        data: {
          userId: ceo.id,
          companyId: company.id,
          action: "COMPANY_REGISTERED",
          entityType: "Company",
          entityId: company.id,
          metadata: { companyName: company.name },
        },
      });

      return { company, ceo: safeCeo };
    });
  }

  async login(loginDto: LoginDto): Promise<{ access_token }> {
    const user = await this.usersService.findByEmailOptional(loginDto.email);

    if (!user || user.isBlocked)
      throw new UnauthorizedException(
        "Invalid credentials or account get blocked!",
      );

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid Credentials");
    }

    const payLoad = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.mustChangePassword,
    };
    // Log the login (fire-and-forget, don't block response)
    this.activityLog.logAction(
      user.id,
      user.companyId,
      "USER_LOGIN",
      "User",
      user.id,
      { email: user.email, role: user.role },
    );

    return {
      access_token: this.jwtService.sign(payLoad),
    };
  }

  // ──────────────────────────────────────────────
  // Self-service: request a password reset link
  // ──────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    // Same response in every branch — prevents email enumeration.
    const genericResponse = {
      message:
        "If an account exists with that email, a password reset link has been sent.",
    };

    const user = await this.usersService.findByEmailOptional(dto.email);
    if (!user || user.isBlocked) {
      return genericResponse;
    }

    // Cryptographically secure random token; store only its SHA-256 hash.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Short, 15-minute expiry.
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: expiry,
      },
    });

    const frontendUrl =
      this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Don't leak SMTP failures to the caller — log and still return generic.
    try {
      await this.mailService.sendPasswordReset(
        user.email,
        user.fullName,
        resetUrl,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${user.email}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    this.activityLog.logAction(
      user.id,
      user.companyId,
      "PASSWORD_RESET_REQUESTED",
      "User",
      user.id,
      { email: user.email },
    );

    return genericResponse;
  }

  // ──────────────────────────────────────────────
  // Self-service: reset password using a valid token
  // ──────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const hashedToken = crypto
      .createHash("sha256")
      .update(dto.token)
      .digest("hex");

    const user = await this.prismaService.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        // One-time use — clear the token immediately.
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    // Security alert email — fire-and-forget, never block the reset.
    this.mailService
      .sendPasswordChangedAlert(user.email, user.fullName)
      .catch((err) =>
        this.logger.error(
          `Failed to send password-changed alert to ${user.email}`,
          err instanceof Error ? err.stack : String(err),
        ),
      );

    this.activityLog.logAction(
      user.id,
      user.companyId,
      "PASSWORD_RESET_COMPLETED",
      "User",
      user.id,
      { email: user.email },
    );

    return {
      message:
        "Your password has been reset successfully. You can now log in with your new password.",
    };
  }
}
