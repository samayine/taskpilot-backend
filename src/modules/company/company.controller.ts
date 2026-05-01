import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
} from "@nestjs/common";
import { CompanyService } from "./company.service";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("company")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /** CEO views company profile. */
  @Roles(Role.CEO)
  @Get()
  getProfile(@Request() req) {
    return this.companyService.getCompanyProfile(req.user.companyId);
  }

  /** CEO updates company details. */
  @Roles(Role.CEO)
  @Patch()
  update(@Body() dto: UpdateCompanyDto, @Request() req) {
    return this.companyService.updateCompany(req.user.companyId, dto);
  }

  /** CEO dashboard — aggregated company statistics. */
  @Roles(Role.CEO)
  @Get("dashboard")
  getDashboard(@Request() req) {
    return this.companyService.getDashboardStats(req.user.companyId);
  }
}
