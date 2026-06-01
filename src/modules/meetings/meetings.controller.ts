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

import { MeetingsService } from "./meetings.service";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { UpdateMeetingDto } from "./dto/update-meeting.dto";
import { CancelMeetingDto, RsvpDto } from "./dto/rsvp.dto";

@ApiTags("Meetings")
@ApiBearerAuth("JWT")
@Controller("meetings")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** What scopes / departments / teams can the caller schedule a meeting for? */
  @ApiOperation({ summary: "List the meeting scopes/targets the caller can schedule." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Get("eligible-scopes")
  eligibleScopes(@Request() req) {
    return this.meetings.eligibleScopes(
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Upcoming meetings for the caller (used on Home). */
  @ApiOperation({ summary: "The caller's next few upcoming meetings." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Get("upcoming")
  upcoming(@Request() req, @Query("take") take?: string) {
    const n = Math.min(20, Math.max(1, Number(take) || 3));
    return this.meetings.findUpcomingForUser(
      req.user.userId,
      req.user.companyId,
      n,
    );
  }

  /** Schedule a meeting (permissions vary by scope). */
  @ApiOperation({ summary: "Schedule a meeting." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post()
  create(@Body() dto: CreateMeetingDto, @Request() req) {
    return this.meetings.create(
      dto,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Filterable list of the caller's relevant meetings. */
  @ApiOperation({ summary: "List meetings (upcoming / past / all)." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @Query("filter") filter: "upcoming" | "past" | "all" = "upcoming",
    @Request() req,
  ) {
    return this.meetings.findAll(
      req.user.userId,
      req.user.role,
      req.user.companyId,
      filter,
      pagination,
    );
  }

  /** Get a single meeting. */
  @ApiOperation({ summary: "Get a single meeting." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.meetings.findOne(
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Update a meeting (creator or CEO). */
  @ApiOperation({ summary: "Edit a meeting (creator or CEO)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMeetingDto,
    @Request() req,
  ) {
    return this.meetings.update(
      id,
      dto,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Cancel a meeting (creator or CEO). */
  @ApiOperation({ summary: "Cancel a meeting (creator or CEO)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Delete(":id")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelMeetingDto,
    @Request() req,
  ) {
    return this.meetings.cancel(
      id,
      dto?.reason,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** RSVP to a meeting as the caller. */
  @ApiOperation({ summary: "RSVP to a meeting." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Patch(":id/rsvp")
  rsvp(
    @Param("id") id: string,
    @Body() dto: RsvpDto,
    @Request() req,
  ) {
    return this.meetings.rsvp(
      id,
      dto.rsvp,
      req.user.userId,
      req.user.companyId,
    );
  }
}
