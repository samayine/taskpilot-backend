import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ActivityLogService } from "./activity-log.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Role } from "@prisma/client";

@ApiTags("Activity Logs")
@ApiBearerAuth("JWT")
@Controller("activity-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  /** CEO views all activity logs for the company. */
  @Roles(Role.CEO)
  @Get()
  findAll(@Request() req) {
    return this.activityLogService.findByCompany(req.user.companyId);
  }
}
