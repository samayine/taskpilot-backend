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

import { AnnouncementsService } from "./announcements.service";
import { CreateCompanyAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateCompanyAnnouncementDto } from "./dto/update-announcement.dto";

// Company-wide announcements. The CEO posts; everyone else reads.
@ApiTags("Announcements")
@ApiBearerAuth("JWT")
@Controller("announcements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  /** List company-wide announcements (any authenticated user). */
  @ApiOperation({ summary: "List company-wide announcements (pinned first)." })
  @Roles(
    Role.CEO,
    Role.ASSISTANT,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
  )
  @Get()
  list(@Query() pagination: PaginationDto, @Request() req) {
    return this.service.list(req.user.companyId, pagination);
  }

  /** Get a single announcement. */
  @ApiOperation({ summary: "Get one announcement." })
  @Roles(
    Role.CEO,
    Role.ASSISTANT,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
  )
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.service.findOne(id, req.user.companyId);
  }

  /** CEO: post a company-wide announcement. */
  @ApiOperation({ summary: "CEO posts a company-wide announcement." })
  @Roles(Role.CEO)
  @Post()
  create(@Body() dto: CreateCompanyAnnouncementDto, @Request() req) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }

  /** CEO (author): edit. */
  @ApiOperation({ summary: "CEO author edits their announcement." })
  @Roles(Role.CEO)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCompanyAnnouncementDto,
    @Request() req,
  ) {
    return this.service.update(
      id,
      dto,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }

  /** CEO (author): delete. */
  @ApiOperation({ summary: "CEO author deletes their announcement." })
  @Roles(Role.CEO)
  @Delete(":id")
  remove(@Param("id") id: string, @Request() req) {
    return this.service.remove(
      id,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }
}
