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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { TeamAnnouncementsService } from "./team-announcements.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

@ApiTags("TeamAnnouncements")
@ApiBearerAuth("JWT")
@Controller("teams/:teamId/announcements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamAnnouncementsController {
  constructor(private readonly service: TeamAnnouncementsService) {}

  /** List a team's announcements (pinned first; readable by any team member). */
  @ApiOperation({ summary: "List a team's announcements (pinned first)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get()
  list(
    @Param("teamId") teamId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    return this.service.list(
      teamId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      pagination,
    );
  }

  /** Post a new announcement (team lead / dept head / CEO only). */
  @ApiOperation({ summary: "Post a new announcement to a team." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post()
  create(
    @Param("teamId") teamId: string,
    @Body() dto: CreateAnnouncementDto,
    @Request() req,
  ) {
    return this.service.create(
      teamId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Edit an announcement (author or team manager). */
  @ApiOperation({ summary: "Edit an announcement." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id")
  update(
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Request() req,
  ) {
    return this.service.update(
      teamId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Delete an announcement (author or team manager). */
  @ApiOperation({ summary: "Delete an announcement." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Delete(":id")
  remove(
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Request() req,
  ) {
    return this.service.remove(
      teamId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
