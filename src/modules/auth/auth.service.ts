import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { LoginDto } from "./dto/login.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { Role } from "@prisma/client";
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private activityLog: ActivityLogService,
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
}
