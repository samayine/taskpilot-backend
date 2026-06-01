import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role, User } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateAssistantDto } from "./dto/create-assistant.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { MailService } from "../mail/mail.service";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

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

    const loginUrl = `${this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000"}/login`;
    this.mailService
      .sendWelcomeEmail(
        safeUser.email,
        safeUser.fullName,
        rawPassword,
        loginUrl,
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send welcome email to ${safeUser.email}: ${err}`,
        ),
      );

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
    if (
      createUserDto.role === Role.DEPARTMENT_HEAD &&
      callerRole !== Role.CEO
    ) {
      throw new BadRequestException(
        "Only the CEO can create DEPARTMENT_HEAD accounts",
      );
    }

    if (createUserDto.role === Role.TEAM_LEAD) {
      throw new BadRequestException(
        "TEAM_LEAD cannot be assigned at creation. Add the user as an EMPLOYEE and then assign them as a team lead.",
      );
    }

    if (!createUserDto.departmentId) {
      throw new BadRequestException(
        "departmentId is required when creating EMPLOYEE or DEPARTMENT_HEAD accounts",
      );
    }

    const department = await this.prismaService.department.findUnique({
      where: { id: createUserDto.departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException(
        "Department not found or does not belong to your company",
      );
    }

    const existingEmail = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingEmail) {
      throw new ConflictException("Email already in use");
    }

    let rawPassword = createUserDto.password;
    let mustChangePassword = false;

    if (!rawPassword) {
      rawPassword = crypto.randomBytes(8).toString("hex");
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

    const loginUrl = `${this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3001"}/login`;
    this.mailService
      .sendWelcomeEmail(
        safeUser.email,
        safeUser.fullName,
        rawPassword,
        loginUrl,
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send welcome email to ${safeUser.email}: ${err}`,
        ),
      );

    return {
      ...safeUser,
      ...(mustChangePassword ? { temporaryPassword: rawPassword } : {}),
    };
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: list users (paginated + filtered)
  // ──────────────────────────────────────────────

  async findAllByCompany(
    companyId: string,
    pagination: PaginationDto,
    filters: {
      role?: Role;
      isBlocked?: boolean;
      search?: string;
      joinedFrom?: string;
      joinedTo?: string;
    },
  ) {
    const where: Prisma.UserWhereInput = { companyId };

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isBlocked !== undefined) {
      where.isBlocked = filters.isBlocked;
    }

    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.joinedFrom || filters.joinedTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.joinedFrom) createdAt.gte = new Date(filters.joinedFrom);
      if (filters.joinedTo) {
        // Treat joinedTo as inclusive end-of-day.
        const end = new Date(filters.joinedTo);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

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
          departmentId: true,
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prismaService.user.count({ where }),
    ]);

    return paginate(users, total, pagination);
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: admin-update another user's profile
  // CEO can change fullName + role
  // ASSISTANT can change fullName only (not role, not other ASSISTANTs)
  // ──────────────────────────────────────────────

  async adminUpdateUser(
    targetId: string,
    companyId: string,
    callerRole: Role,
    dto: { fullName?: string; role?: Role },
  ) {
    const target = await this.prismaService.user.findUnique({
      where: { id: targetId },
    });

    if (!target || target.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    // Cannot edit the CEO account
    if (target.role === Role.CEO) {
      throw new ForbiddenException("CEO account cannot be edited");
    }

    // ASSISTANT cannot edit another ASSISTANT
    if (callerRole === Role.ASSISTANT && target.role === Role.ASSISTANT) {
      throw new ForbiddenException(
        "Assistants cannot edit other assistant accounts",
      );
    }

    // ASSISTANT cannot change roles
    if (callerRole === Role.ASSISTANT && dto.role !== undefined) {
      throw new ForbiddenException("Assistants cannot change user roles");
    }

    const data: Prisma.UserUpdateInput = {};

    if (dto.fullName) {
      data.fullName = dto.fullName;
    }

    if (dto.role !== undefined && callerRole === Role.CEO) {
      if (dto.role === Role.CEO) {
        throw new BadRequestException("Cannot assign the CEO role");
      }
      data.role = dto.role;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No fields to update");
    }

    return this.prismaService.user.update({
      where: { id: targetId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        departmentId: true,
      },
    });
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: delete a user
  // Hierarchy: nobody deletes the CEO or themselves; an ASSISTANT cannot
  // delete another ASSISTANT. Hybrid delete: block when the target still
  // holds meaningful responsibilities (heads a department, leads a team,
  // or has tasks); trivial children (memberships, comments, notifications,
  // chat) are cleaned up by schema-level cascades.
  // ──────────────────────────────────────────────

  async deleteUser(
    targetId: string,
    companyId: string,
    callerId: string,
    callerRole: Role,
  ) {
    const target = await this.prismaService.user.findUnique({
      where: { id: targetId },
    });

    if (!target || target.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    if (target.role === Role.CEO) {
      throw new ForbiddenException("Cannot delete the CEO account");
    }

    if (target.id === callerId) {
      throw new BadRequestException("Cannot delete your own account");
    }

    if (callerRole === Role.ASSISTANT && target.role === Role.ASSISTANT) {
      throw new ForbiddenException(
        "Assistants cannot delete other assistant accounts",
      );
    }

    // Hybrid delete — block when meaningful dependents exist
    const [headOf, leadsTeams, taskCount] = await Promise.all([
      this.prismaService.department.count({ where: { headId: targetId } }),
      this.prismaService.team.count({ where: { teamLeadId: targetId } }),
      this.prismaService.task.count({
        where: { OR: [{ assigneeId: targetId }, { creatorId: targetId }] },
      }),
    ]);

    if (headOf > 0) {
      throw new BadRequestException(
        "This user heads a department. Reassign the department head before deleting them.",
      );
    }
    if (leadsTeams > 0) {
      throw new BadRequestException(
        "This user leads one or more teams. Reassign those team leads before deleting them.",
      );
    }
    if (taskCount > 0) {
      throw new BadRequestException(
        "This user has tasks (created or assigned). Reassign or remove those tasks before deleting them.",
      );
    }

    await this.prismaService.user.delete({ where: { id: targetId } });

    return { message: `User ${target.fullName} has been deleted` };
  }

  // ──────────────────────────────────────────────
  // CEO or DEPARTMENT_HEAD: list users assignable to teams
  // CEO: all company users; DEPARTMENT_HEAD: users in departments they head
  // ──────────────────────────────────────────────

  async getAssignableUsers(
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const where: Prisma.UserWhereInput = { companyId };

    if (callerRole === Role.DEPARTMENT_HEAD) {
      const headedDepts = await this.prismaService.department.findMany({
        where: { headId: callerId, companyId },
        select: { id: true },
      });
      const deptIds = headedDepts.map((d) => d.id);
      // Include the head themselves so they can be assigned as a team lead.
      where.OR = [{ departmentId: { in: deptIds } }, { id: callerId }];
    }

    const users = await this.prismaService.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isBlocked: true,
        departmentId: true,
      },
      orderBy: { fullName: "asc" },
    });

    return users;
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: block / unblock
  // CEO can block ASSISTANT; ASSISTANT cannot block ASSISTANT
  // ──────────────────────────────────────────────

  async blockUser(userId: string, companyId: string, callerRole: Role) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    // Nobody can block CEO
    if (user.role === Role.CEO) {
      throw new BadRequestException("Cannot block the CEO");
    }

    // ASSISTANT cannot block another ASSISTANT
    if (callerRole === Role.ASSISTANT && user.role === Role.ASSISTANT) {
      throw new ForbiddenException("Assistants cannot block other assistants");
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

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const data: Record<string, any> = {};

    if (dto.fullName) {
      data.fullName = dto.fullName;
    }

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
