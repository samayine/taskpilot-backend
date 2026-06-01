import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateAssistantDto } from "./dto/create-assistant.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { Role } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";

// ── Inline filter DTO (no extra file needed) ──────────────────────────────────
class UserFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role, description: "Filter by role" })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: "Filter by blocked status (true/false)" })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  isBlocked?: boolean;

  @ApiPropertyOptional({ description: "Search by name or email" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: "Joined on or after this date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  joinedFrom?: string;

  @ApiPropertyOptional({ description: "Joined on or before this date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  joinedTo?: string;
}

// ── Inline admin-update DTO ───────────────────────────────────────────────────
class AdminUpdateUserDto {
  @ApiPropertyOptional({ example: "Jane Smith" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

@ApiTags("Users")
@ApiBearerAuth("JWT")
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ──────────────────────────────────────────────
  // Self-service: any authenticated user
  // ──────────────────────────────────────────────

  /** Any user: view their own profile. */
  @ApiOperation({ summary: "Any user: view their own profile." })
  @Roles(Role.CEO, Role.ASSISTANT, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get("profile")
  getProfile(@Request() req) {
    return this.usersService.getProfile(req.user.userId);
  }

  /** Any user: update their own name or password. */
  @ApiOperation({ summary: "Any user: update their own name or password." })
  @Roles(Role.CEO, Role.ASSISTANT, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Patch("profile")
  updateProfile(@Body() dto: UpdateProfileDto, @Request() req) {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────
  // CEO-only: assistant creation
  // ──────────────────────────────────────────────

  /** CEO: create a new assistant account. */
  @ApiOperation({ summary: "CEO: create a new assistant account." })
  @Roles(Role.CEO)
  @Post("assistant")
  createAssistant(@Body() dto: CreateAssistantDto, @Request() req) {
    return this.usersService.createAssistant(dto, req.user.companyId);
  }

  // ──────────────────────────────────────────────
  // CEO or ASSISTANT: user management
  // ──────────────────────────────────────────────

  /**
   * CEO or ASSISTANT: create a new DEPARTMENT_HEAD, TEAM_LEAD, or EMPLOYEE.
   * Only CEO can create DEPARTMENT_HEAD accounts.
   */
  @ApiOperation({ summary: "CEO or ASSISTANT: create a new user (DEPARTMENT_HEAD, TEAM_LEAD, EMPLOYEE)." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.usersService.createUser(createUserDto, req.user.companyId, req.user.role);
  }

  /**
   * CEO or ASSISTANT: list all users (paginated + filterable).
   * Query params: role, isBlocked, search, page, limit
   */
  @ApiOperation({ summary: "CEO or ASSISTANT: list users (filterable by role, blocked status, name/email search)." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Get()
  findAll(@Query() query: UserFilterDto, @Request() req) {
    const { role, isBlocked, search, joinedFrom, joinedTo, ...pagination } =
      query;
    return this.usersService.findAllByCompany(req.user.companyId, pagination, {
      role,
      isBlocked,
      search,
      joinedFrom,
      joinedTo,
    });
  }

  /**
   * CEO or DEPARTMENT_HEAD: list users that can be assigned to teams
   * (as team lead or member). CEO sees all company users; a DEPARTMENT_HEAD
   * sees only users in the departments they head.
   */
  @ApiOperation({
    summary:
      "CEO or DEPARTMENT_HEAD: list users assignable to teams (scoped by role).",
  })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get("assignable")
  findAssignable(@Request() req) {
    return this.usersService.getAssignableUsers(
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }

  /**
   * CEO or ASSISTANT: admin-update another user's profile.
   * CEO: can update fullName + role (not to CEO).
   * ASSISTANT: can update fullName only; cannot touch other ASSISTANTs.
   */
  @ApiOperation({ summary: "CEO or ASSISTANT: admin-update a user's fullName (and role for CEO)." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Patch(":id")
  adminUpdateUser(
    @Param("id") targetId: string,
    @Body() dto: AdminUpdateUserDto,
    @Request() req,
  ) {
    return this.usersService.adminUpdateUser(
      targetId,
      req.user.companyId,
      req.user.role,
      dto,
    );
  }

  /**
   * CEO or ASSISTANT: permanently delete a user from the company.
   * ASSISTANT cannot delete the CEO or other ASSISTANTs.
   */
  @ApiOperation({ summary: "CEO or ASSISTANT: permanently delete a user." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Delete(":id")
  deleteUser(@Param("id") targetId: string, @Request() req) {
    return this.usersService.deleteUser(
      targetId,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }

  /** CEO or ASSISTANT: block a user (prevents login). */
  @ApiOperation({ summary: "CEO or ASSISTANT: block a user." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Patch(":id/block")
  blockUser(@Param("id") userId: string, @Request() req) {
    return this.usersService.blockUser(userId, req.user.companyId, req.user.role);
  }

  /** CEO or ASSISTANT: unblock a user. */
  @ApiOperation({ summary: "CEO or ASSISTANT: unblock a user." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Patch(":id/unblock")
  unblockUser(@Param("id") userId: string, @Request() req) {
    return this.usersService.unblockUser(userId, req.user.companyId);
  }
}
