import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { Role } from "@prisma/client";

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

  /** Any user: update their name or password. */
  @ApiOperation({ summary: "Any user: update their name or password." })
  @Roles(Role.CEO, Role.ASSISTANT, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Patch("profile")
  updateProfile(@Body() dto: UpdateProfileDto, @Request() req) {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────
  // CEO-only: user management
  // ──────────────────────────────────────────────

  /**
   * CEO or ASSISTANT: create a new employee or team lead account.
   * Only CEO can create ASSISTANT accounts.
   */
  @ApiOperation({ summary: "CEO or ASSISTANT: create a new employee or team lead account.     Only CEO can create ASSISTANT accounts." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.usersService.createUser(createUserDto, req.user.companyId, req.user.role);
  }

  /** CEO or ASSISTANT: list all users in the company (paginated). */
  @ApiOperation({ summary: "CEO or ASSISTANT: list all users in the company (paginated)." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Get()
  findAll(@Query() pagination: PaginationDto, @Request() req) {
    return this.usersService.findAllByCompany(req.user.companyId, pagination);
  }

  /** CEO or ASSISTANT: block a user (prevents login). */
  @ApiOperation({ summary: "CEO or ASSISTANT: block a user (prevents login)." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Patch(":id/block")
  blockUser(@Param("id") userId: string, @Request() req) {
    return this.usersService.blockUser(userId, req.user.companyId);
  }

  /** CEO or ASSISTANT: unblock a user. */
  @ApiOperation({ summary: "CEO or ASSISTANT: unblock a user." })
  @Roles(Role.CEO, Role.ASSISTANT)
  @Patch(":id/unblock")
  unblockUser(@Param("id") userId: string, @Request() req) {
    return this.usersService.unblockUser(userId, req.user.companyId);
  }
}
