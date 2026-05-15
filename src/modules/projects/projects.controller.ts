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
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Projects")
@ApiBearerAuth("JWT")
@Controller("projects")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** CEO creates a cross-department project. */
  @ApiOperation({ summary: "CEO creates a cross-department project." })
  @Roles(Role.CEO)
  @Post()
  create(@Body() dto: CreateProjectDto, @Request() req) {
    return this.projectsService.create(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** List projects (scoped by role). */
  @ApiOperation({ summary: "List projects (scoped by role)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Get()
  findAll(@Query() pagination: PaginationDto, @Request() req) {
    return this.projectsService.findAll(
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }

  /** Get a single project with department breakdown. */
  @ApiOperation({ summary: "Get a single project with department breakdown." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.projectsService.findOne(id, req.user.companyId);
  }

  /** CEO updates project status/details. */
  @ApiOperation({ summary: "CEO updates project status/details." })
  @Roles(Role.CEO)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @Request() req,
  ) {
    return this.projectsService.update(id, dto, req.user.companyId);
  }

  /** CEO adds a department to a project. */
  @ApiOperation({ summary: "CEO adds a department to a project." })
  @Roles(Role.CEO)
  @Post(":id/departments/:deptId")
  addDepartment(
    @Param("id") id: string,
    @Param("deptId") deptId: string,
    @Request() req,
  ) {
    return this.projectsService.addDepartment(id, deptId, req.user.companyId);
  }

  /** CEO removes a department from a project. */
  @ApiOperation({ summary: "CEO removes a department from a project." })
  @Roles(Role.CEO)
  @Delete(":id/departments/:deptId")
  removeDepartment(
    @Param("id") id: string,
    @Param("deptId") deptId: string,
    @Request() req,
  ) {
    return this.projectsService.removeDepartment(id, deptId, req.user.companyId);
  }

  /** Get tasks for a project (dept heads see only their department's tasks). */
  @ApiOperation({ summary: "Get tasks for a project (dept heads see only their department's tasks)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Get(":id/tasks")
  getProjectTasks(
    @Param("id") id: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    return this.projectsService.getProjectTasks(
      id,
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }

  /** Per-department progress dashboard for a project. */
  @ApiOperation({ summary: "Per-department progress dashboard for a project." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get(":id/dashboard")
  getDashboard(@Param("id") id: string, @Request() req) {
    return this.projectsService.getDashboard(id, req.user.companyId);
  }
}
