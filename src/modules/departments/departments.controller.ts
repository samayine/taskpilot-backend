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
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { AssignHeadDto } from "./dto/assign-head.dto";
import { CreateTeamDto } from "../teams/dto/create-team.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Departments")
@ApiBearerAuth("JWT")
@Controller("departments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  /** CEO creates a new department. */
  @Roles(Role.CEO)
  @Post()
  create(@Body() dto: CreateDepartmentDto, @Request() req) {
    return this.departmentsService.create(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** CEO sees all departments; DEPARTMENT_HEAD sees only their own. */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get()
  findAll(@Query() pagination: PaginationDto, @Request() req) {
    return this.departmentsService.findAll(
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }

  /** CEO or DEPARTMENT_HEAD views a single department with teams. */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.departmentsService.findOne(
      id,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }

  /** CEO updates department name/description. */
  @Roles(Role.CEO)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
    @Request() req,
  ) {
    return this.departmentsService.update(id, dto, req.user.companyId);
  }

  /** CEO assigns/changes a department head. */
  @Roles(Role.CEO)
  @Patch(":id/head")
  assignHead(
    @Param("id") id: string,
    @Body() dto: AssignHeadDto,
    @Request() req,
  ) {
    return this.departmentsService.assignHead(
      id,
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** DEPARTMENT_HEAD creates a team within their department. */
  @Roles(Role.DEPARTMENT_HEAD)
  @Post(":id/teams")
  createTeam(
    @Param("id") id: string,
    @Body() dto: CreateTeamDto,
    @Request() req,
  ) {
    return this.departmentsService.createTeamInDepartment(
      id,
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** CEO or DEPARTMENT_HEAD lists employees across all teams in a department. */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get(":id/employees")
  getEmployees(
    @Param("id") id: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    return this.departmentsService.getEmployees(
      id,
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }
}
