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
import { TeamsService } from "./teams.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { AddTeamMemberDto } from "./dto/add-team-member.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { ApiTags, ApiBearerAuth, ApiQuery, ApiOperation, ApiPropertyOptional } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { IsOptional, IsString, MaxLength } from "class-validator";

// ── Inline update DTO ─────────────────────────────────────────────────────────
class UpdateTeamDto {
  @ApiPropertyOptional({ example: "Alpha Team" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: "Frontend development team" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "UUID of the new team lead" })
  @IsOptional()
  @IsString()
  teamLeadId?: string;
}

@ApiTags("Teams")
@ApiBearerAuth("JWT")
@Controller("teams")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD: create team
  // ─────────────────────────────────────────────

  /** CEO or DEPARTMENT_HEAD creates a team (dept-heads scoped to their dept). */
  @ApiOperation({ summary: "CEO or DEPARTMENT_HEAD creates a new team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Post()
  create(@Body() dto: CreateTeamDto, @Request() req) {
    return this.teamsService.createTeam(
      dto,
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD / TEAM_LEAD: list teams
  // ─────────────────────────────────────────────

  /**
   * CEO: all teams (optional departmentId filter).
   * DEPARTMENT_HEAD: teams in their own departments only.
   * TEAM_LEAD: only teams they lead.
   */
  @ApiOperation({
    summary:
      "List teams — CEO sees all; DEPT_HEAD sees their dept; TEAM_LEAD sees their own.",
  })
  @ApiQuery({ name: "departmentId", required: false })
  @Roles(Role.CEO, Role.TEAM_LEAD, Role.DEPARTMENT_HEAD)
  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @Query("departmentId") departmentId: string,
    @Request() req,
  ) {
    return this.teamsService.findAllByCompany(
      req.user.companyId,
      pagination,
      req.user.role,
      req.user.userId,
      departmentId,
    );
  }

  // ─────────────────────────────────────────────
  // List "my projects" — teams the caller is associated with
  // (member / lead / dept-head over it / CEO). Powers the Projects page.
  // Defined BEFORE :id so "/teams/me" doesn't get parsed as an ID.
  // ─────────────────────────────────────────────

  /** List teams the caller participates in (one team = one project hub). */
  @ApiOperation({
    summary:
      "List teams the caller participates in (member, lead, dept-head, or CEO).",
  })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get("me")
  findMine(@Query() pagination: PaginationDto, @Request() req) {
    return this.teamsService.findMyProjects(
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD / TEAM_LEAD / EMPLOYEE (members): get single team
  // ─────────────────────────────────────────────

  /**
   * CEO: any team.
   * DEPARTMENT_HEAD: teams in their department (or a member of).
   * TEAM_LEAD: teams they lead (or a member of).
   * EMPLOYEE: teams they are a member of.
   */
  @ApiOperation({ summary: "Get a single team (scoped by role)." })
  @Roles(Role.CEO, Role.TEAM_LEAD, Role.DEPARTMENT_HEAD, Role.EMPLOYEE)
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.teamsService.findOne(
      id,
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD: edit team
  // ─────────────────────────────────────────────

  /**
   * CEO: edit any team.
   * DEPARTMENT_HEAD: edit teams in their department.
   */
  @ApiOperation({ summary: "CEO or DEPARTMENT_HEAD: edit a team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Patch(":id")
  updateTeam(
    @Param("id") id: string,
    @Body() dto: UpdateTeamDto,
    @Request() req,
  ) {
    return this.teamsService.updateTeam(
      id,
      req.user.companyId,
      req.user.role,
      req.user.userId,
      dto,
    );
  }

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD: delete team
  // ─────────────────────────────────────────────

  /**
   * CEO: delete any team.
   * DEPARTMENT_HEAD: delete teams in their department.
   */
  @ApiOperation({ summary: "CEO or DEPARTMENT_HEAD: delete a team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Delete(":id")
  deleteTeam(@Param("id") id: string, @Request() req) {
    return this.teamsService.deleteTeam(
      id,
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }

  // ─────────────────────────────────────────────
  // CEO / DEPT_HEAD: member management
  // ─────────────────────────────────────────────

  /**
   * CEO: add member to any team.
   * DEPARTMENT_HEAD: add member to teams in their department.
   */
  @ApiOperation({ summary: "CEO or DEPARTMENT_HEAD: add a member to a team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Post(":id/members")
  addMember(
    @Param("id") teamId: string,
    @Body() dto: AddTeamMemberDto,
    @Request() req,
  ) {
    return this.teamsService.addMember(
      teamId,
      dto,
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }

  /**
   * CEO: remove member from any team.
   * DEPARTMENT_HEAD: remove member from teams in their department.
   */
  @ApiOperation({ summary: "CEO or DEPARTMENT_HEAD: remove a member from a team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Delete(":id/members/:userId")
  removeMember(
    @Param("id") teamId: string,
    @Param("userId") userId: string,
    @Request() req,
  ) {
    return this.teamsService.removeMember(
      teamId,
      userId,
      req.user.companyId,
      req.user.role,
      req.user.userId,
    );
  }
}
