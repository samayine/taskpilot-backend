import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Login — stricter rate limit: 5 attempts per minute. */
  @ApiOperation({ summary: "Login — stricter rate limit: 5 attempts per minute." })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("login")
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({ summary: "Register company" })
  @Post("register-company")
  async registerCompany(@Body() registerCompanyDto: RegisterCompanyDto) {
    return this.authService.registerCompany(registerCompanyDto);
  }

  /**
   * Request a password reset link. Always returns the same response whether or
   * not the email exists (anti-enumeration). Aggressively rate-limited.
   */
  @ApiOperation({
    summary: "Request a password reset link — rate limited: 3 per 15 minutes.",
  })
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Reset a password using a valid (unexpired, unused) token from the email.
   */
  @ApiOperation({
    summary: "Reset password using a token — rate limited: 5 per 15 minutes.",
  })
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
