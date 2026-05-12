import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { ApiTags, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { Role } from "@prisma/client";

@ApiTags("Teams")
@ApiBearerAuth("JWT")
@Controller("teams")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /** CEO creates a new team. */
  @Roles(Role.CEO)
  @Post()
  create(@Body() dto: CreateTeamDto, @Request() req) {
    return this.teamsService.createTeam(dto, req.user.companyId);
  }

  /** CEO or Team Lead can view all teams (filterable by departmentId). */
  @ApiQuery({ name: "departmentId", required: false, description: "Filter teams by department ID" })
  @Roles(Role.CEO, Role.TEAM_LEAD, Role.DEPARTMENT_HEAD)
  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @Query("departmentId") departmentId: string,
    @Request() req,
  ) {
    return this.teamsService.findAllByCompany(req.user.companyId, pagination, departmentId);
  }

  /** CEO or Team Lead can view a single team. */
  @Roles(Role.CEO, Role.TEAM_LEAD)
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.teamsService.findOne(id, req.user.companyId);
  }

  /** CEO adds a member to a team. */
  @Roles(Role.CEO)
  @Post(":id/members")
  addMember(
    @Param("id") teamId: string,
    @Body() dto: AddTeamMemberDto,
    @Request() req,
  ) {
    return this.teamsService.addMember(teamId, dto, req.user.companyId);
  }

  /** CEO removes a member from a team. */
  @Roles(Role.CEO)
  @Delete(":id/members/:userId")
  removeMember(
    @Param("id") teamId: string,
    @Param("userId") userId: string,
    @Request() req,
  ) {
    return this.teamsService.removeMember(teamId, userId, req.user.companyId);
  }
}
