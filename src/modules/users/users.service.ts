import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role, User } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createUser(
    createUserDto: CreateUserDto,
    companyId: string,
  ): Promise<Omit<User, 'password'>> {
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

    if (user.role === Role.CEO) {
      throw new BadRequestException("Cannot block the CEO");
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
