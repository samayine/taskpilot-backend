import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { ActivityLogService } from "./activity-log.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { ActivityLogFilterDto } from "./dto/activity-log-filter.dto";

@ApiTags("Activity Logs")
@ApiBearerAuth("JWT")
@Controller("activity-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  /** CEO views activity logs for the company (filterable + paginated). */
  @ApiOperation({
    summary:
      "CEO views activity logs for the company (filter by action, entity, user).",
  })
  @Roles(Role.CEO)
  @Get()
  findAll(@Query() filters: ActivityLogFilterDto, @Request() req) {
    return this.activityLogService.findByCompany(
      req.user.companyId,
      filters,
    );
  }

  /** Distinct actions + entity types currently present in this company. */
  @ApiOperation({
    summary: "Distinct action / entityType values for the filter dropdowns.",
  })
  @Roles(Role.CEO)
  @Get("facets")
  facets(@Request() req) {
    return this.activityLogService.getFacets(req.user.companyId);
  }
}
