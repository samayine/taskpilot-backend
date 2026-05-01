import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post("register-company")
  async registerCompany(@Body() registerCompanyDto: RegisterCompanyDto) {
    return this.authService.registerCompany(registerCompanyDto);
  }
}
