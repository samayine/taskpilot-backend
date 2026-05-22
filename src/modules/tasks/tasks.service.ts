import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { ReorderTasksDto } from "./dto/reorder-tasks.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ReviewTaskDto, ReviewDecision } from "./dto/review-task.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskHistoryService } from "../task-history/task-history.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { TaskFilterDto } from "./dto/task-filter.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { NotificationType, Prisma, Role, TaskAction, TaskStatus } from "@prisma/client";

/**
 * Allowed status transitions — the strict task lifecycle.
 *
 *  PENDING      → IN_PROGRESS   (Employee starts)
 *  IN_PROGRESS  → SUBMITTED     (Employee submits)
 *  SUBMITTED    → REVIEW        (Team Lead picks up)
 *  REVIEW       → COMPLETED     (Team Lead approves)
 *  REVIEW       → REJECTED      (Team Lead rejects)
 *  REJECTED     → IN_PROGRESS   (Employee reworks)
 */
const EMPLOYEE_TRANSITIONS: Record<TaskStatus, TaskStatus | null> = {
  PENDING: TaskStatus.IN_PROGRESS,
  IN_PROGRESS: TaskStatus.SUBMITTED,
  SUBMITTED: null,      // employee cannot change once submitted
  REVIEW: null,         // team lead territory
  COMPLETED: null,      // terminal state
  REJECTED: TaskStatus.IN_PROGRESS,
  CANCELLED: null,      // terminal — only a manager can reopen
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly taskHistory: TaskHistoryService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // Whether a user may perform team-lead actions on a team:
  //  - CEO: always (super-power)
  //  - the team's own team lead: always
  //  - DEPARTMENT_HEAD: if the team is in / shares one of their departments
  private async canActAsLead(
    team: {
      id: string;
      teamLeadId: string;
      departmentId: string | null;
      isShared: boolean;
    },
    userId: string,
    role: Role,
  ): Promise<boolean> {
    if (role === Role.CEO) return true;
    if (team.teamLeadId === userId) return true;

    if (role === Role.DEPARTMENT_HEAD) {
      const headedDepts = await this.prisma.department.findMany({
        where: { headId: userId },
        select: { id: true },
      });
      const deptIds = new Set(headedDepts.map((d) => d.id));

      if (!team.isShared) {
        return !!team.departmentId && deptIds.has(team.departmentId);
      }
      const shared = await this.prisma.teamDepartment.findMany({
        where: { teamId: team.id },
        select: { departmentId: true },
      });
      return shared.some((sd) => deptIds.has(sd.departmentId));
    }

    return false;
  }

  // ──────────────────────────────────────────────
  // Team Lead / Department Head / CEO: Create & assign a task
  // ──────────────────────────────────────────────

  async createTask(
    dto: CreateTaskDto,
    creatorId: string,
    companyId: string,
    callerRole: Role,
  ) {
    // 1. Validate the team exists and the caller may act as its lead
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    if (!(await this.canActAsLead(team, creatorId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to create tasks for this team",
      );
    }

    // 2. Validate the assignee is a member of this team and is an EMPLOYEE
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
    });

    if (!assignee || assignee.companyId !== companyId) {
      throw new NotFoundException("Assignee not found");
    }

    if (assignee.role !== Role.EMPLOYEE) {
      throw new BadRequestException("Tasks can only be assigned to employees");
    }

    const isMember = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: dto.assigneeId, teamId: dto.teamId },
      },
    });

    if (!isMember) {
      throw new BadRequestException(
        "Assignee is not a member of the specified team",
      );
    }

    // 3. Resolve the tagged department.
    //    Shared teams require a tag that is one of the involved departments;
    //    normal teams default to the team's own department.
    let taggedDepartmentId: string | null;
    if (team.isShared) {
      if (!dto.taggedDepartmentId) {
        throw new BadRequestException(
          "A department tag is required for tasks in a shared team",
        );
      }
      const involved = await this.prisma.teamDepartment.findUnique({
        where: {
          teamId_departmentId: {
            teamId: dto.teamId,
            departmentId: dto.taggedDepartmentId,
          },
        },
      });
      if (!involved) {
        throw new BadRequestException(
          "The tagged department is not part of this shared team",
        );
      }
      taggedDepartmentId = dto.taggedDepartmentId;
    } else {
      taggedDepartmentId = dto.taggedDepartmentId ?? team.departmentId;
    }

    // 4. Create the task
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        teamId: dto.teamId,
        creatorId,
        assigneeId: dto.assigneeId,
        taggedDepartmentId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        creator: { select: { id: true, fullName: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // 4. Auto-watch: creator and assignee follow the task
    await this.addWatchers(task.id, [creatorId, dto.assigneeId]);

    // 5. Notify the assignee
    await this.notifications.notify(
      dto.assigneeId,
      NotificationType.TASK_ASSIGNED,
      `You have been assigned a new task: "${task.title}" in team ${task.team.name}`,
      task.id,
    );

    // 5. Record history
    await this.taskHistory.record(task.id, creatorId, TaskAction.CREATED, null, {
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: dto.assigneeId,
      teamId: dto.teamId,
    });

    // 6. Activity log
    await this.activityLog.logAction(
      creatorId,
      companyId,
      "TASK_CREATED",
      "Task",
      task.id,
      { title: task.title, assigneeId: dto.assigneeId },
    );

    this.notifications.emitTaskEvent(companyId);
    return task;
  }

  // ──────────────────────────────────────────────
  // Team Lead: View all tasks for their team
  // ──────────────────────────────────────────────

  async findTeamTasks(userId: string, companyId: string, filters: TaskFilterDto) {
    // Find all teams this user leads
    const teams = await this.prisma.team.findMany({
      where: { teamLeadId: userId, companyId },
      select: { id: true },
    });

    const teamIds = teams.map((t) => t.id);
    const where: Prisma.TaskWhereInput = {
      teamId: { in: teamIds },
      ...this.buildTaskFilters(filters),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true, isShared: true } },
          taggedDepartment: { select: { id: true, name: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Employee: View my assigned tasks
  // ──────────────────────────────────────────────

  async findMyTasks(userId: string, filters: TaskFilterDto) {
    const where: Prisma.TaskWhereInput = {
      assigneeId: userId,
      ...this.buildTaskFilters(filters),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          team: { select: { id: true, name: true, isShared: true } },
          creator: { select: { id: true, fullName: true } },
          assignee: { select: { id: true, fullName: true, email: true } },
          taggedDepartment: { select: { id: true, name: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Employee: Update task status (strict lifecycle)
  // ──────────────────────────────────────────────

  async updateStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    userId: string,
    companyId: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    // Ownership check: only the assigned employee can update
    if (task.assigneeId !== userId) {
      throw new ForbiddenException("You can only update tasks assigned to you");
    }

    // Strict lifecycle: check if the transition is valid
    const allowedNext = EMPLOYEE_TRANSITIONS[task.status];

    if (allowedNext === null) {
      throw new BadRequestException(
        `Cannot change status from ${task.status} — not an employee action`,
      );
    }

    if (dto.status !== allowedNext) {
      throw new BadRequestException(
        `Invalid transition: ${task.status} → ${dto.status}. Expected: ${task.status} → ${allowedNext}`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: dto.status },
      include: {
        team: { select: { id: true, name: true, teamLeadId: true } },
      },
    });

    // Notify the team lead when employee submits
    if (dto.status === TaskStatus.SUBMITTED) {
      const msg = `Task "${updatedTask.title}" has been submitted for review`;
      await this.notifications.notify(
        updatedTask.team.teamLeadId,
        NotificationType.TASK_SUBMITTED,
        msg,
        taskId,
      );
      await this.notifyWatchers(taskId, NotificationType.TASK_SUBMITTED, msg, [
        userId,
        updatedTask.team.teamLeadId,
      ]);
    }

    // Notify team lead when employee starts a task
    if (dto.status === TaskStatus.IN_PROGRESS && task.status === TaskStatus.PENDING) {
      const msg = `Task "${updatedTask.title}" has been started`;
      await this.notifications.notify(
        updatedTask.team.teamLeadId,
        NotificationType.TASK_STARTED,
        msg,
        taskId,
      );
      await this.notifyWatchers(taskId, NotificationType.TASK_STARTED, msg, [
        userId,
        updatedTask.team.teamLeadId,
      ]);
    }
    // Record history for status change
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.STATUS_CHANGED,
      { status: task.status },
      { status: dto.status },
    );

    // Activity log
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_STATUS_CHANGED",
      "Task",
      taskId,
      { from: task.status, to: dto.status },
    );

    this.notifications.emitTaskEvent(companyId);
    return updatedTask;
  }

  // ──────────────────────────────────────────────
  // Team Lead: Review a submitted task
  // ──────────────────────────────────────────────

  async reviewTask(
    taskId: string,
    dto: ReviewTaskDto,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    if (task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }

    // The team lead, a department head over the team, or the CEO may review
    if (!(await this.canActAsLead(task.team, userId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to review this task",
      );
    }

    // Task must be in SUBMITTED status for team lead to move to REVIEW,
    // or in REVIEW status for team lead to approve/reject
    if (task.status === TaskStatus.SUBMITTED) {
      // Move to REVIEW first
      const updated = await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.REVIEW },
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });

      // Notify the employee that their task is being reviewed
      const reviewMsg = `Task "${task.title}" is now being reviewed`;
      await this.notifications.notify(
        task.assigneeId,
        NotificationType.TASK_IN_REVIEW,
        reviewMsg,
        taskId,
      );
      await this.notifyWatchers(
        taskId,
        NotificationType.TASK_IN_REVIEW,
        reviewMsg,
        [userId, task.assigneeId],
      );

      // Record history
      await this.taskHistory.record(
        taskId,
        userId,
        TaskAction.REVIEWED,
        { status: TaskStatus.SUBMITTED },
        { status: TaskStatus.REVIEW },
      );

      // Activity log
      await this.activityLog.logAction(
        userId,
        companyId,
        "TASK_REVIEWED",
        "Task",
        taskId,
        { from: TaskStatus.SUBMITTED, to: TaskStatus.REVIEW },
      );

      this.notifications.emitTaskEvent(companyId);
      return updated;
    }

    if (task.status !== TaskStatus.REVIEW) {
      throw new BadRequestException(
        `Cannot review a task with status ${task.status}. Task must be SUBMITTED or REVIEW.`,
      );
    }

    if (!dto.decision) {
      throw new BadRequestException(
        "A decision (APPROVE or REJECT) is required to complete the review",
      );
    }

    const newStatus =
      dto.decision === ReviewDecision.APPROVE
        ? TaskStatus.COMPLETED
        : TaskStatus.REJECTED;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // Notify the employee of the decision
    const notifType =
      dto.decision === ReviewDecision.APPROVE
        ? NotificationType.TASK_APPROVED
        : NotificationType.TASK_REJECTED;

    const message =
      dto.decision === ReviewDecision.APPROVE
        ? `Your task "${task.title}" has been approved! 🎉`
        : `Your task "${task.title}" has been rejected. Please rework and resubmit.`;

    await this.notifications.notify(task.assigneeId, notifType, message, taskId);
    await this.notifyWatchers(taskId, notifType, message, [
      userId,
      task.assigneeId,
    ]);

    // Record history
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.REVIEWED,
      { status: TaskStatus.REVIEW },
      { status: newStatus, decision: dto.decision },
    );

    // Activity log
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_REVIEWED",
      "Task",
      taskId,
      { from: TaskStatus.REVIEW, to: newStatus, decision: dto.decision },
    );

    this.notifications.emitTaskEvent(companyId);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Lead / Dept Head / CEO: edit & reassign a task
  // ──────────────────────────────────────────────

  private readonly taskDetailInclude = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true } },
    team: { select: { id: true, name: true, isShared: true } },
    project: { select: { id: true, name: true } },
    taggedDepartment: { select: { id: true, name: true } },
  };

  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });
    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }
    if (!(await this.canActAsLead(task.team, userId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to edit this task",
      );
    }

    const data: Prisma.TaskUpdateInput = {};
    const changed: Record<string, any> = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
      changed.title = dto.title;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
      changed.description = true;
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
      changed.priority = dto.priority;
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      changed.dueDate = dto.dueDate ?? null;
    }

    // Reassignment
    let reassigned = false;
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
      });
      if (!assignee || assignee.companyId !== companyId) {
        throw new NotFoundException("Assignee not found");
      }
      if (assignee.role !== Role.EMPLOYEE) {
        throw new BadRequestException("Tasks can only be assigned to employees");
      }
      const member = await this.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: dto.assigneeId, teamId: task.teamId },
        },
      });
      if (!member) {
        throw new BadRequestException(
          "Assignee is not a member of the task's team",
        );
      }
      data.assignee = { connect: { id: dto.assigneeId } };
      reassigned = true;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No fields to update");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: this.taskDetailInclude,
    });

    if (reassigned) {
      await this.addWatchers(taskId, [dto.assigneeId!]);
      await this.taskHistory.record(
        taskId,
        userId,
        TaskAction.REASSIGNED,
        { assigneeId: task.assigneeId },
        { assigneeId: dto.assigneeId },
      );
      await this.notifications.notify(
        dto.assigneeId!,
        NotificationType.TASK_ASSIGNED,
        `You have been assigned the task "${updated.title}"`,
        taskId,
      );
    }
    if (Object.keys(changed).length > 0) {
      await this.taskHistory.record(
        taskId,
        userId,
        TaskAction.UPDATED,
        null,
        changed,
      );
    }
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_UPDATED",
      "Task",
      taskId,
      changed,
    );

    this.notifications.emitTaskEvent(companyId);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Lead / Dept Head / CEO: cancel a task (terminal "won't do")
  // ──────────────────────────────────────────────

  async cancelTask(
    taskId: string,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });
    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }
    if (!(await this.canActAsLead(task.team, userId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to cancel this task",
      );
    }
    if (task.status === TaskStatus.CANCELLED) {
      throw new BadRequestException("Task is already cancelled");
    }
    if (task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException("Completed tasks cannot be cancelled");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELLED },
      include: this.taskDetailInclude,
    });
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.STATUS_CHANGED,
      { status: task.status },
      { status: TaskStatus.CANCELLED },
    );
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_CANCELLED",
      "Task",
      taskId,
      { from: task.status },
    );
    this.notifications.emitTaskEvent(companyId);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Lead / Dept Head / CEO: reopen a completed/cancelled task
  // ──────────────────────────────────────────────

  async reopenTask(
    taskId: string,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });
    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }
    if (!(await this.canActAsLead(task.team, userId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to reopen this task",
      );
    }
    if (
      task.status !== TaskStatus.COMPLETED &&
      task.status !== TaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Only completed or cancelled tasks can be reopened",
      );
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.IN_PROGRESS },
      include: this.taskDetailInclude,
    });
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.STATUS_CHANGED,
      { status: task.status },
      { status: TaskStatus.IN_PROGRESS },
    );
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_REOPENED",
      "Task",
      taskId,
      { from: task.status },
    );
    this.notifications.emitTaskEvent(companyId);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Lead / Dept Head / CEO: permanently delete a task
  // ──────────────────────────────────────────────

  async deleteTask(
    taskId: string,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });
    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }
    if (!(await this.canActAsLead(task.team, userId, callerRole))) {
      throw new ForbiddenException(
        "You do not have permission to delete this task",
      );
    }

    await this.prisma.task.delete({ where: { id: taskId } });
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_DELETED",
      "Task",
      taskId,
      { title: task.title },
    );
    this.notifications.emitTaskEvent(companyId);
    return { message: "Task deleted successfully" };
  }

  // ──────────────────────────────────────────────
  // Lead / Dept Head / CEO: persist a column's manual order
  // ──────────────────────────────────────────────

  async reorderTasks(
    dto: ReorderTasksDto,
    userId: string,
    companyId: string,
    callerRole: Role,
  ) {
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: dto.orderedIds } },
      include: { team: true },
    });

    if (tasks.length !== new Set(dto.orderedIds).size) {
      throw new NotFoundException("One or more tasks were not found");
    }

    for (const task of tasks) {
      if (task.team.companyId !== companyId) {
        throw new NotFoundException("Task not found");
      }
      if (task.status !== dto.status) {
        throw new BadRequestException(
          "All tasks must belong to the column being reordered",
        );
      }
      if (!(await this.canActAsLead(task.team, userId, callerRole))) {
        throw new ForbiddenException(
          "You do not have permission to reorder these tasks",
        );
      }
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.task.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );

    this.notifications.emitTaskEvent(companyId);
    return { message: "Order updated" };
  }

  // ──────────────────────────────────────────────
  // Watchers (followers)
  // ──────────────────────────────────────────────

  // Verify the caller may view a task (assignee, creator, team lead, dept head
  // over the team, or CEO) and return the task with its team.
  private async assertCanAccessTask(
    taskId: string,
    userId: string,
    companyId: string,
    role: Role,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });
    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }
    const allowed =
      role === Role.CEO ||
      task.assigneeId === userId ||
      task.creatorId === userId ||
      (await this.canActAsLead(task.team, userId, role));
    if (!allowed) {
      throw new ForbiddenException("You do not have access to this task");
    }
    return task;
  }

  // Add users as watchers (idempotent).
  private async addWatchers(taskId: string, userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await this.prisma.taskWatcher.createMany({
      data: unique.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }

  // Notify all watchers of a task except the excluded users (actor + anyone
  // already notified directly).
  private async notifyWatchers(
    taskId: string,
    type: NotificationType,
    message: string,
    excludeIds: string[],
  ) {
    const watchers = await this.prisma.taskWatcher.findMany({
      where: { taskId },
      select: { userId: true },
    });
    const exclude = new Set(excludeIds);
    await Promise.all(
      watchers
        .filter((w) => !exclude.has(w.userId))
        .map((w) => this.notifications.notify(w.userId, type, message, taskId)),
    );
  }

  async watchTask(
    taskId: string,
    userId: string,
    companyId: string,
    role: Role,
  ) {
    await this.assertCanAccessTask(taskId, userId, companyId, role);
    await this.prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });
    return { watching: true };
  }

  async unwatchTask(
    taskId: string,
    userId: string,
    companyId: string,
    role: Role,
  ) {
    await this.assertCanAccessTask(taskId, userId, companyId, role);
    await this.prisma.taskWatcher.deleteMany({ where: { taskId, userId } });
    return { watching: false };
  }

  async getWatchers(
    taskId: string,
    userId: string,
    companyId: string,
    role: Role,
  ) {
    await this.assertCanAccessTask(taskId, userId, companyId, role);
    return this.prisma.taskWatcher.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // ──────────────────────────────────────────────
  // Department Head: View all tasks across department teams
  // ──────────────────────────────────────────────

  async findDepartmentTasks(
    userId: string,
    companyId: string,
    role: Role,
    filters: TaskFilterDto,
  ) {
    const filterConditions = this.buildTaskFilters(filters);
    let where: Prisma.TaskWhereInput;

    if (role === Role.CEO) {
      // CEO sees all tasks across all teams in the company
      where = {
        ...filterConditions,
        team: { companyId },
      };
    } else {
      // Department head: tasks in their own department's teams, plus tasks in
      // shared teams that are tagged for one of their departments.
      const departments = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        include: { teams: { select: { id: true } } },
      });

      const teamIds = departments.flatMap((d) => d.teams.map((t) => t.id));
      const deptIds = departments.map((d) => d.id);

      if (teamIds.length === 0 && deptIds.length === 0) {
        return paginate([], 0, filters);
      }

      where = {
        ...filterConditions,
        OR: [
          { teamId: { in: teamIds } },
          {
            team: { isShared: true },
            taggedDepartmentId: { in: deptIds },
          },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          creator: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true, isShared: true } },
          project: { select: { id: true, name: true } },
          taggedDepartment: { select: { id: true, name: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Shared: Get a single task by ID
  // ──────────────────────────────────────────────

  async findOne(taskId: string, userId: string, role: Role, companyId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, fullName: true, email: true, role: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        team: {
          select: {
            id: true,
            name: true,
            companyId: true,
            departmentId: true,
            isShared: true,
          },
        },
        project: { select: { id: true, name: true } },
        taggedDepartment: { select: { id: true, name: true } },
        watchers: { where: { userId }, select: { id: true } },
        _count: { select: { watchers: true } },
      },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    // Company isolation: prevent cross-company access
    if ((task.team as any).companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }

    // Employees can only view tasks assigned to them
    if (role === Role.EMPLOYEE && task.assigneeId !== userId) {
      throw new ForbiddenException("You can only view tasks assigned to you");
    }

    // Team leads can only view tasks in their team
    if (role === Role.TEAM_LEAD && task.creatorId !== userId) {
      // Check if they lead this team
      const team = await this.prisma.team.findUnique({
        where: { id: task.teamId },
      });
      if (!team || team.teamLeadId !== userId) {
        throw new ForbiddenException("You can only view tasks from your team");
      }
    }

    // Department heads can view tasks in their department's teams, plus tasks
    // in shared teams that are tagged for one of their departments.
    if (role === Role.DEPARTMENT_HEAD) {
      const headedDepts = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const deptIds = new Set(headedDepts.map((d) => d.id));
      const team = task.team as any;

      const allowed = team.isShared
        ? !!task.taggedDepartmentId && deptIds.has(task.taggedDepartmentId)
        : !!team.departmentId && deptIds.has(team.departmentId);

      if (!allowed) {
        throw new ForbiddenException(
          "You can only view tasks in your department's teams",
        );
      }
    }

    const { watchers, _count, ...rest } = task as typeof task & {
      watchers: { id: string }[];
      _count: { watchers: number };
    };
    return {
      ...rest,
      isWatching: watchers.length > 0,
      watcherCount: _count.watchers,
    };
  }

  // ──────────────────────────────────────────────
  // Private: Build dynamic filter conditions
  // ──────────────────────────────────────────────

  private buildTaskFilters(filters: TaskFilterDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.search) {
      where.title = { contains: filters.search, mode: "insensitive" };
    }

    return where;
  }
}

