import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { SubtasksService } from "./subtasks.service";
import { CreateSubtaskDto } from "./dto/create-subtask.dto";
import { UpdateSubtaskDto } from "./dto/update-subtask.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Subtasks")
@ApiBearerAuth("JWT")
@Controller("tasks/:taskId/subtasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  /** List a task's subtasks (checklist). */
  @ApiOperation({ summary: "List a task's subtasks." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get()
  findAll(@Param("taskId") taskId: string, @Request() req) {
    return this.subtasksService.findByTask(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Add a subtask to a task. */
  @ApiOperation({ summary: "Add a subtask." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Post()
  create(
    @Param("taskId") taskId: string,
    @Body() dto: CreateSubtaskDto,
    @Request() req,
  ) {
    return this.subtasksService.create(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Update a subtask (rename or toggle done). */
  @ApiOperation({ summary: "Update a subtask." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Patch(":id")
  update(
    @Param("taskId") taskId: string,
    @Param("id") id: string,
    @Body() dto: UpdateSubtaskDto,
    @Request() req,
  ) {
    return this.subtasksService.update(
      taskId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Delete a subtask. */
  @ApiOperation({ summary: "Delete a subtask." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Delete(":id")
  remove(
    @Param("taskId") taskId: string,
    @Param("id") id: string,
    @Request() req,
  ) {
    return this.subtasksService.remove(
      taskId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
