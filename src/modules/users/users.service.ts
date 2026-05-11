import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role, User } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createUser(
    createUserDto: CreateUserDto,
    companyId: string,
    callerRole: Role,
  ): Promise<Omit<User, 'password'>> {
    // Only CEO can create ASSISTANT accounts
    if (createUserDto.role === Role.ASSISTANT && callerRole !== Role.CEO) {
      throw new BadRequestException(
        'Only the CEO can create ASSISTANT accounts',
      );
    }

    const existingEmail = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingEmail) {
      throw new ConflictException("Email already in use");
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prismaService.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        companyId: companyId,
      },
    });

    const { password, ...safeUser } = user;
    return safeUser;
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
