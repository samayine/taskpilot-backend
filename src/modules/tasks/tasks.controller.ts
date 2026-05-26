import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { ReorderTasksDto } from "./dto/reorder-tasks.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ReviewTaskDto } from "./dto/review-task.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { TaskHistoryService } from "../task-history/task-history.service";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { TaskFilterDto } from "./dto/task-filter.dto";
import { Role } from "@prisma/client";
import { ArrayUnique, IsArray, IsUUID } from "class-validator";

class SetTaskLabelsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  labelIds: string[];
}

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

  /** Team Lead views all tasks across teams they lead (filterable). CEO and DEPT_HEAD use GET /tasks/department. */
  @ApiOperation({ summary: "Team Lead views all tasks across teams they lead (filterable)." })
  @Roles(Role.TEAM_LEAD)
  @Get("team")
  findTeamTasks(@Query() filters: TaskFilterDto, @Request() req) {
    return this.tasksService.findTeamTasks(
      req.user.userId,
      req.user.companyId,
      filters,
    );
  }

  /** Team-hub view: all tasks for a specific team. Any team member can call. */
  @ApiOperation({
    summary:
      "List all tasks for a specific team (team-hub view). Accessible to team members, lead, dept-head over team, or CEO.",
  })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get("team/:teamId")
  findTeamHubTasks(
    @Param("teamId") teamId: string,
    @Query() filters: TaskFilterDto,
    @Request() req,
  ) {
    return this.tasksService.findTeamHubTasks(
      teamId,
      req.user.userId,
      req.user.role,
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

  /** Team Lead, Department Head, or CEO persists a column's manual order. */
  @ApiOperation({ summary: "Reorder tasks within a board column." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch("reorder")
  reorder(@Body() dto: ReorderTasksDto, @Request() req) {
    return this.tasksService.reorderTasks(
      dto,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Team Lead, Department Head, or CEO edits/reassigns a task. */
  @ApiOperation({ summary: "Edit a task (and optionally reassign it)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id")
  update(
    @Param("id") taskId: string,
    @Body() dto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.tasksService.updateTask(
      taskId,
      dto,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Set a task's labels (managers). */
  @ApiOperation({ summary: "Set the labels on a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Put(":id/labels")
  setLabels(
    @Param("id") taskId: string,
    @Body() dto: SetTaskLabelsDto,
    @Request() req,
  ) {
    return this.tasksService.setLabels(
      taskId,
      dto.labelIds,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Watch a task (follow its updates). */
  @ApiOperation({ summary: "Watch (follow) a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Post(":id/watch")
  watch(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.watchTask(
      taskId,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Stop watching a task. */
  @ApiOperation({ summary: "Unwatch a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Delete(":id/watch")
  unwatch(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.unwatchTask(
      taskId,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** List a task's watchers. */
  @ApiOperation({ summary: "List a task's watchers." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get(":id/watchers")
  watchers(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.getWatchers(
      taskId,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Team Lead, Department Head, or CEO cancels a task (won't do). */
  @ApiOperation({ summary: "Cancel a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id/cancel")
  cancel(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.cancelTask(
      taskId,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Team Lead, Department Head, or CEO reopens a completed/cancelled task. */
  @ApiOperation({ summary: "Reopen a completed or cancelled task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id/reopen")
  reopen(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.reopenTask(
      taskId,
      req.user.userId,
      req.user.companyId,
      req.user.role,
    );
  }

  /** Team Lead, Department Head, or CEO permanently deletes a task. */
  @ApiOperation({ summary: "Delete a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Delete(":id")
  remove(@Param("id") taskId: string, @Request() req) {
    return this.tasksService.deleteTask(
      taskId,
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
  async getHistory(@Param("id") taskId: string, @Request() req) {
    const history = await this.taskHistoryService.getHistoryForTask(
      taskId,
      req.user.companyId,
    );
    if (!history) throw new NotFoundException("Task not found");
    return history;
  }
}
