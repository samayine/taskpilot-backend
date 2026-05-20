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
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ReviewTaskDto } from "./dto/review-task.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { TaskHistoryService } from "../task-history/task-history.service";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { TaskFilterDto } from "./dto/task-filter.dto";
import { Role } from "@prisma/client";

@ApiTags("Tasks")
@ApiBearerAuth("JWT")
@Controller("tasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskHistoryService: TaskHistoryService,
  ) {}

  // ──────────────────────────────────────────────
  // Team Lead endpoints
  // ──────────────────────────────────────────────

  /** Team Lead, Department Head (or CEO acting as lead) creates and assigns a task. */
  @ApiOperation({ summary: "Team Lead, Department Head (or CEO acting as lead) creates and assigns a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post()
  create(@Body() dto: CreateTaskDto, @Request() req) {
    return this.tasksService.createTask(
      dto,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Team Lead (or CEO) views all tasks across their teams (filterable). */
  @ApiOperation({ summary: "Team Lead (or CEO) views all tasks across their teams (filterable)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Get("team")
  findTeamTasks(@Query() filters: TaskFilterDto, @Request() req) {
    return this.tasksService.findTeamTasks(
      req.user.userId,
      req.user.companyId,
      filters,
    );
  }

  /** Team Lead, Department Head (or CEO) reviews a submitted task (APPROVE or REJECT). */
  @ApiOperation({ summary: "Team Lead, Department Head (or CEO) reviews a submitted task (APPROVE or REJECT)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id/review")
  review(
    @Param("id") taskId: string,
    @Body() dto: ReviewTaskDto,
    @Request() req,
  ) {
    return this.tasksService.reviewTask(
      taskId,
      dto,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** DEPARTMENT_HEAD: view all tasks across teams in their department. */
  @ApiOperation({ summary: "DEPARTMENT_HEAD: view all tasks across teams in their department." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD)
  @Get("department")
  findDepartmentTasks(@Query() filters: TaskFilterDto, @Request() req) {
    return this.tasksService.findDepartmentTasks(
      req.user.userId,
      req.user.companyId,
      req.user.role,
      filters,
    );
  }

  // ──────────────────────────────────────────────
  // Employee endpoints
  // ──────────────────────────────────────────────

  /** Employee views all tasks assigned to them (filterable). */
  @ApiOperation({ summary: "Employee views all tasks assigned to them (filterable)." })
  @Roles(Role.EMPLOYEE)
  @Get("my")
  findMyTasks(@Query() filters: TaskFilterDto, @Request() req) {
    return this.tasksService.findMyTasks(req.user.userId, filters);
  }

  /** Employee updates their task status (strict lifecycle). */
  @ApiOperation({ summary: "Employee updates their task status (strict lifecycle)." })
  @Roles(Role.EMPLOYEE)
  @Patch(":id/status")
  updateStatus(
    @Param("id") taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @Request() req,
  ) {
    return this.tasksService.updateStatus(taskId, dto, req.user.userId, req.user.companyId);
  }

  // ──────────────────────────────────────────────
  // Shared endpoints
  // ──────────────────────────────────────────────

  /** Any authenticated user can view a single task (scoped by their role). */
  @ApiOperation({ summary: "Any authenticated user can view a single task (scoped by their role)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get(":id")
  findOne(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.findOne(taskId, req.user.userId, req.user.role, req.user.companyId);
  }

  /** CEO, Department Head, or Team Lead can view a task's full change history. */
  @ApiOperation({ summary: "CEO, Department Head, or Team Lead can view a task's full change history." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Get(":id/history")
  getHistory(@Param("id") taskId: string) {
    return this.taskHistoryService.getHistoryForTask(taskId);
  }
}
