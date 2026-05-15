import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role, User } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateAssistantDto } from "./dto/create-assistant.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  // ──────────────────────────────────────────────
  // CEO-only: create an assistant account
  // ──────────────────────────────────────────────

  async createAssistant(dto: CreateAssistantDto, companyId: string) {
    const existingEmail = await this.prismaService.user.findUnique({
      where: { email: dto.email },
    });

    if (existingEmail) {
      throw new ConflictException("Email already in use");
    }

    // Auto-generate password if not provided
    let rawPassword = dto.password;
    let mustChangePassword = false;

    if (!rawPassword) {
      rawPassword = crypto.randomBytes(8).toString("hex");
      mustChangePassword = true;
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = await this.prismaService.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        role: Role.ASSISTANT,
        mustChangePassword,
        companyId,
      },
    });

    const { password, ...safeUser } = user;

    return {
      ...safeUser,
      ...(mustChangePassword ? { temporaryPassword: rawPassword } : {}),
    };
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: create DEPARTMENT_HEAD, TEAM_LEAD, or EMPLOYEE
  // ──────────────────────────────────────────────

  async createUser(
    createUserDto: CreateUserDto,
    companyId: string,
    callerRole: Role,
  ) {
    // Only CEO can create DEPARTMENT_HEAD accounts
    if (
      createUserDto.role === Role.DEPARTMENT_HEAD &&
      callerRole !== Role.CEO
    ) {
      throw new BadRequestException(
        'Only the CEO can create DEPARTMENT_HEAD accounts',
      );
    }

    // Enforce departmentId for all roles handled by this endpoint
    if (!createUserDto.departmentId) {
      throw new BadRequestException(
        'departmentId is required when creating EMPLOYEE, TEAM_LEAD, or DEPARTMENT_HEAD accounts',
      );
    }

    // Validate that the department exists and belongs to the same company
    const department = await this.prismaService.department.findUnique({
      where: { id: createUserDto.departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException(
        'Department not found or does not belong to your company',
      );
    }

    const existingEmail = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingEmail) {
      throw new ConflictException("Email already in use");
    }

    // Auto-generate password if not provided (ASSISTANT creating employees)
    let rawPassword = createUserDto.password;
    let mustChangePassword = false;

    if (!rawPassword) {
      rawPassword = crypto.randomBytes(8).toString("hex"); // 16 char random password
      mustChangePassword = true;
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const { departmentId, password: _pw, ...userData } = createUserDto;

    const user = await this.prismaService.user.create({
      data: {
        ...userData,
        password: hashedPassword,
        mustChangePassword,
        companyId,
        departmentId,
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    const { password, ...safeUser } = user;

    // Return temp password so ASSISTANT can share it with the employee
    return {
      ...safeUser,
      ...(mustChangePassword ? { temporaryPassword: rawPassword } : {}),
    };
  }

  /**
   * CEO: List all users in the company (paginated).
   */
  async findAllByCompany(companyId: string, pagination: PaginationDto) {
    const where = { companyId };

    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isBlocked: true,
          status: true,
          createdAt: true,
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prismaService.user.count({ where }),
    ]);

    return paginate(users, total, pagination);
  }

  /**
   * CEO: Block a user (prevent login).
   */
  async blockUser(userId: string, companyId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    if (user.role === Role.CEO || user.role === Role.ASSISTANT) {
      throw new BadRequestException("Cannot block CEO or ASSISTANT users");
    }

    if (user.isBlocked) {
      throw new BadRequestException("User is already blocked");
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data: { isBlocked: true },
    });

    return { message: `User ${user.fullName} has been blocked` };
  }

  /**
   * CEO: Unblock a user.
   */
  async unblockUser(userId: string, companyId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    if (!user.isBlocked) {
      throw new BadRequestException("User is not blocked");
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data: { isBlocked: false },
    });

    return { message: `User ${user.fullName} has been unblocked` };
  }

  // ──────────────────────────────────────────────
  // Self-service: Profile
  // ──────────────────────────────────────────────

  /**
   * Any user: view their own profile.
   */
  async getProfile(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isBlocked: true,
        status: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  /**
   * Any user: update their own profile (name and/or password).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const data: Record<string, any> = {};

    // Update name
    if (dto.fullName) {
      data.fullName = dto.fullName;
    }

    // Update password (requires current password)
    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException(
          "Current password is required to set a new password",
        );
      }

      const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
      if (!isMatch) {
        throw new BadRequestException("Current password is incorrect");
      }

      data.password = await bcrypt.hash(dto.newPassword, 10);
      // Clear the mustChangePassword flag when user sets a new password
      data.mustChangePassword = false;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No fields to update");
    }

    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return updated;
  }

  /** Use for auth: unknown email must not throw (same error as bad password). */
  async findByEmailOptional(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { email } });
  }

  async findByEmailOrThrow(email: string): Promise<User> {
    const user = await this.findByEmailOptional(email);
    if (!user) {
      throw new NotFoundException("User not found!");
    }
    return user;
  }
}
