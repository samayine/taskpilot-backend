import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { MeService } from "./me.service";

@ApiTags("Me")
@ApiBearerAuth("JWT")
@Controller("me")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  /** Composed home payload (role-aware) for the daily landing page. */
  @ApiOperation({
    summary:
      "Composed daily home payload (role-aware). Powers the /home page.",
  })
  @Roles(
    Role.CEO,
    Role.ASSISTANT,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
  )
  @Get("home")
  getHome(@Request() req) {
    return this.meService.getHome(
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /**
   * Role-aware analytics: totals + status/priority breakdowns + 14-day
   * completion trend. CEO is routed to /company/dashboard instead.
   */
  @ApiOperation({
    summary:
      "Role-aware analytics (totals, breakdowns, 14-day trend). Powers Overview for non-CEO roles.",
  })
  @Roles(
    Role.ASSISTANT,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
  )
  @Get("analytics")
  getAnalytics(@Request() req) {
    return this.meService.getAnalytics(
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
