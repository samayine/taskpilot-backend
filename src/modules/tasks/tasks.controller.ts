import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { Role } from "@prisma/client";

@Controller("tasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ──────────────────────────────────────────────
  // Team Lead endpoints
  // ──────────────────────────────────────────────

  /** Team Lead creates and assigns a task to an employee. */
  @Roles(Role.TEAM_LEAD)
  @Post()
  create(@Body() dto: CreateTaskDto, @Request() req) {
    return this.tasksService.createTask(
      dto,
      req.user.userId,
      req.user.companyId,
    );
  }

  /** Team Lead views all tasks across their teams. */
  @Roles(Role.TEAM_LEAD)
  @Get("team")
  findTeamTasks(@Request() req) {
    return this.tasksService.findTeamTasks(
      req.user.userId,
      req.user.companyId,
    );
  }

  /** Team Lead reviews a submitted task (APPROVE or REJECT). */
  @Roles(Role.TEAM_LEAD)
  @Patch(":id/review")
  review(
    @Param("id") taskId: string,
    @Body() dto: ReviewTaskDto,
    @Request() req,
  ) {
    return this.tasksService.reviewTask(taskId, dto, req.user.userId);
  }

  // ──────────────────────────────────────────────
  // Employee endpoints
  // ──────────────────────────────────────────────

  /** Employee views all tasks assigned to them. */
  @Roles(Role.EMPLOYEE)
  @Get("my")
  findMyTasks(@Request() req) {
    return this.tasksService.findMyTasks(req.user.userId);
  }

  /** Employee updates their task status (strict lifecycle). */
  @Roles(Role.EMPLOYEE)
  @Patch(":id/status")
  updateStatus(
    @Param("id") taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @Request() req,
  ) {
    return this.tasksService.updateStatus(taskId, dto, req.user.userId);
  }

  // ──────────────────────────────────────────────
  // Shared endpoints
  // ──────────────────────────────────────────────

  /** Any authenticated user can view a single task (scoped by their role). */
  @Roles(Role.CEO, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get(":id")
  findOne(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.findOne(taskId, req.user.userId, req.user.role);
  }
}
